'use client';

import { useCallback, useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Com } from '@/types/finance';

/** O Firestore rejeita `undefined`: remove os campos não preenchidos. */
export function limpar<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

/**
 * Escuta uma coleção em tempo real. `caminho` é a lista de segmentos (ex.: ['users', uid, 'cartoes']);
 * passe null enquanto o usuário ainda não estiver disponível.
 */
export function useColecao<T extends object>(caminho: string[] | null) {
  const chave = caminho ? caminho.join('/') : null;
  const [estado, setEstado] = useState<{ chave: string | null; itens: Com<T>[]; erro: string | null }>({
    chave: null,
    itens: [],
    erro: null,
  });

  useEffect(() => {
    if (!chave) return;
    return onSnapshot(
      collection(db, chave),
      (snap) => setEstado({ chave, itens: snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) })), erro: null }),
      () => setEstado({ chave, itens: [], erro: 'Não foi possível carregar os dados.' }),
    );
  }, [chave]);

  const pronto = chave !== null && estado.chave === chave;

  const adicionar = useCallback(
    async (dados: T) => { if (chave) await addDoc(collection(db, chave), limpar(dados)); },
    [chave],
  );
  /** Grava o documento inteiro (substitui). Com `id` definido cria ou sobrescreve. */
  const salvar = useCallback(
    async (id: string, dados: T) => { if (chave) await setDoc(doc(db, chave, id), limpar(dados)); },
    [chave],
  );
  /** Atualiza apenas os campos informados. */
  const mesclar = useCallback(
    async (id: string, parcial: Partial<T>) => { if (chave) await setDoc(doc(db, chave, id), limpar(parcial), { merge: true }); },
    [chave],
  );
  const remover = useCallback(
    async (id: string) => { if (chave) await deleteDoc(doc(db, chave, id)); },
    [chave],
  );

  return {
    itens: pronto ? estado.itens : [],
    carregando: chave !== null && !pronto,
    erro: pronto ? estado.erro : null,
    adicionar, salvar, mesclar, remover,
  };
}
