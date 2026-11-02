import { arredondar } from '@/lib/formato';
import { ymAtual } from '@/lib/datas';
import type { Com, Fatura } from '@/types/finance';

export function resumoCartao(faturas: Com<Fatura>[], limite?: number, hoje: string = ymAtual()) {
  const abertas = faturas.filter((f) => f.status === 'Pendente').sort((a, b) => a.id.localeCompare(b.id));
  const emAberto = arredondar(abertas.reduce((a, f) => a + f.valor, 0));
  return {
    proxima: abertas[0] ?? null,
    proximaAtrasada: abertas[0] ? abertas[0].id < hoje : false,
    emAberto,
    disponivel: limite && limite > 0 ? Math.max(0, arredondar(limite - emAberto)) : null,
  };
}
