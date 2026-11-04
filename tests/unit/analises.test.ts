import { describe, expect, it } from 'vitest';
import {
  agruparPorDia, comprasDoMes, dataDaCompra, diasNoMes, faturasEmAberto, faturasPorMes,
  gastosPorCategoria, mesesDoPeriodo, resumoCalendario, serieMensal, totaisDoMes,
} from '@/lib/analises';
import { categoriaDaCompra } from '@/lib/categorias';
import { abreviar, escalaBonita } from '@/lib/escala';
import { gerarParcelas } from '@/lib/dividas';
import type { Cartao, Com, Fatura, ItemFatura, Renda } from '@/types/finance';

const fat = (id: string, valor: number, status: Fatura['status'] = 'Pendente'): Com<Fatura> => ({ id, valor, status, origem: 'manual' });
const item = (id: string, data: string, valor: number, extra: Partial<ItemFatura> = {}): Com<ItemFatura> => ({ id, data, descricao: 'LOJA', valor, ...extra });

describe('período e séries mensais', () => {
  it('lista os meses do período e devolve vazio se estiver invertido', () => {
    expect(mesesDoPeriodo({ anoIni: 2026, mesIni: 11, anoFim: 2027, mesFim: 2 })).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
    expect(mesesDoPeriodo({ anoIni: 2027, mesIni: 1, anoFim: 2026, mesFim: 12 })).toEqual([]);
  });

  it('soma faturas por mês entre cartões e permite filtrar um cartão', () => {
    const base = { a: [fat('2026-11', 100), fat('2026-12', 50)], b: [fat('2026-11', 30.5)] };
    expect(faturasPorMes(base)).toEqual({ '2026-11': 130.5, '2026-12': 50 });
    expect(faturasPorMes(base, 'b')).toEqual({ '2026-11': 30.5 });
  });

  const rendas: Renda[] = [
    { nome: 'Salário', tipo: 'Salário CLT', valor: 4000, recorrencia: 'mensal' },
    { nome: 'Extra', tipo: 'Freelance', valor: 1000, recorrencia: 'unica', ym: '2026-12' },
  ];
  const entrada = {
    faturas: { '2026-11': 1500, '2026-12': 500 },
    dividas: [{ parcelas: gerarParcelas(300, 2, 0, '2026-11') }],
    fixas: [{ valor: 700 }, { valor: 300 }],
    rendas,
  };

  it('calcula gastos e saldo de um mês', () => {
    expect(totaisDoMes('2026-11', entrada)).toEqual({ cartoes: 1500, dividas: 300, fixas: 1000, renda: 4000, gastos: 2800, saldo: 1200 });
    expect(totaisDoMes('2027-03', entrada)).toMatchObject({ cartoes: 0, dividas: 0, gastos: 1000, saldo: 3000 });
  });

  it('monta as séries na ordem dos meses, incluindo saldo negativo', () => {
    const s = serieMensal(['2026-11', '2026-12'], { ...entrada, faturas: { '2026-11': 1500, '2026-12': 6000 } });
    expect(s.renda).toEqual([4000, 5000]);
    expect(s.gastos).toEqual([2800, 7300]);
    expect(s.balanco).toEqual([1200, -2300]);
  });
});

describe('faturas em aberto', () => {
  const cartoes: Com<Cartao>[] = [
    { id: 'a', nome: 'Beta', bandeira: 'Visa', corBase: '#000' },
    { id: 'b', nome: 'Alfa', bandeira: 'Visa', corBase: '#000' },
  ];
  it('lista só as pendentes, por mês e nome, marcando atraso', () => {
    const r = faturasEmAberto(cartoes, { a: [fat('2026-12', 10), fat('2026-09', 5, 'Pago')], b: [fat('2026-12', 20), fat('2026-10', 7)] }, '2026-11');
    expect(r.map((f) => `${f.ym}/${f.cartaoNome}`)).toEqual(['2026-10/Alfa', '2026-12/Alfa', '2026-12/Beta']);
    expect(r[0].atrasada).toBe(true);
    expect(r[1].atrasada).toBe(false);
  });
});

describe('data real da compra', () => {
  it('usa o ano da fatura e recua um ano quando o mês da compra é posterior', () => {
    expect(dataDaCompra('06/10', '2026-11')).toBe('2026-10-06');
    expect(dataDaCompra('06/11', '2026-11')).toBe('2026-11-06');
    expect(dataDaCompra('28/12', '2027-01')).toBe('2026-12-28');
  });
  it('rejeita datas inválidas', () => {
    expect(dataDaCompra('31/02', '2026-03')).toBeNull();
    expect(dataDaCompra('abc', '2026-03')).toBeNull();
    expect(dataDaCompra('10/13', '2026-03')).toBeNull();
  });
});

describe('compras do mês e calendário', () => {
  const fontes = [
    { cartaoId: 'a', cartaoNome: 'Alfa', ymFatura: '2026-11', itens: [item('1', '06/10', 100), item('2', '06/10', 50.5), item('3', '10/11', 20), item('4', '07/10', -300), item('5', '20/12', 99, { programado: true })] },
    { cartaoId: 'a', cartaoNome: 'Alfa', ymFatura: '2026-10', itens: [item('6', '30/09', 10), item('7', '03/10', 40)] },
  ];

  it('filtra pelo mês real da compra e ignora pagamentos e parcelamentos futuros', () => {
    const out = comprasDoMes(fontes, '2026-10');
    expect(out.map((c) => c.dataIso)).toEqual(['2026-10-03', '2026-10-06', '2026-10-06']);
    expect(out.reduce((a, c) => a + c.valor, 0)).toBe(190.5);
    expect(comprasDoMes(fontes, '2026-11').map((c) => c.valor)).toEqual([20]);
    expect(comprasDoMes(fontes, '2026-09')).toHaveLength(1);
  });

  it('agrupa por dia e resume o mês', () => {
    const compras = comprasDoMes(fontes, '2026-10');
    expect(agruparPorDia(compras)[6]).toMatchObject({ total: 150.5 });
    const r = resumoCalendario(compras, '2026-10', '2026-11');
    expect(r.total).toBe(190.5);
    expect(r.diasComGasto).toBe(2);
    expect(r.maior?.dia).toBe(6);
    expect(r.mediaPorDia).toBe(6.15); // 190,50 / 31 dias
  });

  it('no mês corrente a média considera só os dias até hoje', () => {
    const compras = comprasDoMes(fontes, '2026-10');
    expect(resumoCalendario(compras, '2026-10', '2026-10', 10).mediaPorDia).toBe(19.05);
  });

  it('conta os dias do mês, inclusive bissexto', () => {
    expect(diasNoMes('2028-02')).toBe(29);
    expect(diasNoMes('2026-02')).toBe(28);
    expect(diasNoMes('2026-12')).toBe(31);
  });
});

describe('categorias', () => {
  it('reconhece estabelecimentos comuns e prioriza compras online sobre "mercado"', () => {
    expect(categoriaDaCompra('MERCADO LIVRE*PEDIDO')).toBe('Compras online');
    expect(categoriaDaCompra('SUPERMERCADO CENTRAL')).toBe('Mercado');
    expect(categoriaDaCompra('UBER *TRIP')).toBe('Transporte');
    expect(categoriaDaCompra('POSTO IPIRANGA')).toBe('Transporte');
    expect(categoriaDaCompra('Farmácia Vida')).toBe('Saúde');
    expect(categoriaDaCompra('NETFLIX.COM')).toBe('Assinaturas');
    expect(categoriaDaCompra('RESTAURANTE SABOR')).toBe('Alimentação fora');
    expect(categoriaDaCompra('ANUIDADE DIFERENCIADA')).toBe('Taxas e serviços');
    expect(categoriaDaCompra('XYZ 123')).toBe('Outros');
  });

  it('soma por categoria, ordena e junta o excedente em Outros', () => {
    const c = (descricao: string, valor: number) => ({ id: descricao, cartaoId: 'a', cartaoNome: 'A', dataIso: '2026-10-01', descricao, valor });
    const r = gastosPorCategoria([c('SUPERMERCADO X', 100), c('SUPERMERCADO Y', 50), c('UBER', 30), c('NETFLIX', 20), c('ZZZ', 5)], 3);
    expect(r).toEqual([{ nome: 'Mercado', valor: 150 }, { nome: 'Transporte', valor: 30 }, { nome: 'Outros', valor: 25 }]);
  });
});

describe('escala dos gráficos', () => {
  it('gera ticks redondos que cobrem o intervalo', () => {
    const e = escalaBonita(0, 1280);
    expect(e.min).toBe(0);
    expect(e.max).toBeGreaterThanOrEqual(1280);
    expect(e.ticks[0]).toBe(0);
    expect(e.ticks.length).toBeGreaterThanOrEqual(3);
  });
  it('inclui o zero quando há valores negativos e nunca fica degenerada', () => {
    const e = escalaBonita(-2300, 1200);
    expect(e.min).toBeLessThanOrEqual(-2300);
    expect(e.ticks).toContain(0);
    const vazio = escalaBonita(0, 0);
    expect(vazio.max).toBeGreaterThan(vazio.min);
  });
  it('abrevia valores', () => {
    expect(abreviar(238.9)).toBe('239');
    expect(abreviar(1280)).toBe('1,3k');
    expect(abreviar(12500)).toBe('13k');
    expect(abreviar(-2300)).toBe('−2,3k');
  });
});
