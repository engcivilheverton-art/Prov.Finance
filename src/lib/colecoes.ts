'use client';

import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Com } from '@/types/finance';

export const chaveDe = (caminho: string[]): string => caminho.join('/');

/**
 * Escuta várias coleções em tempo real de uma vez (ex.: as faturas de cada cartão).
 * Devolve os documentos por caminho (`chaveDe(caminho)`). `carregando` fica verdadeiro até todas responderem.
 * Passe null enquanto os caminhos ainda não puderem ser calculados; lista vazia significa "nada a ler".
 */
export function useColecoes<T extends object>(caminhos: string[][] | null) {
  const chaveGeral = caminhos ? caminhos.map(chaveDe).join('|') : null;
  const total = chaveGeral === null ? 0 : chaveGeral === '' ? 0 : chaveGeral.split('|').length;
  const [estado, setEstado] = useState<{ chave: string | null; dados: Record<string, Com<T>[]>; prontos: number; erro: string | null }>({
    chave: null, dados: {}, prontos: 0, erro: null,
  });

  useEffect(() => {
    if (!chaveGeral) return;
    const chaves = chaveGeral.split('|');
    const dados: Record<string, Com<T>[]> = {};
    const recebidos = new Set<string>();
    const cancelar = chaves.map((ch) =>
      onSnapshot(
        collection(db, ch),
        (snap) => {
          dados[ch] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) }));
          recebidos.add(ch);
          setEstado({ chave: chaveGeral, dados: { ...dados }, prontos: recebidos.size, erro: null });
        },
        () => setEstado((s) => ({ ...s, chave: chaveGeral, erro: 'Não foi possível carregar parte dos dados.' })),
      ),
    );
    return () => cancelar.forEach((c) => c());
  }, [chaveGeral]);

  const atual = chaveGeral !== null && estado.chave === chaveGeral;
  return {
    dados: atual ? estado.dados : ({} as Record<string, Com<T>[]>),
    carregando: chaveGeral !== null && total > 0 && !(atual && (estado.prontos >= total || estado.erro !== null)),
    erro: atual ? estado.erro : null,
  };
}
