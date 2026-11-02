import { arredondar } from '@/lib/formato';
import type { Renda } from '@/types/finance';

/** Renda de um mês: as mensais valem todo mês; as avulsas só no mês em que foram recebidas. */
export function rendaDoMes(rendas: Renda[], ym: string): number {
  return arredondar(
    rendas.reduce((a, r) => (r.recorrencia === 'mensal' || r.ym === ym ? a + r.valor : a), 0),
  );
}
