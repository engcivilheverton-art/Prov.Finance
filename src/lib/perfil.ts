import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PERFIL_PADRAO, type Perfil } from '@/types/finance';

const refPerfil = (uid: string) => doc(db, 'users', uid, 'perfil', 'dados');

export async function carregarPerfil(uid: string): Promise<Perfil | null> {
  const snap = await getDoc(refPerfil(uid));
  if (!snap.exists()) return null;
  return { ...PERFIL_PADRAO, ...(snap.data() as Partial<Perfil>) };
}

export async function salvarPerfil(uid: string, perfil: Perfil): Promise<void> {
  // Firestore não aceita undefined: a idade só vai no documento quando preenchida.
  const dados: Record<string, unknown> = {
    nome: perfil.nome,
    anoIni: perfil.anoIni,
    mesIni: perfil.mesIni,
    anoFim: perfil.anoFim,
    mesFim: perfil.mesFim,
    atualizadoEm: serverTimestamp(),
  };
  if (perfil.idade !== undefined) dados.idade = perfil.idade;
  await setDoc(refPerfil(uid), dados);
}

export const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/** Quantidade de meses do período (inclusive). 0 se o início for depois do fim. */
export function mesesNoPeriodo(p: Pick<Perfil, 'anoIni' | 'mesIni' | 'anoFim' | 'mesFim'>): number {
  const n = (p.anoFim * 12 + p.mesFim) - (p.anoIni * 12 + p.mesIni) + 1;
  return n > 0 ? n : 0;
}
