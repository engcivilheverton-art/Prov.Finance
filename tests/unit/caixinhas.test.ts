import { describe, expect, it } from 'vitest';
import { faturasPorMes, totaisDoMes } from '@/lib/analises';
import {
  gastoAutomatico, normalizarPercentuais, planejado, resumoCaixinhas, situacaoDoUso, somaPercentuais,
  usoPercentual, validarPercentuais, valorManualValido,
} from '@/lib/caixinhas';
import { gerarParcelas } from '@/lib/dividas';
import { CHAVES_CAIXINHAS, PERCENTUAIS_PADRAO, type ChaveCaixinha } from '@/types/caixinhas';
import type { Com, Fatura, Renda } from '@/types/finance';

const textoDe = (v: Partial<Record<ChaveCaixinha, string>>): Record<ChaveCaixinha, string> =>
  ({ fixas: '35', cartaoDividas: '25', dizimo: '10', lazer: '10', investimento: '20', ...v });

describe('percentuais', () => {
  it('a distribuição padrão fecha 100%', () => {
    expect(somaPercentuais(PERCENTUAIS_PADRAO)).toBe(100);
    expect(CHAVES_CAIXINHAS).toEqual(['fixas', 'cartaoDividas', 'dizimo', 'lazer', 'investimento']);
  });

  it('sem documento usa o padrão; com documento corrige valores inválidos', () => {
    expect(normalizarPercentuais(undefined)).toEqual(PERCENTUAIS_PADRAO);
    expect(normalizarPercentuais({ fixas: 40, cartaoDividas: -5, dizimo: 'abc', lazer: 250, investimento: 12.345 }))
      .toEqual({ fixas: 40, cartaoDividas: 0, dizimo: 0, lazer: 100, investimento: 12.35 });
  });

  it('valida o formulário aceitando vírgula e campo vazio como zero', () => {
    const r = validarPercentuais(textoDe({ fixas: '33,5', lazer: '' }));
    expect(r).toEqual({ ok: true, valores: { fixas: 33.5, cartaoDividas: 25, dizimo: 10, lazer: 0, investimento: 20 } });
  });

  it('rejeita texto, negativo e acima de 100 com mensagem', () => {
    expect(validarPercentuais(textoDe({ dizimo: 'dez' }))).toEqual({ ok: false, erro: 'Informe um número válido em "Dízimo".' });
    expect(validarPercentuais(textoDe({ lazer: '-1' }))).toEqual({ ok: false, erro: '"Lazer" deve ficar entre 0% e 100%.' });
    expect(validarPercentuais(textoDe({ fixas: '101' }))).toEqual({ ok: false, erro: '"Contas Fixas" deve ficar entre 0% e 100%.' });
  });
});

describe('planejado, uso e situação', () => {
  it('calcula o valor planejado e arredonda em centavos', () => {
    expect(planejado(5000, 35)).toBe(1750);
    expect(planejado(1234.56, 33.3)).toBe(411.11);
    expect(planejado(0, 35)).toBe(0);
  });

  it('uso percentual: sem planejado, 100% se houve gasto e 0% se não houve', () => {
    expect(usoPercentual(1000, 500)).toBe(50);
    expect(usoPercentual(1000, 1200)).toBe(120);
    expect(usoPercentual(0, 10)).toBe(100);
    expect(usoPercentual(0, 0)).toBe(0);
  });

  it('classifica o uso: até 85% ok, acima de 85% atenção, acima de 100% estourou', () => {
    expect(situacaoDoUso(85)).toBe('ok');
    expect(situacaoDoUso(86)).toBe('atencao');
    expect(situacaoDoUso(100)).toBe('atencao');
    expect(situacaoDoUso(101)).toBe('estourou');
  });
});

describe('gasto automático e lançamento manual', () => {
  const t = { fixas: 1800, cartoes: 900.5, dividas: 300 };

  it('cada caixinha automática usa seus lançamentos; Dízimo e Lazer não têm cálculo', () => {
    expect(gastoAutomatico('fixas', t)).toBe(1800);
    expect(gastoAutomatico('cartaoDividas', t)).toBe(1200.5);
    expect(gastoAutomatico('dizimo', t)).toBe(0);
    expect(gastoAutomatico('lazer', t)).toBe(0);
    expect(gastoAutomatico('investimento', t, 750)).toBe(750);
  });

  it('só aceita lançamento manual numérico, finito e não negativo', () => {
    expect(valorManualValido({ lazer: 120.456 }, 'lazer')).toBe(120.46);
    expect(valorManualValido({ lazer: 0 }, 'lazer')).toBe(0);
    expect(valorManualValido({ lazer: -3 }, 'lazer')).toBeUndefined();
    expect(valorManualValido({ lazer: '50' }, 'lazer')).toBeUndefined();
    expect(valorManualValido({ lazer: Number.NaN }, 'lazer')).toBeUndefined();
    expect(valorManualValido(undefined, 'lazer')).toBeUndefined();
  });
});

describe('resumo das caixinhas', () => {
  const totais = { fixas: 1750, cartoes: 1000, dividas: 500 };

  it('planejado x gasto, com valor manual por cima do automático', () => {
    const r = resumoCaixinhas({ renda: 5000, pct: PERCENTUAIS_PADRAO, totais, manuais: { dizimo: 500, fixas: 2000 } });
    const por = Object.fromEntries(r.caixinhas.map((c) => [c.chave, c]));
    expect(por.fixas).toMatchObject({ planejado: 1750, gasto: 2000, gastoAuto: 1750, editado: true, usoPct: 114, situacao: 'estourou' });
    expect(por.cartaoDividas).toMatchObject({ planejado: 1250, gasto: 1500, editado: false, usoPct: 120, situacao: 'estourou' });
    expect(por.dizimo).toMatchObject({ planejado: 500, gasto: 500, editado: true, usoPct: 100, situacao: 'atencao' });
    expect(por.lazer).toMatchObject({ planejado: 500, gasto: 0, editado: false, usoPct: 0, situacao: 'ok' });
    expect(r.somaPct).toBe(100);
    expect(r.totalPlanejado).toBe(5000);
    expect(r.totalGasto).toBe(4000);
    expect(r.naoAlocado).toBe(0);
  });

  it('sem renda no mês: planejado zero, e gasto passa a contar como 100% de uso', () => {
    const r = resumoCaixinhas({ renda: 0, pct: PERCENTUAIS_PADRAO, totais });
    expect(r.totalPlanejado).toBe(0);
    expect(r.caixinhas.find((c) => c.chave === 'fixas')).toMatchObject({ planejado: 0, gasto: 1750, usoPct: 100 });
    expect(r.caixinhas.find((c) => c.chave === 'lazer')).toMatchObject({ gasto: 0, usoPct: 0 });
  });

  it('percentuais que passam de 100% deixam "sem caixinha" negativo', () => {
    const r = resumoCaixinhas({ renda: 1000, pct: { ...PERCENTUAIS_PADRAO, lazer: 30 }, totais });
    expect(r.somaPct).toBe(120);
    expect(r.naoAlocado).toBe(-200);
  });

  it('integra com os totais reais do mês (faturas, dívidas, fixas e renda)', () => {
    const fat = (id: string, valor: number): Com<Fatura> => ({ id, valor, status: 'Pendente', origem: 'manual' });
    const rendas: Renda[] = [{ nome: 'Salário', tipo: 'Salário CLT', valor: 4000, recorrencia: 'mensal' }];
    const entrada = {
      faturas: faturasPorMes({ a: [fat('2026-11', 600)], b: [fat('2026-11', 200)] }),
      dividas: [{ parcelas: gerarParcelas(150, 3, 0, '2026-11') }],
      fixas: [{ valor: 1200 }, { valor: 300 }],
      rendas,
    };
    const t = totaisDoMes('2026-11', entrada);
    const r = resumoCaixinhas({ renda: t.renda, pct: PERCENTUAIS_PADRAO, totais: t });
    expect(r.caixinhas.find((c) => c.chave === 'fixas')).toMatchObject({ planejado: 1400, gasto: 1500, situacao: 'estourou' });
    expect(r.caixinhas.find((c) => c.chave === 'cartaoDividas')).toMatchObject({ planejado: 1000, gasto: 950, usoPct: 95, situacao: 'atencao' });
  });
});
