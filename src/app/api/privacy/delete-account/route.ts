import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { getPreapproval, matchesPlan, mercadoPagoAccessToken } from '@/lib/mercadopago-server';
import { readSubscription, verifyFirebaseIdToken } from '@/lib/server-billing';

export const maxDuration = 60;

function respostaErro(error: string, status: number, code?: string) {
  return NextResponse.json({ error, ...(code ? { code } : {}) }, { status, headers: { 'cache-control': 'no-store' } });
}

async function cancelarAssinaturaSeNecessario(uid: string) {
  const subscription = await readSubscription(uid);
  if (!subscription?.preapprovalId) return;

  const current = await getPreapproval(subscription.preapprovalId);
  if (current.id !== subscription.preapprovalId || current.external_reference !== uid || !matchesPlan(current, subscription.plan)) {
    throw new Error('SUBSCRIPTION_OWNERSHIP_MISMATCH');
  }

  if (current.status !== 'canceled') {
    const response = await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(subscription.preapprovalId)}`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${mercadoPagoAccessToken()}`, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'canceled' }),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('SUBSCRIPTION_CANCEL_FAILED');
  }

  const confirmed = await getPreapproval(subscription.preapprovalId);
  if (confirmed.id !== subscription.preapprovalId || confirmed.external_reference !== uid || confirmed.status !== 'canceled') {
    throw new Error('SUBSCRIPTION_CANCEL_NOT_CONFIRMED');
  }
}

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization') ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return respostaErro('Entre na sua conta para solicitar a exclusão.', 401);

  let user;
  try { user = await verifyFirebaseIdToken(token); }
  catch { return respostaErro('Sua sessão expirou. Entre novamente.', 401); }

  if (!user.authTime || Math.floor(Date.now() / 1000) - user.authTime > 10 * 60) {
    return respostaErro('Por segurança, saia da conta, entre novamente e repita a solicitação.', 401, 'RECENT_LOGIN_REQUIRED');
  }

  const body = await request.json().catch(() => ({})) as { confirmEmail?: unknown };
  if (typeof user.email !== 'string' || typeof body.confirmEmail !== 'string'
    || body.confirmEmail.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
    return respostaErro('Digite o mesmo e-mail usado nesta conta para confirmar a exclusão.', 400);
  }

  try {
    await cancelarAssinaturaSeNecessario(user.uid);
    const ref = adminDb().doc(`users/${user.uid}`);
    await adminDb().recursiveDelete(ref);
    await adminAuth().deleteUser(user.uid);
    return NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'SUBSCRIPTION_OWNERSHIP_MISMATCH') {
      return respostaErro('Não foi possível confirmar a assinatura da conta. Os dados foram mantidos; entre em contato com o suporte.', 409);
    }
    if (code === 'SUBSCRIPTION_CANCEL_FAILED' || code === 'SUBSCRIPTION_CANCEL_NOT_CONFIRMED') {
      return respostaErro('Não foi possível confirmar o cancelamento da assinatura. Os dados foram mantidos; tente novamente ou fale com o suporte.', 502);
    }
    console.error('Account deletion failed', { errorName: error instanceof Error ? error.name : 'unknown' });
    return respostaErro('Não foi possível concluir a exclusão. Tente novamente; se persistir, fale com o suporte.', 503);
  }
}
