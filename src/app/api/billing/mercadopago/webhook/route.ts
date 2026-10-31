import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { mercadoPagoConfigurado } from '@/lib/mercadopago';

export const runtime = 'nodejs';

function assinaturaValida(signature: string, requestId: string, dataId: string, secret: string) {
  const parts = Object.fromEntries(signature.split(',').map((item) => {
    const separator = item.indexOf('=');
    return separator < 0 ? ['', ''] : [item.slice(0, separator).trim(), item.slice(separator + 1).trim()];
  }));
  if (!parts.ts || !parts.v1) return false;
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${parts.ts};`;
  const expected = createHmac('sha256', secret).update(manifest).digest();
  let received: Buffer;
  try { received = Buffer.from(parts.v1, 'hex'); } catch { return false; }
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function POST(request: Request) {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret || !mercadoPagoConfigurado()) return NextResponse.json({ error: 'Webhook não configurado.' }, { status: 503 });

  const url = new URL(request.url);
  const dataId = url.searchParams.get('data.id') ?? url.searchParams.get('id') ?? '';
  const requestId = request.headers.get('x-request-id') ?? '';
  const signature = request.headers.get('x-signature') ?? '';
  if (!dataId || !requestId || !assinaturaValida(signature, requestId, dataId, secret)) {
    return NextResponse.json({ error: 'Assinatura inválida.' }, { status: 401 });
  }

  let event: { type?: string; topic?: string; data?: { id?: string } };
  try { event = await request.json(); } catch { return NextResponse.json({ received: true }); }
  const tipo = event.type ?? event.topic;
  if (tipo !== 'subscription_preapproval' && tipo !== 'subscription_preapproval_plan') {
    return NextResponse.json({ received: true });
  }

  try {
    const response = await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(dataId)}`, {
      headers: { Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` },
      cache: 'no-store',
    });
    if (!response.ok) {
      console.error('Falha ao consultar assinatura Mercado Pago', response.status);
      return NextResponse.json({ error: 'Não foi possível consultar a assinatura.' }, { status: 502 });
    }
    const assinatura = await response.json();
    const uid = assinatura.external_reference;
    if (typeof uid !== 'string' || !uid || typeof assinatura.status !== 'string') {
      return NextResponse.json({ received: true });
    }

    const plano = assinatura.auto_recurring?.frequency === 12 ? 'anual' : 'mensal';
    await getAdminDb().doc(`users/${uid}/assinatura/status`).set({
      status: assinatura.status,
      plano,
      mercadoPagoSubscriptionId: String(assinatura.id ?? dataId),
      proximaCobranca: assinatura.next_payment_date ?? null,
      updatedAt: new Date(),
    }, { merge: true });
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Falha ao processar webhook Mercado Pago', error);
    return NextResponse.json({ error: 'Falha ao processar notificação.' }, { status: 500 });
  }
}
