import { describe, expect, it } from 'vitest';
import { faturasPorMes, totaisDoMes } from '@/lib/analises';
import {
  converterConfigLegada, gastoAutomatico, planejado, resumoCaixinhas, situacaoDoUso, somaPercentuais,
  usoPercentual, validarCaixinha, valorManualValido,
} from '@/lib/caixinhas';
import { gerarParcelas } from '@/lib/dividas';
import type { CaixinhaUsuario } from '@/types/caixinhas';
import type { Com, Fatura, Renda } from '@/types/finance';

const box = (nome: string, percentual: number, origem: CaixinhaUsuario['origem'] = 'manual', ativa = true): CaixinhaUsuario => ({
  nome, percentual, origem, ativa, icone: '🎯', cor: '#0B3B8C',
});

describe('caixinhas personalizadas', () => {
  it('começa sem categorias predefinidas e soma apenas as caixas ativas', () => {
    expect(resumoCaixinhas({ renda: 5000, caixinhas: [], totais: { fixas: 0, cartoes: 0, dividas: 0 } }).caixinhas).toEqual([]);
    expect(somaPercentuais([box('Moradia', 50), box('Viagem', 20), box('Arquivada', 30, 'manual', false)])).toBe(70);
  });

  it('converte a configuração antiga preservando os percentuais por usuário', () => {
    const convertido = converterConfigLegada({ pct: { fixas: 40, cartaoDividas: 20, dizimo: 5, lazer: 15, investimento: 20 } });
    expect(convertido?.map(({ id, dados }) => [id, dados.nome, dados.percentual])).toEqual([
      ['fixas', 'Contas Fixas', 40], ['cartaoDividas', 'Cartão de Crédito e Dívidas', 20],
      ['dizimo', 'Dízimo', 5], ['lazer', 'Lazer', 15], ['investimento', 'Investimento', 20],
    ]);
    expect(converterConfigLegada(undefined)).toBeNull();
  });

  it('valida nome e percentual, aceitando vírgula decimal', () => {
    expect(validarCaixinha('  Viagem  ', '12,5')).toEqual({ ok: true, valores: { nome: 'Viagem', percentual: 12.5 } });
    expect(validarCaixinha('', '10').ok).toBe(false);
    expect(validarCaixinha('A'.repeat(41), '10').ok).toBe(false);
    expect(validarCaixinha('Reserva', '101').ok).toBe(false);
    expect(validarCaixinha('Reserva', '-1').ok).toBe(false);
  });
});

describe('planejado, gasto e situação', () => {
  it('calcula percentuais da renda e arredonda em centavos', () => {
    expect(planejado(5000, 35)).toBe(1750);
    expect(planejado(1234.56, 33.3)).toBe(411.11);
  });

  it('calcula origens selecionadas e permite substituir manualmente', () => {
    const totais = { fixas: 1800, cartoes: 900.5, dividas: 300 };
    expect(gastoAutomatico('fixas', totais)).toBe(1800);
    expect(gastoAutomatico('cartaoDividas', totais)).toBe(1200.5);
    expect(gastoAutomatico('manual', totais)).toBe(0);
    expect(valorManualValido({ viagem: 120.456 }, 'viagem')).toBe(120.46);
    expect(valorManualValido({ viagem: -1 }, 'viagem')).toBeUndefined();

    const r = resumoCaixinhas({ renda: 5000, caixinhas: [
      { id: 'casa', dados: box('Moradia', 35, 'fixas') },
      { id: 'viagem', dados: box('Viagem', 10) },
    ], totais, manuais: { viagem: 600 } });
    expect(r.caixinhas[0]).toMatchObject({ planejado: 1750, gasto: 1800, automatica: true });
    expect(r.caixinhas[1]).toMatchObject({ planejado: 500, gasto: 600, editado: true, usoPct: 120, situacao: 'estourou' });
    expect(r.totalPlanejado).toBe(2250);
    expect(r.naoAlocado).toBe(2750);
  });

  it('classifica limites de uso', () => {
    expect(usoPercentual(0, 10)).toBe(100);
    expect(usoPercentual(0, 0)).toBe(0);
    expect(situacaoDoUso(85)).toBe('ok');
    expect(situacaoDoUso(86)).toBe('atencao');
    expect(situacaoDoUso(101)).toBe('estourou');
  });

  it('integra com os totais reais do mês sem impor categorias padrão', () => {
    const fat = (id: string, valor: number): Com<Fatura> => ({ id, valor, status: 'Pendente', origem: 'manual' });
    const rendas: Renda[] = [{ nome: 'Salário', tipo: 'Salário CLT', valor: 4000, recorrencia: 'mensal' }];
    const t = totaisDoMes('2026-11', {
      faturas: faturasPorMes({ a: [fat('2026-11', 600)] }),
      dividas: [{ parcelas: gerarParcelas(150, 3, 0, '2026-11') }], fixas: [{ valor: 1200 }], rendas,
    });
    const r = resumoCaixinhas({ renda: t.renda, caixinhas: [{ id: 'casa', dados: box('Casa', 40, 'fixas') }], totais: t });
    expect(r.caixinhas[0]).toMatchObject({ nome: 'Casa', planejado: 1600, gasto: 1200 });
  });
});
