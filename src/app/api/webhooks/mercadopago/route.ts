import { after, NextResponse } from 'next/server';
import { getPreapproval, matchesPlan, mercadoPagoAccessToken } from '@/lib/mercadopago-server';
import { hasValidWebhookSignature, readSubscription, recordSubscriptionWebhookEvent } from '@/lib/server-billing';

type Notification = { type?: string; action?: string; data?: { id?: string | number } };
type AuthorizedInvoice = {
  id?: number | string;
  preapproval_id?: string;
  status?: string;
  payment?: { status?: string; status_detail?: string };
};

async function loadAuthorizedInvoice(id: string): Promise<AuthorizedInvoice> {
  const response = await fetch(`https://api.mercadopago.com/authorized_payments/${encodeURIComponent(id)}`, {
    headers: { authorization: `Bearer ${mercadoPagoAccessToken()}` }, cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Falha ao consultar fatura recorrente (${response.status}).`);
  return await response.json() as AuthorizedInvoice;
}

async function processNotification(input: { type: string; id: string; requestId: string }) {
  let preapprovalId = input.id;
  let paymentStatus: string | undefined;
  let paymentStatusDetail: string | undefined;

  if (input.type === 'subscription_authorized_payment') {
    const invoice = await loadAuthorizedInvoice(input.id);
    if (String(invoice.id) !== input.id || !invoice.preapproval_id) throw new Error('Fatura de assinatura sem associação válida.');
    preapprovalId = invoice.preapproval_id;
    paymentStatus = invoice.payment?.status ?? invoice.status;
    paymentStatusDetail = invoice.payment?.status_detail;
  }

  const remote = await getPreapproval(preapprovalId);
  const uid = remote.external_reference ?? '';
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid) || remote.id !== preapprovalId) {
    console.warn('Mercado Pago webhook ignored: invalid owner reference.');
    return;
  }
  const current = await readSubscription(uid);
  if (!current || current.preapprovalId !== preapprovalId || !['mensal', 'anual'].includes(current.plan)) {
    console.warn('Mercado Pago webhook ignored: subscription is not linked to a local user.');
    return;
  }

  const consistent = matchesPlan(remote, current.plan);
  const result = await recordSubscriptionWebhookEvent({
    uid,
    preapprovalId,
    plan: current.plan,
    status: consistent ? remote.status ?? 'unknown' : 'inconsistent',
    providerVersion: remote.version,
    type: input.type,
    requestId: input.requestId,
    resourceId: input.id,
    ...(paymentStatus ? { paymentStatus } : {}),
  });
  console.info('Mercado Pago subscription notification:', {
    type: input.type,
    result,
    subscriptionStatus: consistent ? remote.status ?? 'unknown' : 'inconsistent',
    paymentStatus,
    paymentStatusDetail,
  });
}

export async function POST(request: Request) {
  const secret = (process.env.MERCADOPAGO_WEBHOOK_SECRET ?? '').trim();
  if (!secret) return NextResponse.json({ error: 'Webhook não configurado.' }, { status: 503 });

  const url = new URL(request.url);
  const body = await request.json().catch(() => ({})) as Notification;
  const id = String(body.data?.id ?? url.searchParams.get('data.id') ?? '');
  const type = body.type ?? url.searchParams.get('type') ?? url.searchParams.get('topic') ?? '';
  const signature = request.headers.get('x-signature') ?? '';
  const requestId = request.headers.get('x-request-id') ?? '';
  if (!id || !requestId) return NextResponse.json({ error: 'Notificação incompleta.' }, { status: 400 });

  if (!hasValidWebhookSignature({ signature, requestId, dataId: id, secret })) {
    return NextResponse.json({ error: 'Assinatura do webhook inválida.' }, { status: 401 });
  }

  if (!['subscription_preapproval', 'preapproval', 'subscription_authorized_payment'].includes(type)) {
    return NextResponse.json({ received: true });
  }

  after(async () => {
    try { await processNotification({ type, id, requestId }); }
    catch (error) {
      console.error('Mercado Pago webhook processing error:', error instanceof Error ? error.message : 'unknown');
    }
  });
  return NextResponse.json({ received: true });
}
