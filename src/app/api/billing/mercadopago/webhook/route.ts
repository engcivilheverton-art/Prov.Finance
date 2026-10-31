import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { mercadoPagoConfigurado } from '@/lib/mercadopago';

type FaturaAssinatura = { preapproval_id?: string };

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

async function consultarMercadoPago<T>(path: string): Promise<T> {
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    headers: { Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Mercado Pago respondeu ${response.status}.`);
  return response.json() as Promise<T>;
}

async function obterIdAssinatura(tipo: string, dataId: string): Promise<string | null> {
  if (tipo === 'subscription_preapproval') return dataId;

  if (tipo === 'subscription_authorized_payment') {
    const fatura = await consultarMercadoPago<FaturaAssinatura>(
      `/authorized_payments/${encodeURIComponent(dataId)}`,
    );
    return typeof fatura.preapproval_id === 'string' ? fatura.preapproval_id : null;
  }

  if (tipo === 'payment') {
    const resposta = await consultarMercadoPago<{ results?: FaturaAssinatura[] }>(
      `/authorized_payments/search?payment_id=${encodeURIComponent(dataId)}`,
    );
    return resposta.results?.find((fatura) => typeof fatura.preapproval_id === 'string')?.preapproval_id ?? null;
  }

  return null;
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
  const tipo = event.type ?? event.topic ?? '';

  try {
    const assinaturaId = await obterIdAssinatura(tipo, dataId);
    if (!assinaturaId) return NextResponse.json({ received: true });

    const assinatura = await consultarMercadoPago<{
      id?: string | number;
      external_reference?: string | number;
      status?: string;
      auto_recurring?: { frequency?: number };
      next_payment_date?: string | null;
    }>(`/preapproval/${encodeURIComponent(assinaturaId)}`);
    const uid = assinatura.external_reference;
    if ((typeof uid !== 'string' && typeof uid !== 'number') || !uid || typeof assinatura.status !== 'string') {
      return NextResponse.json({ received: true });
    }

    const plano = assinatura.auto_recurring?.frequency === 12 ? 'anual' : 'mensal';
    await getAdminDb().doc(`users/${String(uid)}/assinatura/status`).set({
      status: assinatura.status,
      plano,
      mercadoPagoSubscriptionId: String(assinatura.id ?? assinaturaId),
      proximaCobranca: assinatura.next_payment_date ?? null,
      updatedAt: new Date(),
    }, { merge: true });
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Falha ao processar webhook Mercado Pago', error instanceof Error ? error.message : 'erro desconhecido');
    return NextResponse.json({ error: 'Falha ao processar notificação.' }, { status: 502 });
  }
}
