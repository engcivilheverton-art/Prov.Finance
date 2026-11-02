import { describe, expect, it } from 'vitest';
import { gerarParcelas, resumoDivida, valorNoMes } from '@/lib/dividas';
import { resumoCartao } from '@/lib/cartoes';
import { intervaloYm, rotuloCurto, rotuloYm, somarMeses } from '@/lib/datas';
import { lerDecimal } from '@/lib/formato';
import type { Com, Fatura } from '@/types/finance';

describe('datas', () => {
  it('soma meses atravessando o ano', () => {
    expect(somarMeses('2026-11', 3)).toBe('2027-02');
    expect(somarMeses('2026-01', -1)).toBe('2025-12');
    expect(somarMeses('2026-12', 12)).toBe('2027-12');
  });
  it('intervalo inclusivo e rótulos', () => {
    expect(intervaloYm('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
    expect(rotuloYm('2026-03')).toBe('Março/2026');
    expect(rotuloCurto('2027-12')).toBe('Dez/27');
  });
});

describe('dívidas', () => {
  const parcelas = gerarParcelas(100, 5, 2, '2026-11');
  it('gera as parcelas mês a mês com as pagas marcadas', () => {
    expect(parcelas.map((p) => p.ym)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02', '2027-03']);
    expect(parcelas.filter((p) => p.paga)).toHaveLength(2);
  });
  it('resume total, restante e vencidas', () => {
    const r = resumoDivida(parcelas, '2027-01');
    expect(r).toMatchObject({ total: 5, pagas: 2, restante: 300, valorTotal: 500, quitada: false, vencidas: 0, percentual: 40 });
    expect(resumoDivida(parcelas.map((p) => ({ ...p, paga: true }))).quitada).toBe(true);
    expect(resumoDivida(parcelas.map((p) => ({ ...p, paga: false })), '2027-02').vencidas).toBe(3);
  });
  it('valor cobrado em cada mês', () => {
    expect(valorNoMes(parcelas, '2027-01')).toBe(100);
    expect(valorNoMes(parcelas, '2028-01')).toBe(0);
  });
});

describe('cartões', () => {
  const f = (id: string, valor: number, status: Fatura['status']): Com<Fatura> => ({ id, valor, status, origem: 'manual' });
  it('próxima fatura em aberto e limite disponível', () => {
    const r = resumoCartao([f('2026-10', 500, 'Pago'), f('2026-12', 300, 'Pendente'), f('2026-11', 200, 'Pendente')], 1000, '2026-11');
    expect(r.proxima?.id).toBe('2026-11');
    expect(r.emAberto).toBe(500);
    expect(r.disponivel).toBe(500);
    expect(r.proximaAtrasada).toBe(false);
  });
  it('marca atraso e não deixa o disponível ficar negativo', () => {
    const r = resumoCartao([f('2026-09', 1500, 'Pendente')], 1000, '2026-11');
    expect(r.proximaAtrasada).toBe(true);
    expect(r.disponivel).toBe(0);
    expect(resumoCartao([], undefined).disponivel).toBeNull();
  });
});

describe('lerDecimal', () => {
  it('entende formatos brasileiros e americanos', () => {
    expect(lerDecimal('1.234,56')).toBe(1234.56);
    expect(lerDecimal('R$ 12,50')).toBe(12.5);
    expect(lerDecimal('-1968,09')).toBe(-1968.09);
    expect(lerDecimal('1,234.56')).toBe(1234.56);
    expect(lerDecimal('1234.5')).toBe(1234.5);
    expect(lerDecimal('abc')).toBeNaN();
    expect(lerDecimal('')).toBeNaN();
  });
});

import { reconstruirParcelas } from '@/lib/dividas';
import { rendaDoMes } from '@/lib/rendas';

describe('editar dívida', () => {
  const orig = gerarParcelas(100, 4, 0, '2026-01').map((p, i) => (i === 2 ? { ...p, paga: true } : p));
  it('preserva as parcelas marcadas quando nada estrutural muda', () => {
    const r = reconstruirParcelas(orig, 120, 4, 1, '2026-01');
    expect(r.map((p) => p.paga)).toEqual([false, false, true, false]);
    expect(r.every((p) => p.valor === 120)).toBe(true);
  });
  it('regenera quando muda prazo, início ou o número de pagas', () => {
    expect(reconstruirParcelas(orig, 100, 5, 1, '2026-01')).toHaveLength(5);
    expect(reconstruirParcelas(orig, 100, 4, 2, '2026-01').map((p) => p.paga)).toEqual([true, true, false, false]);
    expect(reconstruirParcelas(orig, 100, 4, 1, '2026-03')[0].ym).toBe('2026-03');
    expect(reconstruirParcelas(undefined, 50, 2, 0, '2026-05')).toHaveLength(2);
  });
});

describe('rendas', () => {
  const rendas = [
    { nome: 'Salário', tipo: 'Salário CLT', valor: 4300, recorrencia: 'mensal' as const },
    { nome: 'Freela', tipo: 'Freelance', valor: 1200, recorrencia: 'unica' as const, ym: '2026-06' },
  ];
  it('soma as mensais e só inclui a avulsa no seu mês', () => {
    expect(rendaDoMes(rendas, '2026-06')).toBe(5500);
    expect(rendaDoMes(rendas, '2026-07')).toBe(4300);
  });
});
