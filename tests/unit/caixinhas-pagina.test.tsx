import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

/**
 * Renderização da página com os dados do Firestore substituídos por valores fixos.
 * Confere o que a pessoa vê: valores planejado/gasto, avisos e estados de carregamento e de erro.
 */
const estado = vi.hoisted(() => ({
  carregando: false,
  erro: null as string | null,
  rendas: [{ id: 'r1', nome: 'Salário', tipo: 'Salário CLT', valor: 5000, recorrencia: 'mensal' }] as unknown[],
  fixas: [{ id: 'f1', nome: 'Aluguel', categoria: 'Moradia', valor: 1750 }] as unknown[],
  pct: { fixas: 35, cartaoDividas: 25, dizimo: 10, lazer: 10, investimento: 20 } as Record<string, number>,
  manuais: { lazer: 600 } as Record<string, number>,
}));

vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ user: { uid: 'u1' } }) }));
vi.mock('@/lib/colecao', () => ({
  useColecao: (caminho: string[] | null) => {
    const nome = caminho?.[caminho.length - 1];
    const itens = nome === 'rendas' ? estado.rendas : nome === 'fixas' ? estado.fixas : [];
    return { itens, carregando: estado.carregando, erro: estado.erro, adicionar: vi.fn(), salvar: vi.fn(), mesclar: vi.fn(), remover: vi.fn() };
  },
}));
vi.mock('@/lib/colecoes', () => ({
  chaveDe: (c: string[]) => c.join('/'),
  useColecoes: () => ({ dados: {}, carregando: false, erro: null }),
}));
vi.mock('@/lib/caixinhas-db', () => ({
  useConfigCaixinhas: () => ({ pct: estado.pct, existe: true, carregando: false, erro: null, salvar: vi.fn() }),
  useGastosManuais: () => ({ valores: estado.manuais, carregando: false, erro: null, definir: vi.fn(), limpar: vi.fn() }),
}));

import CaixinhasPage from '@/app/(app)/caixinhas/page';

const html = () => renderToString(createElement(CaixinhasPage)).replace(/\u00a0/g, ' ').replace(/<!-- -->/g, '');

describe('página de caixinhas', () => {
  it('mostra planejado, gasto automático e gasto lançado à mão', () => {
    estado.carregando = false; estado.erro = null;
    const h = html();
    expect(h).toContain('Caixinhas');
    // Contas Fixas: 35% de R$ 5.000,00 = R$ 1.750,00 planejado; gasto automático = fixas cadastradas
    expect(h).toContain('R$ 1.750,00');
    // Lazer: 10% = R$ 500,00 planejado; lançado à mão R$ 600,00 → 120% (estourou) e marcado como editado
    expect(h).toContain('R$ 600,00');
    expect(h).toContain('Gasto · editado');
    expect(h).toContain('120% da caixinha usado');
    // Dízimo: sem cálculo automático e sem lançamento
    expect(h).toContain('nenhum gasto lançado');
    expect(h).toContain('Editar percentuais');
  });

  it('avisa quando os percentuais não fecham 100%', () => {
    estado.pct = { ...estado.pct, lazer: 30 };
    expect(html()).toContain('Os percentuais somam 120%');
    estado.pct = { fixas: 35, cartaoDividas: 25, dizimo: 10, lazer: 10, investimento: 20 };
    expect(html()).not.toContain('Os percentuais somam');
  });

  it('sem renda no mês, orienta a cadastrar uma renda e não desenha a rosca', () => {
    estado.rendas = [];
    const h = html();
    expect(h).toContain('Cadastre uma em');
    expect(h).toContain('Sem renda no mês para repartir.');
    estado.rendas = [{ id: 'r1', nome: 'Salário', tipo: 'Salário CLT', valor: 5000, recorrencia: 'mensal' }];
  });

  it('durante o carregamento não mostra valores nem cartões', () => {
    estado.carregando = true;
    const h = html();
    expect(h).toContain('Carregando…');
    expect(h).not.toContain('da caixinha usado');
    estado.carregando = false;
  });

  it('mostra a mensagem de erro de leitura', () => {
    estado.erro = 'Não foi possível carregar os dados.';
    expect(html()).toContain('Não foi possível carregar os dados.');
    estado.erro = null;
  });
});
