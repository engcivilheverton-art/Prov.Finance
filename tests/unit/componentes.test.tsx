import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CalendarioGastos } from '@/components/CalendarioGastos';
import { CorpoBarras, GraficoRosca } from '@/components/graficos';
import type { Compra } from '@/lib/analises';

const limpar = (html: string) => html.replace(/\u00a0/g, ' ');
const conta = (html: string, trecho: string) => html.split(trecho).length - 1;

describe('GraficoBarras (corpo SVG)', () => {
  const rotulos = ['Nov/26', 'Dez/26', 'Jan/27'];

  it('desenha barras empilhadas, linha de renda e tabela de apoio para leitores de tela', () => {
    const html = renderToStaticMarkup(
      <CorpoBarras titulo="Despesas" largura={600} rotulos={rotulos}
        barras={[
          { nome: 'Cartões', cor: 'var(--ch-cartoes)', valores: [100, 200, 0] },
          { nome: 'Dívidas', cor: 'var(--ch-dividas)', valores: [50, 50, 50] },
        ]}
        linha={{ nome: 'Renda', cor: 'var(--ch-renda)', valores: [400, 400, 400] }} />,
    );
    expect(html).toContain('<svg');
    expect(html).toContain('aria-label="Despesas"');
    expect(conta(html, 'rx="3"')).toBe(5); // 5 valores não nulos
    expect(html).toContain('<polyline');
    expect(conta(html, 'class="ponto"')).toBe(3);
    expect(conta(html, '<tr>')).toBe(4); // cabeçalho + 3 meses
    expect(html).toContain('Nov/26');
    expect(limpar(html)).toContain('R$ 400,00');
  });

  it('pinta de vermelho os saldos negativos de uma série única', () => {
    const html = renderToStaticMarkup(
      <CorpoBarras titulo="Balanço" largura={600} rotulos={rotulos} barras={[{ nome: 'Saldo', cor: 'var(--ch-renda)', valores: [1200, -2300, 0] }]} />,
    );
    expect(conta(html, 'fill:var(--ch-renda)')).toBe(1);
    expect(conta(html, 'fill:var(--ch-neg)')).toBe(1);
    expect(html).toContain('class="eixo-zero"');
  });

  it('avisa quando não há valores', () => {
    const html = renderToStaticMarkup(<CorpoBarras titulo="Vazio" largura={600} rotulos={rotulos} barras={[{ nome: 'X', cor: 'red', valores: [0, 0, 0] }]} />);
    expect(html).toContain('Sem valores no período.');
    expect(html).not.toContain('<svg');
  });

  it('com muitos meses, mostra só alguns rótulos para não sobrepor', () => {
    const muitos = Array.from({ length: 24 }, (_, i) => `M${i}`);
    const html = renderToStaticMarkup(<CorpoBarras titulo="24 meses" largura={320} rotulos={muitos} barras={[{ nome: 'X', cor: 'red', valores: muitos.map(() => 10) }]} />);
    const rotulosNoEixo = conta(html, 'text-anchor="middle" class="eixo-texto"');
    expect(rotulosNoEixo).toBeLessThan(24);
    expect(rotulosNoEixo).toBeGreaterThan(2);
  });
});

describe('GraficoRosca', () => {
  it('mostra uma fatia por categoria com percentual e total', () => {
    const html = limpar(renderToStaticMarkup(<GraficoRosca titulo="Categorias" fatias={[
      { nome: 'Mercado', valor: 150, cor: 'var(--s1)' }, { nome: 'Transporte', valor: 50, cor: 'var(--s2)' },
    ]} />));
    expect(conta(html, '<circle')).toBe(2);
    expect(html).toContain('75%');
    expect(html).toContain('25%');
    expect(html).toContain('R$ 200,00');
  });
  it('mostra aviso sem gastos', () => {
    expect(renderToStaticMarkup(<GraficoRosca titulo="x" fatias={[]} />)).toContain('Sem gastos neste mês.');
  });
});

describe('CalendarioGastos', () => {
  const c = (id: string, dataIso: string, valor: number, descricao = 'LOJA'): Compra => ({ id, cartaoId: 'a', cartaoNome: 'Alfa', dataIso, descricao, valor });
  const compras = [c('1', '2026-10-06', 100), c('2', '2026-10-06', 50.5), c('3', '2026-10-20', 20)];

  it('desenha todos os dias, alinhados ao dia da semana, com os totais', () => {
    const html = limpar(renderToStaticMarkup(<CalendarioGastos ym="2026-10" compras={compras} hojeYm="2026-11" hojeDia={3} />));
    expect(conta(html, 'class="cal-dia')).toBe(31);
    expect(conta(html, 'class="cal-vazio"')).toBe(4); // 1º de outubro/2026 é quinta-feira
    expect(html).toContain('6 de outubro: R$ 150,50 em 2 lançamentos');
    expect(html).toContain('20 de outubro: R$ 20,00 em 1 lançamento"');
    expect(html).toContain('1 de outubro: sem gastos');
    expect(html).toContain('R$ 170,50'); // total do mês
  });

  it('avisa quando não há lançamentos no mês', () => {
    const html = renderToStaticMarkup(<CalendarioGastos ym="2026-10" compras={[]} hojeYm="2026-11" hojeDia={3} />);
    expect(html).toContain('Nenhum lançamento com data neste mês');
  });

  it('destaca o dia de hoje no mês corrente', () => {
    const html = renderToStaticMarkup(<CalendarioGastos ym="2026-11" compras={[]} hojeYm="2026-11" hojeDia={3} />);
    expect(conta(html, 'cal-dia hoje')).toBe(1);
  });
});
