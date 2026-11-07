import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const estado = vi.hoisted(() => ({
  carregando: false,
  erro: null as string | null,
  rendas: [{ id: 'r1', nome: 'Salário', tipo: 'Salário CLT', valor: 5000, recorrencia: 'mensal' }] as unknown[],
  fixas: [{ id: 'f1', nome: 'Aluguel', categoria: 'Moradia', valor: 1750 }] as unknown[],
  caixas: [
    { id: 'moradia', nome: 'Moradia', percentual: 35, icone: '🏠', cor: '#0B3B8C', origem: 'fixas', ativa: true },
    { id: 'viagem', nome: 'Viagem', percentual: 10, icone: '✈️', cor: '#2563EB', origem: 'manual', ativa: true },
  ] as unknown[],
  manuais: { viagem: 600 } as Record<string, number>,
}));

vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ user: { uid: 'u1' } }) }));
vi.mock('@/lib/colecao', () => ({
  useColecao: (caminho: string[] | null) => {
    const nome = caminho?.[caminho.length - 1];
    const itens = nome === 'rendas' ? estado.rendas : nome === 'fixas' ? estado.fixas : [];
    return { itens, carregando: estado.carregando, erro: estado.erro, adicionar: vi.fn(), salvar: vi.fn(), mesclar: vi.fn(), remover: vi.fn() };
  },
}));
vi.mock('@/lib/colecoes', () => ({ chaveDe: (c: string[]) => c.join('/'), useColecoes: () => ({ dados: {}, carregando: false, erro: null }) }));
vi.mock('@/lib/caixinhas-db', () => ({
  useCaixinhasUsuario: () => ({ itens: estado.caixas, carregando: false, erro: null, salvar: vi.fn(), arquivar: vi.fn(), restaurar: vi.fn() }),
  useGastosManuais: () => ({ valores: estado.manuais, carregando: false, erro: null, definir: vi.fn(), limpar: vi.fn() }),
}));

import CaixinhasPage from '@/app/(app)/caixinhas/page';
const html = () => renderToString(createElement(CaixinhasPage)).replace(/\u00a0/g, ' ').replace(/<!-- -->/g, '');

describe('página de caixinhas personalizadas', () => {
  it('mostra as categorias e gastos definidos pela pessoa', () => {
    estado.carregando = false; estado.erro = null;
    const h = html();
    expect(h).toContain('Caixinhas');
    expect(h).toContain('Moradia');
    expect(h).toContain('Viagem');
    expect(h).toContain('R$ 600,00');
    expect(h).toContain('120% da caixinha usado');
    expect(h).toContain('Criar caixinha');
  });

  it('oferece estado inicial para a conta que ainda não criou caixas', () => {
    estado.caixas = [];
    expect(html()).toContain('Crie caixinhas para os objetivos e despesas que importam para você');
    expect(html()).toContain('Criar minha primeira caixinha');
    estado.caixas = [
      { id: 'moradia', nome: 'Moradia', percentual: 35, icone: '🏠', cor: '#0B3B8C', origem: 'fixas', ativa: true },
      { id: 'viagem', nome: 'Viagem', percentual: 10, icone: '✈️', cor: '#2563EB', origem: 'manual', ativa: true },
    ];
  });

  it('avisa quando os percentuais não fecham 100%', () => {
    estado.caixas = [{ id: 'moradia', nome: 'Moradia', percentual: 45, icone: '🏠', cor: '#0B3B8C', origem: 'fixas', ativa: true }];
    expect(html()).toContain('Seus percentuais somam 45%');
    estado.caixas = [
      { id: 'moradia', nome: 'Moradia', percentual: 35, icone: '🏠', cor: '#0B3B8C', origem: 'fixas', ativa: true },
      { id: 'viagem', nome: 'Viagem', percentual: 10, icone: '✈️', cor: '#2563EB', origem: 'manual', ativa: true },
    ];
  });
});
