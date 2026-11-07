import { arredondar, lerDecimal } from '@/lib/formato';
import {
  CAIXINHAS, CHAVES_CAIXINHAS, PERCENTUAIS_PADRAO,
  type ChaveCaixinha, type Percentuais, type SituacaoUso,
} from '@/types/caixinhas';

/** Lógica pura das caixinhas (sem React nem Firebase), coberta por tests/unit/caixinhas.test.ts. */

export const somaPercentuais = (p: Partial<Record<ChaveCaixinha, number>>): number =>
  arredondar(CHAVES_CAIXINHAS.reduce((a, k) => a + (Number.isFinite(p[k]) ? (p[k] as number) : 0), 0));

/**
 * Lê o que veio do Firestore. Sem documento (usuário novo) devolve a distribuição padrão; com documento,
 * valores ausentes, negativos ou inválidos viram 0 e valores acima de 100 são limitados a 100.
 */
export function normalizarPercentuais(bruto: unknown): Percentuais {
  if (!bruto || typeof bruto !== 'object') return { ...PERCENTUAIS_PADRAO };
  const out = {} as Percentuais;
  for (const k of CHAVES_CAIXINHAS) {
    const v = Number((bruto as Record<string, unknown>)[k]);
    out[k] = Number.isFinite(v) ? Math.min(100, Math.max(0, arredondar(v))) : 0;
  }
  return out;
}

export type ResultadoPercentuais = { ok: true; valores: Percentuais } | { ok: false; erro: string };

/** Valida os campos digitados no formulário ("12", "12,5"...). Cada percentual deve ficar entre 0 e 100. */
export function validarPercentuais(texto: Record<ChaveCaixinha, string>): ResultadoPercentuais {
  const valores = {} as Percentuais;
  for (const c of CAIXINHAS) {
    const bruto = (texto[c.chave] ?? '').trim();
    const v = bruto === '' ? 0 : lerDecimal(bruto);
    if (!Number.isFinite(v)) return { ok: false, erro: `Informe um número válido em "${c.nome}".` };
    if (v < 0 || v > 100) return { ok: false, erro: `"${c.nome}" deve ficar entre 0% e 100%.` };
    valores[c.chave] = arredondar(v);
  }
  return { ok: true, valores };
}

export const planejado = (renda: number, pct: number): number => arredondar((renda * pct) / 100);

/** % do planejado já usado. Sem planejado: 100% se houve gasto, senão 0. */
export function usoPercentual(valorPlanejado: number, gasto: number): number {
  if (valorPlanejado > 0) return Math.round((gasto / valorPlanejado) * 100);
  return gasto > 0 ? 100 : 0;
}

/** Acima de 100% estourou; acima de 85% pede atenção. */
export const situacaoDoUso = (usoPct: number): SituacaoUso => (usoPct > 100 ? 'estourou' : usoPct > 85 ? 'atencao' : 'ok');

export type TotaisParaCaixinhas = { fixas: number; cartoes: number; dividas: number };

/** Gasto calculado a partir dos lançamentos do app (Dízimo e Lazer não têm cálculo automático). */
export function gastoAutomatico(chave: ChaveCaixinha, t: TotaisParaCaixinhas, aportes = 0): number {
  if (chave === 'fixas') return arredondar(t.fixas);
  if (chave === 'cartaoDividas') return arredondar(t.cartoes + t.dividas);
  if (chave === 'investimento') return arredondar(aportes);
  return 0;
}

/** Valor lançado à mão, se for um número válido (≥ 0). */
export function valorManualValido(manuais: Partial<Record<ChaveCaixinha, unknown>> | undefined, chave: ChaveCaixinha): number | undefined {
  const v = manuais?.[chave];
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return undefined;
  return arredondar(v);
}

export type ResumoCaixinha = {
  chave: ChaveCaixinha;
  nome: string;
  icone: string;
  cor: string;
  /** Verdadeira quando a caixinha tem cálculo automático a partir dos lançamentos do app. */
  automatica: boolean;
  pct: number;
  planejado: number;
  gasto: number;
  /** Valor automático (mesmo quando há valor manual por cima). */
  gastoAuto: number;
  /** Há valor lançado à mão neste mês. */
  editado: boolean;
  usoPct: number;
  situacao: SituacaoUso;
};

export type EntradaCaixinhas = {
  renda: number;
  pct: Percentuais;
  totais: TotaisParaCaixinhas;
  manuais?: Partial<Record<ChaveCaixinha, unknown>>;
  /** Soma dos aportes de investimento do mês (só usado quando `investimento` for automática). */
  aportes?: number;
};

export function resumoCaixinhas(e: EntradaCaixinhas) {
  const caixinhas: ResumoCaixinha[] = CAIXINHAS.map((c) => {
    const pct = e.pct[c.chave] ?? 0;
    const valorPlanejado = planejado(e.renda, pct);
    const gastoAuto = c.automatica ? gastoAutomatico(c.chave, e.totais, e.aportes) : 0;
    const manual = valorManualValido(e.manuais, c.chave);
    const gasto = manual ?? gastoAuto;
    const usoPct = usoPercentual(valorPlanejado, gasto);
    return {
      chave: c.chave, nome: c.nome, icone: c.icone, cor: c.cor, automatica: c.automatica,
      pct, planejado: valorPlanejado, gasto, gastoAuto, editado: manual !== undefined,
      usoPct, situacao: situacaoDoUso(usoPct),
    };
  });
  const somaPct = somaPercentuais(e.pct);
  const totalPlanejado = arredondar(caixinhas.reduce((a, c) => a + c.planejado, 0));
  const totalGasto = arredondar(caixinhas.reduce((a, c) => a + c.gasto, 0));
  return {
    caixinhas,
    somaPct,
    totalPlanejado,
    totalGasto,
    /** Parte da renda que ficou sem caixinha (negativo = planejou mais do que ganha). */
    naoAlocado: arredondar(e.renda - totalPlanejado),
  };
}
