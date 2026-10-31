import { NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { APP_URL, mercadoPagoConfigurado, PLANOS_ASSINATURA, type PlanoAssinatura } from '@/lib/mercadopago';

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization');
  const idToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!idToken) return NextResponse.json({ error: 'Faça login para continuar.' }, { status: 401 });
  if (!mercadoPagoConfigurado()) return NextResponse.json({ error: 'Checkout ainda não configurado.' }, { status: 503 });

  let uid: string;
  let email: string;
  try {
    const user = await getAdminAuth().verifyIdToken(idToken);
    uid = user.uid;
    if (!user.email) return NextResponse.json({ error: 'Sua conta precisa ter um e-mail válido.' }, { status: 400 });
    email = user.email;
  } catch {
    return NextResponse.json({ error: 'Sessão inválida. Entre novamente.' }, { status: 401 });
  }

  let payload: { plano?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Solicitação inválida.' }, { status: 400 });
  }
  const plano = payload.plano;
  if (plano !== 'mensal' && plano !== 'anual') {
    return NextResponse.json({ error: 'Plano inválido.' }, { status: 400 });
  }

  try {
    const assinaturaRef = getAdminDb().doc(`users/${uid}/assinatura/status`);
    const assinatura = await assinaturaRef.get();
    const assinaturaAtual = assinatura.data();
    if (assinaturaAtual?.status === 'authorized') {
      return NextResponse.json({ error: 'Sua conta já tem uma assinatura ativa.' }, { status: 409 });
    }

    const config = PLANOS_ASSINATURA[plano as PlanoAssinatura];

    if (assinaturaAtual?.status === 'pending' && assinaturaAtual.mercadoPagoSubscriptionId) {
      const atual = await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(String(assinaturaAtual.mercadoPagoSubscriptionId))}`, {
        headers: { Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` },
        cache: 'no-store',
      });
      if (atual.ok) {
        const existente = await atual.json();
        if (existente.status === 'pending' && typeof existente.init_point === 'string') {
          if (assinaturaAtual.plano !== plano) {
            return NextResponse.json({ error: `Você já iniciou o checkout do plano ${assinaturaAtual.plano}. Conclua esse pagamento antes de escolher outro plano.` }, { status: 409 });
          }
          return NextResponse.json({ initPoint: existente.init_point });
        }
      }
    }

    const mpResponse = await fetch('https://api.mercadopago.com/preapproval', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        reason: config.nome,
        external_reference: uid,
        payer_email: email,
        auto_recurring: {
          frequency: config.frequencia,
          frequency_type: config.tipoFrequencia,
          transaction_amount: config.valor,
          currency_id: 'BRL',
        },
        back_url: `${APP_URL}/assinatura/retorno`,
        notification_url: `${APP_URL}/api/billing/mercadopago/webhook`,
        status: 'pending',
      }),
      cache: 'no-store',
    });

    const result = await mpResponse.json();
    if (!mpResponse.ok || typeof result.init_point !== 'string') {
      console.error('Mercado Pago checkout error', mpResponse.status, result.message ?? result.error ?? 'unknown');
      return NextResponse.json({ error: 'O Mercado Pago não conseguiu iniciar o checkout. Tente novamente.' }, { status: 502 });
    }

    const checkoutUrl = new URL(result.init_point);
    const hostPermitido = checkoutUrl.hostname === 'mercadopago.com'
      || checkoutUrl.hostname.endsWith('.mercadopago.com')
      || checkoutUrl.hostname === 'mercadopago.com.br'
      || checkoutUrl.hostname.endsWith('.mercadopago.com.br');
    if (checkoutUrl.protocol !== 'https:' || !hostPermitido) {
      return NextResponse.json({ error: 'O Mercado Pago retornou um endereço de checkout inválido.' }, { status: 502 });
    }
    await assinaturaRef.set({
      status: 'pending',
      plano,
      mercadoPagoSubscriptionId: String(result.id),
      updatedAt: new Date(),
    }, { merge: true });

    return NextResponse.json({ initPoint: checkoutUrl.toString() });
  } catch (error) {
    console.error('Falha ao criar checkout Mercado Pago', error);
    return NextResponse.json({ error: 'Não foi possível iniciar o pagamento. Tente novamente.' }, { status: 500 });
  }
}
