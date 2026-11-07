import { arredondar, lerDecimal } from '@/lib/formato';
import { CAIXINHAS_LEGADAS, type CaixinhaUsuario, type ChaveCaixinha, type OrigemCaixinha, type SituacaoUso } from '@/types/caixinhas';

export const somaPercentuais = (caixinhas: Pick<CaixinhaUsuario, 'percentual' | 'ativa'>[]): number =>
  arredondar(caixinhas.filter((c) => c.ativa).reduce((s, c) => s + (Number.isFinite(c.percentual) ? c.percentual : 0), 0));

/** Converte a configuração antiga em caixas individuais, mantendo percentuais e lançamentos já existentes. */
export function converterConfigLegada(bruto: unknown): Array<{ id: string; dados: CaixinhaUsuario }> | null {
  if (!bruto || typeof bruto !== 'object' || !('pct' in bruto)) return null;
  const pct = (bruto as { pct?: unknown }).pct;
  if (!pct || typeof pct !== 'object') return null;
  return CAIXINHAS_LEGADAS.map((c) => {
    const valor = Number((pct as Record<string, unknown>)[c.id]);
    return {
      id: c.id,
      dados: {
        nome: c.nome,
        percentual: Number.isFinite(valor) ? Math.min(100, Math.max(0, arredondar(valor))) : 0,
        icone: c.icone,
        cor: c.cor,
        origem: c.origem,
        ativa: true,
      },
    };
  });
}

export type ResultadoCaixinha = { ok: true; valores: { nome: string; percentual: number } } | { ok: false; erro: string };

export function validarCaixinha(nome: string, percentualTexto: string): ResultadoCaixinha {
  const nomeLimpo = nome.trim();
  const percentual = percentualTexto.trim() === '' ? 0 : lerDecimal(percentualTexto);
  if (!nomeLimpo || nomeLimpo.length > 40) return { ok: false, erro: 'Informe um nome com até 40 caracteres.' };
  if (!Number.isFinite(percentual) || percentual < 0 || percentual > 100) return { ok: false, erro: 'O percentual deve ficar entre 0% e 100%.' };
  return { ok: true, valores: { nome: nomeLimpo, percentual: arredondar(percentual) } };
}

export const planejado = (renda: number, pct: number): number => arredondar((renda * pct) / 100);

export function usoPercentual(valorPlanejado: number, gasto: number): number {
  if (valorPlanejado > 0) return Math.round((gasto / valorPlanejado) * 100);
  return gasto > 0 ? 100 : 0;
}

export const situacaoDoUso = (usoPct: number): SituacaoUso => (usoPct > 100 ? 'estourou' : usoPct > 85 ? 'atencao' : 'ok');

export type TotaisParaCaixinhas = { fixas: number; cartoes: number; dividas: number };

export function gastoAutomatico(origem: OrigemCaixinha, t: TotaisParaCaixinhas): number {
  if (origem === 'fixas') return arredondar(t.fixas);
  if (origem === 'cartaoDividas') return arredondar(t.cartoes + t.dividas);
  return 0;
}

export function valorManualValido(manuais: Record<string, unknown> | undefined, chave: ChaveCaixinha): number | undefined {
  const v = manuais?.[chave];
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return undefined;
  return arredondar(v);
}

export type ResumoCaixinha = CaixinhaUsuario & {
  id: string;
  automatica: boolean;
  planejado: number;
  gasto: number;
  gastoAuto: number;
  editado: boolean;
  usoPct: number;
  situacao: SituacaoUso;
};

export function resumoCaixinhas(e: {
  renda: number;
  caixinhas: Array<{ id: string; dados: CaixinhaUsuario }>;
  totais: TotaisParaCaixinhas;
  manuais?: Record<string, unknown>;
}) {
  const caixinhas: ResumoCaixinha[] = e.caixinhas.map(({ id, dados }) => {
    const pct = dados.percentual;
    const valorPlanejado = planejado(e.renda, pct);
    const gastoAuto = gastoAutomatico(dados.origem, e.totais);
    const manual = valorManualValido(e.manuais, id);
    const gasto = manual ?? gastoAuto;
    const usoPct = usoPercentual(valorPlanejado, gasto);
    return {
      id, ...dados, automatica: dados.origem !== 'manual', planejado: valorPlanejado, gasto, gastoAuto,
      editado: manual !== undefined, usoPct, situacao: situacaoDoUso(usoPct),
    };
  });
  const somaPct = somaPercentuais(caixinhas);
  const totalPlanejado = arredondar(caixinhas.reduce((a, c) => a + c.planejado, 0));
  const totalGasto = arredondar(caixinhas.reduce((a, c) => a + c.gasto, 0));
  return { caixinhas, somaPct, totalPlanejado, totalGasto, naoAlocado: arredondar(e.renda - totalPlanejado) };
}
