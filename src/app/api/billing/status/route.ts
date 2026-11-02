import { NextResponse } from 'next/server';
import { getLatestAuthorizedInvoice, getPreapproval, hasConfirmedLatestInvoice, matchesPlan } from '@/lib/mercadopago-server';
import { readSubscription, verifyFirebaseIdToken, writeSubscription } from '@/lib/server-billing';

export async function GET(request: Request) {
  const authorization = request.headers.get('authorization') ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  let user;
  try { user = await verifyFirebaseIdToken(token); }
  catch { return NextResponse.json({ error: 'Sua sessão expirou. Entre novamente.' }, { status: 401 }); }

  try {
    let subscription = await readSubscription(user.uid);
    let remotePlanValid = false;
    let latestInvoice = null;
    if (subscription?.preapprovalId) {
      const remote = await getPreapproval(subscription.preapprovalId);
      const belongsToUser = remote.id === subscription.preapprovalId && remote.external_reference === user.uid;
      const validPlan = matchesPlan(remote, subscription.plan);
      remotePlanValid = belongsToUser && validPlan;
      const status = belongsToUser && validPlan ? remote.status ?? 'unknown' : 'inconsistent';
      if (status !== subscription.status || remote.version !== subscription.providerVersion) {
        await writeSubscription(user.uid, { ...subscription, status, providerVersion: remote.version });
      }
      subscription = { ...subscription, status, providerVersion: remote.version };
      if (remotePlanValid && remote.status === 'authorized') latestInvoice = await getLatestAuthorizedInvoice(subscription.preapprovalId!);
    }

    const invoiceConfirmed = hasConfirmedLatestInvoice(latestInvoice);
    const premium = remotePlanValid && subscription?.status === 'authorized' && invoiceConfirmed;
    return NextResponse.json({
      tier: premium ? 'premium' : 'free',
      status: subscription?.status ?? 'free',
      paymentStatus: latestInvoice?.payment?.status ?? latestInvoice?.summarized ?? (subscription?.preapprovalId ? 'pending' : 'none'),
      plan: premium ? subscription?.plan : null,
    }, { headers: { 'cache-control': 'no-store, max-age=0' } });
  } catch (error) {
    console.error('Subscription status error:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: 'Não foi possível consultar o status da assinatura.' }, { status: 503 });
  }
}
