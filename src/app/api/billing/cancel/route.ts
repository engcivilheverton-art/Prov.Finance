import { NextResponse } from 'next/server';
import { getPreapproval, matchesPlan, mercadoPagoAccessToken } from '@/lib/mercadopago-server';
import { readSubscription, verifyFirebaseIdToken, writeSubscription } from '@/lib/server-billing';

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization') ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  let user;
  try { user = await verifyFirebaseIdToken(token); }
  catch { return NextResponse.json({ error: 'Sua sessão expirou. Entre novamente.' }, { status: 401 }); }

  try {
    const subscription = await readSubscription(user.uid);
    if (!subscription?.preapprovalId || !['mensal', 'anual'].includes(subscription.plan)) {
      return NextResponse.json({ error: 'Não há assinatura para cancelar.' }, { status: 404 });
    }
    const current = await getPreapproval(subscription.preapprovalId);
    if (current.id !== subscription.preapprovalId || current.external_reference !== user.uid || !matchesPlan(current, subscription.plan)) {
      return NextResponse.json({ error: 'Não foi possível confirmar que essa assinatura pertence à sua conta.' }, { status: 409 });
    }
    if (current.status !== 'canceled') {
      const response = await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(subscription.preapprovalId)}`, {
        method: 'PUT',
        headers: { authorization: `Bearer ${mercadoPagoAccessToken()}`, 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'canceled' }),
        cache: 'no-store',
      });
      if (!response.ok) return NextResponse.json({ error: 'O Mercado Pago não conseguiu cancelar a assinatura. Tente novamente.' }, { status: 502 });
    }
    const confirmed = await getPreapproval(subscription.preapprovalId);
    if (confirmed.id !== subscription.preapprovalId || confirmed.external_reference !== user.uid || confirmed.status !== 'canceled') {
      return NextResponse.json({ error: 'O cancelamento foi solicitado, mas ainda não foi confirmado pelo Mercado Pago.' }, { status: 202 });
    }
    await writeSubscription(user.uid, { ...subscription, status: confirmed.status, providerVersion: confirmed.version });
    return NextResponse.json({ status: confirmed.status });
  } catch (error) {
    console.error('Subscription cancellation error:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: 'Não foi possível cancelar a assinatura neste momento.' }, { status: 503 });
  }
}
