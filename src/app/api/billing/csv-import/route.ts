import { NextResponse } from 'next/server';
import { getLatestAuthorizedInvoice, getPreapproval, hasConfirmedLatestInvoice, matchesPlan } from '@/lib/mercadopago-server';
import { commitFirestoreDocuments, getFirestoreDocument, listFirestoreCollection, readSubscription, verifyFirebaseIdToken, writeSubscription } from '@/lib/server-billing';

type ItemCsv = { data: string; descricao: string; parcela?: string; valor: number; programado?: boolean };
function hash(texto: string): string {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) { h ^= texto.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}
function identificar(itens: ItemCsv[]) {
  const vistos = new Map<string, number>();
  return itens.map((item) => {
    const base = `${item.programado ? 'P' : 'L'}|${item.data}|${item.descricao}|${item.valor.toFixed(2)}`;
    const n = (vistos.get(base) ?? 0) + 1;
    vistos.set(base, n);
    return { ...item, id: `${hash(base)}-${n}` };
  });
}
function totalGastos(itens: Record<string, unknown>[]) {
  const total = itens.filter((item) => item.programado !== true && typeof item.valor === 'number' && item.valor > 0)
    .reduce((sum, item) => sum + Number(item.valor), 0);
  return Math.round((total + Number.EPSILON) * 100) / 100;
}

async function confirmarPremium(uid: string) {
  const assinatura = await readSubscription(uid);
  if (!assinatura?.preapprovalId) return false;
  const remote = await getPreapproval(assinatura.preapprovalId);
  if (remote.id !== assinatura.preapprovalId || remote.external_reference !== uid || !matchesPlan(remote, assinatura.plan)) return false;
  if (remote.status !== 'authorized') {
    await writeSubscription(uid, { ...assinatura, status: remote.status ?? 'unknown', providerVersion: remote.version });
    return false;
  }
  const latestInvoice = await getLatestAuthorizedInvoice(assinatura.preapprovalId);
  if (!hasConfirmedLatestInvoice(latestInvoice)) return false;
  if (assinatura.status !== remote.status || assinatura.providerVersion !== remote.version) {
    await writeSubscription(uid, { ...assinatura, status: remote.status, providerVersion: remote.version });
  }
  return true;
}

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get('authorization') ?? '';
    const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!idToken) return NextResponse.json({ error: 'Faça login para continuar.' }, { status: 401 });
    let user;
    try { user = await verifyFirebaseIdToken(idToken); }
    catch { return NextResponse.json({ error: 'Sua sessão expirou. Entre novamente.' }, { status: 401 }); }
    if (!await confirmarPremium(user.uid)) return NextResponse.json({ error: 'A assinatura Premium não está ativa ou não pôde ser confirmada.' }, { status: 403 });

    const body = await request.json().catch(() => ({})) as { cartaoId?: unknown; ym?: unknown; items?: unknown };
    if (typeof body.cartaoId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(body.cartaoId)) return NextResponse.json({ error: 'Cartão inválido.' }, { status: 400 });
    if (typeof body.ym !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(body.ym)) return NextResponse.json({ error: 'Mês de fatura inválido.' }, { status: 400 });
    if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 2000) return NextResponse.json({ error: 'Arquivo sem lançamentos ou com lançamentos demais.' }, { status: 400 });

    const items: ItemCsv[] = [];
    for (const raw of body.items) {
      if (!raw || typeof raw !== 'object') return NextResponse.json({ error: 'Lançamento inválido.' }, { status: 400 });
      const item = raw as Record<string, unknown>;
      if (typeof item.data !== 'string' || item.data.length > 20 || typeof item.descricao !== 'string' || !item.descricao.trim() || item.descricao.length > 300 || typeof item.valor !== 'number' || !Number.isFinite(item.valor) || Math.abs(item.valor) > 10000000 || (item.parcela !== undefined && (typeof item.parcela !== 'string' || item.parcela.length > 40)) || (item.programado !== undefined && typeof item.programado !== 'boolean')) {
        return NextResponse.json({ error: 'Um ou mais lançamentos têm dados inválidos.' }, { status: 400 });
      }
      items.push({ data: item.data, descricao: item.descricao.trim(), valor: item.valor, ...(typeof item.parcela === 'string' ? { parcela: item.parcela } : {}), ...(typeof item.programado === 'boolean' ? { programado: item.programado } : {}) });
    }

    const base = `users/${user.uid}/cartoes/${body.cartaoId}`;
    const card = await getFirestoreDocument(base);
    if (!card) return NextResponse.json({ error: 'Cartão não encontrado.' }, { status: 404 });
    const invoicePath = `${base}/faturas/${body.ym}`;
    const invoice = await getFirestoreDocument(invoicePath);
    if (invoice?.status === 'Pago') return NextResponse.json({ error: 'Esta fatura já está paga.' }, { status: 409 });

    const itemsPath = `${invoicePath}/itens`;
    const existing = await listFirestoreCollection(itemsPath);
    const existingIds = new Set(existing.map((item) => item.id));
    const identified = identificar(items);
    const newItems = identified.filter((item) => !existingIds.has(item.id));
    await commitFirestoreDocuments(newItems.map(({ id, ...fields }) => ({ path: `${itemsPath}/${id}`, fields: fields as Record<string, unknown>, createOnly: true })));
    // Soma a coleção efetivamente persistida. Isso mantém o total correto se duas
    // importações iguais chegarem simultaneamente ou se uma tentativa for repetida.
    const persistedItems = await listFirestoreCollection(itemsPath);
    const total = totalGastos(persistedItems.map((item) => item.fields));
    const status = invoice?.status === 'Pago' ? 'Pago' : 'Pendente';
    await commitFirestoreDocuments([{ path: invoicePath, fields: { valor: total, status, origem: 'csv', atualizadaEm: new Date().toISOString() } }]);
    return NextResponse.json({ novos: newItems.length, ignorados: identified.length - newItems.length, total });
  } catch (error) {
    console.error('CSV import error:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: 'Não foi possível importar a fatura. Tente novamente.' }, { status: 503 });
  }
}
