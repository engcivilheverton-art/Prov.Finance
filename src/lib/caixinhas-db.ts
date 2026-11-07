'use client';

import { useCallback, useEffect, useState } from 'react';
import { deleteField, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { normalizarPercentuais } from '@/lib/caixinhas';
import { PERCENTUAIS_PADRAO, type ChaveCaixinha, type GastosManuais, type Percentuais } from '@/types/caixinhas';

const refConfig = (uid: string) => doc(db, 'users', uid, 'caixinhas', 'config');
const refGastos = (uid: string, ym: string) => doc(db, 'users', uid, 'caixinhasGastos', ym);

/**
 * Percentuais das caixinhas (documento users/{uid}/caixinhas/config).
 * Sem documento, `pct` é a distribuição padrão e `existe` é falso.
 */
export function useConfigCaixinhas(uid: string | undefined) {
  const [estado, setEstado] = useState<{ uid: string | null; pct: Percentuais; existe: boolean; erro: string | null }>({
    uid: null, pct: PERCENTUAIS_PADRAO, existe: false, erro: null,
  });

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      refConfig(uid),
      (snap) => setEstado({
        uid,
        pct: snap.exists() ? normalizarPercentuais((snap.data() as { pct?: unknown }).pct) : { ...PERCENTUAIS_PADRAO },
        existe: snap.exists(),
        erro: null,
      }),
      () => setEstado({ uid, pct: { ...PERCENTUAIS_PADRAO }, existe: false, erro: 'Não foi possível carregar os percentuais das caixinhas.' }),
    );
  }, [uid]);

  const pronto = !!uid && estado.uid === uid;

  const salvar = useCallback(async (pct: Percentuais) => {
    if (!uid) throw new Error('Sem usuário autenticado.');
    await setDoc(refConfig(uid), { pct, atualizadoEm: serverTimestamp() });
  }, [uid]);

  return {
    pct: pronto ? estado.pct : PERCENTUAIS_PADRAO,
    existe: pronto ? estado.existe : false,
    carregando: !!uid && !pronto,
    erro: pronto ? estado.erro : null,
    salvar,
  };
}

/**
 * Gastos lançados à mão em um mês (documento users/{uid}/caixinhasGastos/{AAAA-MM}).
 * Um valor lançado substitui o cálculo automático daquela caixinha naquele mês.
 */
export function useGastosManuais(uid: string | undefined, ym: string) {
  const chave = uid ? `${uid}/${ym}` : null;
  const [estado, setEstado] = useState<{ chave: string | null; valores: GastosManuais['valores']; erro: string | null }>({
    chave: null, valores: {}, erro: null,
  });

  useEffect(() => {
    if (!uid || !chave) return;
    return onSnapshot(
      refGastos(uid, ym),
      (snap) => setEstado({ chave, valores: snap.exists() ? ((snap.data() as GastosManuais).valores ?? {}) : {}, erro: null }),
      () => setEstado({ chave, valores: {}, erro: 'Não foi possível carregar os gastos lançados.' }),
    );
  }, [uid, ym, chave]);

  const pronto = chave !== null && estado.chave === chave;

  const definir = useCallback(async (k: ChaveCaixinha, valor: number) => {
    if (!uid) throw new Error('Sem usuário autenticado.');
    await setDoc(refGastos(uid, ym), { valores: { [k]: valor }, atualizadoEm: serverTimestamp() }, { merge: true });
  }, [uid, ym]);

  /** Remove o valor lançado; a caixinha volta ao cálculo automático (ou a "nenhum gasto lançado"). */
  const limpar = useCallback(async (k: ChaveCaixinha) => {
    if (!uid) throw new Error('Sem usuário autenticado.');
    await setDoc(refGastos(uid, ym), { valores: { [k]: deleteField() }, atualizadoEm: serverTimestamp() }, { merge: true });
  }, [uid, ym]);

  return {
    valores: pronto ? estado.valores : {},
    carregando: chave !== null && !pronto,
    erro: pronto ? estado.erro : null,
    definir,
    limpar,
  };
}
