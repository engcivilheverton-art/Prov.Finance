import { collection, deleteDoc, doc, getDocs, writeBatch } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type { ItemFatura } from '@/types/finance';

const LOTE = 400; // o Firestore aceita até 500 operações por lote

const refFatura = (uid: string, cartaoId: string, ym: string) =>
  doc(db, 'users', uid, 'cartoes', cartaoId, 'faturas', ym);

async function apagarEmLotes(refs: { ref: ReturnType<typeof doc> }[]) {
  for (let i = 0; i < refs.length; i += LOTE) {
    const lote = writeBatch(db);
    refs.slice(i, i + LOTE).forEach((r) => lote.delete(r.ref));
    await lote.commit();
  }
}

export class FaturaPagaError extends Error {
  constructor(message = 'Esta fatura já está paga.') { super(message); }
}

export class PremiumRequiredError extends Error {
  constructor() { super('PREMIUM_REQUIRED'); }
}

export class ImportacaoTimeoutError extends Error {
  constructor() {
    super('A importação demorou mais que o esperado. Pode tentar novamente; lançamentos já salvos serão ignorados.');
    this.name = 'ImportacaoTimeoutError';
  }
}

const IMPORT_TIMEOUT_MS = 55_000;

/** A importação é processada pelo backend, que reconfirma a assinatura no Mercado Pago. */
export async function importarItens(uid: string, cartaoId: string, ym: string, itens: ItemFatura[]) {
  const user = auth.currentUser;
  if (!user || user.uid !== uid) throw new Error('Sessão inválida. Entre novamente.');
  let idToken: string;
  try { idToken = await user.getIdToken(); }
  catch { throw new Error('Não foi possível validar sua sessão. Entre novamente e tente importar.'); }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMPORT_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch('/api/billing/csv-import', {
      method: 'POST',
      headers: { authorization: `Bearer ${idToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ cartaoId, ym, items: itens }),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) throw new ImportacaoTimeoutError();
    throw new Error('Falha de conexão durante a importação. Confira sua internet e tente novamente.');
  } finally {
    clearTimeout(timeout);
  }
  const data = await response.json().catch(() => ({})) as { novos?: number; ignorados?: number; total?: number; futuras?: { ym: string; quantidade: number }[]; error?: string };
  if (response.status === 403) throw new PremiumRequiredError();
  if (response.status === 409) throw new FaturaPagaError(data.error);
  if (!response.ok || typeof data.total !== 'number') throw new Error(data.error || 'Falha ao importar CSV.');
  return { novos: data.novos ?? 0, ignorados: data.ignorados ?? 0, total: data.total, futuras: data.futuras ?? [] };
}

export async function excluirFatura(uid: string, cartaoId: string, ym: string) {
  const ref = refFatura(uid, cartaoId, ym);
  await apagarEmLotes((await getDocs(collection(ref, 'itens'))).docs);
  await deleteDoc(ref);
}

export async function excluirCartao(uid: string, cartaoId: string) {
  const faturas = await getDocs(collection(db, 'users', uid, 'cartoes', cartaoId, 'faturas'));
  for (const f of faturas.docs) await excluirFatura(uid, cartaoId, f.id);
  await deleteDoc(doc(db, 'users', uid, 'cartoes', cartaoId));
}
