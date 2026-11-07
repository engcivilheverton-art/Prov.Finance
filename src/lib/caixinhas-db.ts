'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collection, deleteDoc, deleteField, doc, onSnapshot, query, serverTimestamp, setDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { converterConfigLegada } from '@/lib/caixinhas';
import { useColecao } from '@/lib/colecao';
import type { CaixinhaUsuario, GastosManuais } from '@/types/caixinhas';

const refConfigLegada = (uid: string) => doc(db, 'users', uid, 'caixinhas', 'config');

/** Ouve as caixas por usuário e converte, uma única vez, a antiga configuração fixa. */
export function useCaixinhasUsuario(uid: string | undefined) {
  const caixas = useColecao<CaixinhaUsuario>(uid ? ['users', uid, 'caixinhas'] : null);
  const [legado, setLegado] = useState<{ uid: string; dados: Record<string, unknown> | null } | null>(null);
  const migracoes = useRef(new Set<string>());

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(refConfigLegada(uid), (snap) => {
      setLegado({ uid, dados: snap.exists() ? snap.data() as Record<string, unknown> : null });
    }, () => setLegado({ uid, dados: null }));
  }, [uid]);

  const configAtual = legado?.uid === uid ? legado?.dados ?? null : null;
  const candidatas = useMemo(() => caixas.itens.filter((c) => c.id !== 'config'), [caixas.itens]);

  useEffect(() => {
    if (!uid || !configAtual || configAtual.migrado === true || caixas.carregando || candidatas.length > 0) return;
    const antigas = converterConfigLegada(configAtual);
    if (!antigas || migracoes.current.has(uid)) return;
    migracoes.current.add(uid);
    const batch = writeBatch(db);
    for (const { id, dados } of antigas) batch.set(doc(db, 'users', uid, 'caixinhas', id), { ...dados, atualizadoEm: serverTimestamp() });
    batch.set(refConfigLegada(uid), { migrado: true, atualizadoEm: serverTimestamp() }, { merge: true });
    void batch.commit().catch(() => migracoes.current.delete(uid));
  }, [uid, configAtual, caixas.carregando, candidatas.length]);

  const salvar = useCallback(async (id: string, dados: Omit<CaixinhaUsuario, 'atualizadoEm'>) => {
    if (!uid) throw new Error('Sem usuário autenticado.');
    await setDoc(doc(db, 'users', uid, 'caixinhas', id), { ...dados, atualizadoEm: serverTimestamp() });
  }, [uid]);

  const arquivar = useCallback(async (id: string) => {
    if (!uid) throw new Error('Sem usuário autenticado.');
    await setDoc(doc(db, 'users', uid, 'caixinhas', id), { ativa: false, atualizadoEm: serverTimestamp() }, { merge: true });
  }, [uid]);

  const restaurar = useCallback(async (id: string) => {
    if (!uid) throw new Error('Sem usuário autenticado.');
    await setDoc(doc(db, 'users', uid, 'caixinhas', id), { ativa: true, atualizadoEm: serverTimestamp() }, { merge: true });
  }, [uid]);

  const dadosLegados = configAtual && configAtual.migrado !== true ? converterConfigLegada(configAtual) : null;
  const itens = candidatas.length > 0
    ? candidatas
    : (caixas.carregando ? [] : (dadosLegados ?? []).map(({ id, dados }) => ({ id, ...dados })));

  return {
    itens,
    carregando: caixas.carregando || (!!uid && legado?.uid !== uid),
    erro: caixas.erro,
    salvar,
    arquivar,
    restaurar,
  };
}

/** Gasto manual por mês e caixa; também lê os lançamentos antigos durante a migração. */
export function useGastosManuais(uid: string | undefined, ym: string) {
  const chave = uid ? `${uid}/${ym}` : null;
  const [estado, setEstado] = useState<{ chave: string | null; modernos: GastosManuais; antigos: GastosManuais; erro: string | null }>({ chave: null, modernos: {}, antigos: {}, erro: null });

  useEffect(() => {
    if (!uid || !chave) return;
    const col = collection(db, 'users', uid, 'caixinhasGastos');
    const unsubNovo = onSnapshot(query(col, where('ym', '==', ym)), (snap) => {
      const novos: GastosManuais = {};
      for (const d of snap.docs) {
        const item = d.data();
        if (typeof item.caixinhaId === 'string' && typeof item.valor === 'number') novos[item.caixinhaId] = item.valor;
      }
      setEstado((s) => ({ chave, modernos: novos, antigos: s.chave === chave ? s.antigos : {}, erro: null }));
    }, () => setEstado((s) => ({ ...s, chave, erro: 'Não foi possível carregar os gastos lançados.' })));
    const unsubAntigo = onSnapshot(doc(db, 'users', uid, 'caixinhasGastos', ym), (snap) => {
      const antigos = snap.exists() ? (snap.data().valores as GastosManuais | undefined) ?? {} : {};
      setEstado((s) => ({ chave, modernos: s.chave === chave ? s.modernos : {}, antigos, erro: null }));
    }, () => setEstado((s) => ({ ...s, chave, erro: 'Não foi possível carregar os gastos lançados.' })));
    return () => { unsubNovo(); unsubAntigo(); };
  }, [uid, ym, chave]);

  const pronto = chave !== null && estado.chave === chave;
  const definir = useCallback(async (id: string, valor: number) => {
    if (!uid) throw new Error('Sem usuário autenticado.');
    const gastoId = `${ym}_${id}`;
    await setDoc(doc(db, 'users', uid, 'caixinhasGastos', gastoId), { ym, caixinhaId: id, valor, atualizadoEm: serverTimestamp() });
  }, [uid, ym]);
  const limpar = useCallback(async (id: string) => {
    if (!uid) throw new Error('Sem usuário autenticado.');
    await Promise.all([
      deleteDoc(doc(db, 'users', uid, 'caixinhasGastos', `${ym}_${id}`)),
      ...(['fixas', 'cartaoDividas', 'dizimo', 'lazer', 'investimento'].includes(id)
        ? [setDoc(doc(db, 'users', uid, 'caixinhasGastos', ym), { valores: { [id]: deleteField() }, atualizadoEm: serverTimestamp() }, { merge: true })]
        : []),
    ]);
  }, [uid, ym]);

  const valores = pronto ? { ...estado.antigos, ...estado.modernos } : {};

  return {
    valores,
    carregando: chave !== null && !pronto,
    erro: pronto ? estado.erro : null,
    definir,
    limpar,
  };
}
