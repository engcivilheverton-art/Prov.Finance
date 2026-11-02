import { arredondar } from '@/lib/formato';
import { somarMeses, ymAtual } from '@/lib/datas';
import type { ParcelaDivida } from '@/types/finance';

export function gerarParcelas(valor: number, total: number, pagas: number, inicio: string): ParcelaDivida[] {
  return Array.from({ length: total }, (_, i) => ({ ym: somarMeses(inicio, i), valor, paga: i < pagas }));
}

export function resumoDivida(parcelas: ParcelaDivida[], hoje: string = ymAtual()) {
  const total = parcelas.length;
  const pagas = parcelas.filter((p) => p.paga).length;
  const restante = arredondar(parcelas.filter((p) => !p.paga).reduce((a, p) => a + p.valor, 0));
  return {
    total,
    pagas,
    restante,
    valorTotal: arredondar(parcelas.reduce((a, p) => a + p.valor, 0)),
    quitada: total > 0 && pagas === total,
    vencidas: parcelas.filter((p) => !p.paga && p.ym < hoje).length,
    percentual: total ? Math.round((pagas / total) * 100) : 0,
  };
}

/** Quanto a dívida cobra no mês `ym` (parcelas já pagas continuam contando como saída daquele mês). */
export const valorNoMes = (parcelas: ParcelaDivida[], ym: string): number =>
  parcelas.find((p) => p.ym === ym)?.valor ?? 0;

/**
 * Recalcula as parcelas depois de editar a dívida. Se o prazo e o início não mudaram e o número de
 * parcelas pagas informado é o mesmo de antes, preserva quais parcelas estão marcadas (só atualiza o valor).
 */
export function reconstruirParcelas(
  antigas: ParcelaDivida[] | undefined,
  valor: number,
  total: number,
  pagas: number,
  inicio: string,
): ParcelaDivida[] {
  if (antigas && antigas.length === total && antigas[0]?.ym === inicio && antigas.filter((p) => p.paga).length === pagas) {
    return antigas.map((p) => ({ ...p, valor }));
  }
  return gerarParcelas(valor, total, pagas, inicio);
}
