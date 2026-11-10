import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { PLANOS, planoValido } from '@/lib/planos';
import { appBaseUrl, getPreapproval, matchesPlan, mercadoPagoAccessToken } from '@/lib/mercadopago-server';
import {
  finishSubscriptionCheckout,
  isComplimentaryPremiumUser,
  readSubscription,
  releaseSubscriptionCheckout,
  reserveSubscriptionCheckout,
  verifyFirebaseIdToken,
  writeSubscription,
} from '@/lib/server-billing';

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization') ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return NextResponse.json({ error: 'Faça login para continuar.' }, { status: 401 });

  let user: Awaited<ReturnType<typeof verifyFirebaseIdToken>>;
  try { user = await verifyFirebaseIdToken(token); }
  catch { return NextResponse.json({ error: 'Sua sessão expirou. Entre novamente.' }, { status: 401 }); }
  if (isComplimentaryPremiumUser(user)) {
    return NextResponse.json({ error: 'Sua conta já tem acesso Premium concedido.' }, { status: 409 });
  }

  const body = await request.json().catch(() => ({})) as { plan?: unknown };
  if (!planoValido(body.plan)) return NextResponse.json({ error: 'Plano inválido.' }, { status: 400 });
  const planId = body.plan;
  const plan = PLANOS[planId];

  try {
    const appUrl = appBaseUrl();
    const accessToken = mercadoPagoAccessToken();
    const current = await readSubscription(user.uid);

    if (current?.preapprovalId && current.status === 'authorized') {
      const remote = await getPreapproval(current.preapprovalId);
      if (remote.id === current.preapprovalId && remote.external_reference === user.uid && remote.status === 'authorized' && matchesPlan(remote, current.plan)) {
        return NextResponse.json({ error: 'Sua assinatura Premium já está ativa.' }, { status: 409 });
      }
      if (remote.id === current.preapprovalId && remote.external_reference === user.uid) {
        await writeSubscription(user.uid, { ...current, status: remote.status ?? 'unknown', providerVersion: remote.version });
      }
    }

    if (current?.preapprovalId && current.status === 'pending' && current.plan === planId && current.checkoutUrl) {
      const remote = await getPreapproval(current.preapprovalId);
      if (remote.id === current.preapprovalId && remote.external_reference === user.uid && remote.status === 'pending' && matchesPlan(remote, planId) && remote.init_point === current.checkoutUrl) {
        return NextResponse.json({ checkoutUrl: current.checkoutUrl });
      }
      if (remote.id === current.preapprovalId && remote.external_reference === user.uid) {
        await writeSubscription(user.uid, { ...current, status: remote.status ?? 'unknown', providerVersion: remote.version });
      }
    }

    const attemptId = randomUUID();
    const reservation = await reserveSubscriptionCheckout(user.uid, planId, attemptId);
    if (reservation.kind === 'active') return NextResponse.json({ error: 'Sua assinatura Premium já está ativa.' }, { status: 409 });
    if (reservation.kind === 'existing') {
      const remote = await getPreapproval(reservation.preapprovalId);
      if (remote.id === reservation.preapprovalId && remote.external_reference === user.uid && remote.status === 'pending' && matchesPlan(remote, planId) && remote.init_point === reservation.checkoutUrl) {
        return NextResponse.json({ checkoutUrl: reservation.checkoutUrl });
      }
      return NextResponse.json({ error: 'O checkout anterior não está mais pendente. Atualize a página e escolha o plano novamente.' }, { status: 409 });
    }
    if (reservation.kind === 'busy') return NextResponse.json({ error: 'Já existe uma contratação em andamento. Aguarde um instante e tente novamente.' }, { status: 409 });

    try {
      const payerEmail = process.env.VERCEL_ENV === 'production'
        ? user.email
        : (process.env.MERCADOPAGO_TEST_PAYER_EMAIL ?? '').trim() || user.email;
      if (!payerEmail) {
        await releaseSubscriptionCheckout(user.uid, attemptId);
        return NextResponse.json({ error: 'A conta precisa ter um e-mail para iniciar a assinatura.' }, { status: 400 });
      }

      const response = await fetch('https://api.mercadopago.com/preapproval', {
        method: 'POST',
        headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          reason: `PROV. ${plan.nome}`,
          external_reference: user.uid,
          payer_email: payerEmail,
          // Mercado Pago appends its own preapproval_id query parameter to
          // back_url. Keep this URL query-free so the return URL stays valid.
          back_url: `${appUrl}/assinatura/retorno`,
          auto_recurring: { frequency: plan.frequencia, frequency_type: plan.frequenciaTipo, transaction_amount: plan.valor, currency_id: 'BRL' },
          status: 'pending',
        }),
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({})) as { id?: string; init_point?: string; message?: string; error?: string };
      if (!response.ok || !data.id || !data.init_point) {
        console.error('Mercado Pago checkout creation failed:', response.status, data.error ?? data.message ?? 'unexpected response');
        await releaseSubscriptionCheckout(user.uid, attemptId);
        return NextResponse.json({ error: 'Não foi possível iniciar o checkout. Confira as credenciais e a configuração do Mercado Pago.' }, { status: 502 });
      }

      const saved = await finishSubscriptionCheckout(user.uid, attemptId, {
        status: 'pending', plan: plan.id, preapprovalId: data.id, checkoutUrl: data.init_point,
      });
      if (!saved) return NextResponse.json({ error: 'O checkout foi criado, mas a sessão mudou. Consulte seus planos e tente novamente.' }, { status: 409 });
      return NextResponse.json({ checkoutUrl: data.init_point });
    } catch (error) {
      await releaseSubscriptionCheckout(user.uid, attemptId).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    console.error('Checkout error:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: 'Não foi possível preparar o checkout. Verifique a configuração do backend na Vercel.' }, { status: 503 });
  }
}
