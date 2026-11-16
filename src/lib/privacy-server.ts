import 'server-only';
import type { DocumentReference } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';

function serializarValor(valor: unknown): unknown {
  if (valor instanceof Date) return valor.toISOString();
  if (Array.isArray(valor)) return valor.map(serializarValor);
  if (valor && typeof valor === 'object') {
    const comData = valor as { toDate?: () => Date };
    if (typeof comData.toDate === 'function') return comData.toDate().toISOString();
    return Object.fromEntries(Object.entries(valor).map(([chave, item]) => [chave, serializarValor(item)]));
  }
  return valor;
}

async function exportarDocumento(ref: DocumentReference): Promise<Record<string, unknown>> {
  const snapshot = await ref.get();
  const colecoes: Record<string, unknown[]> = {};
  const subcolecoes = await ref.listCollections();

  for (const subcolecao of subcolecoes) {
    const documentos = await subcolecao.get();
    colecoes[subcolecao.id] = [];
    for (const documento of documentos.docs) {
      colecoes[subcolecao.id].push(await exportarDocumento(documento.ref));
    }
  }

  return {
    id: ref.id,
    data: snapshot.exists ? serializarValor(snapshot.data() ?? {}) : {},
    colecoes,
  };
}

/** Exporta o documento users/{uid} e todas as subcoleções recursivamente. */
export async function exportarDadosDoUsuario(uid: string) {
  return exportarDocumento(adminDb().doc(`users/${uid}`));
}
