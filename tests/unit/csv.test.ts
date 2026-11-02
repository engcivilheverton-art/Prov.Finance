import { describe, expect, it } from 'vitest';
import { decodificar, detectarBanco, dividirLinhas, extrairParcela, identificar, lerCsv, sugerirMesFatura, totalGastos } from '@/lib/csv';

// Mesma estrutura do arquivo real do Bradesco (separador de linha \r, Windows-1252), com dados fictícios.
const BRADESCO = [
  'Data: 08/10/2026 10:54:31',
  'Situação da Fatura: ABERTA',
  'FULANO DE TAL ;;; 0000',
  'Data;Histórico;Valor(US$);Valor(R$);',
  '10/10;SALDO ANTERIOR ;0,00;1968,09',
  '06/10;LOJA UM ;0,00;19,90',
  '06/10;MERCADO DOIS Sa 3/12;0,00;64,90',
  '06/10;LOJA UM ;0,00;19,90',
  '05/10;PAGTO ANTECIPADO PIX ;0,00;-1968,09',
  '04/10;APP STORE ;0,00;5,90',
  'Total da fatura em Real: ;;;110,60',
  '* Fatura em Aberto: Valores sujeitos a alteração até o fechamento da fatura.',
  'Lançamentos programados',
  'FULANO DE TAL ;ou;; 0000',
  'Data;Histórico;Valor(US$);Valor(R$);',
  '20/05/2026;COMPRA PARCELADA ;;21,63',
  '07/06/2026;OUTRA PARCELADA ;;32,80',
  'Total para FULANO DE TAL:;;;54,43',
  'Resumo das Despesas;Real',
].join('\r');

describe('Bradesco', () => {
  const res = lerCsv(BRADESCO);

  it('detecta o banco e os metadados', () => {
    expect(res.banco).toBe('bradesco');
    expect(res.situacao).toBe('ABERTA');
    expect(res.exportadoEm).toEqual({ dia: 8, mes: 10, ano: 2026 });
  });

  it('lê lançamentos, ignora saldo anterior e separa os programados', () => {
    const normais = res.itens.filter((i) => !i.programado);
    const prog = res.itens.filter((i) => i.programado);
    expect(normais).toHaveLength(5);
    expect(prog).toHaveLength(2);
    expect(prog[0]).toMatchObject({ data: '20/05', valor: 21.63, descricao: 'COMPRA PARCELADA' });
    expect(normais.find((i) => i.descricao.startsWith('PAGTO'))?.valor).toBe(-1968.09);
    expect(normais.find((i) => i.descricao.startsWith('MERCADO'))).toMatchObject({ descricao: 'MERCADO DOIS', parcela: '3/12' });
  });

  it('total da fatura = soma dos gastos (sem pagamentos nem programados)', () => {
    expect(totalGastos(res.itens)).toBe(110.6);
  });

  it('sugere a fatura do mês seguinte ao da exportação', () => {
    expect(sugerirMesFatura(res)).toBe('2026-11');
    expect(sugerirMesFatura({ ...res, exportadoEm: { dia: 5, mes: 12, ano: 2026 } })).toBe('2027-01');
  });

  it('decodifica Windows-1252 quando o arquivo não é UTF-8', () => {
    const buf = Buffer.from('Situação;Histórico', 'latin1');
    expect(decodificar(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))).toBe('Situação;Histórico');
    const utf = new TextEncoder().encode('Situação;Histórico');
    expect(decodificar(utf.buffer as ArrayBuffer)).toBe('Situação;Histórico');
  });
});

describe('leitor genérico', () => {
  it('Nubank: gastos positivos, pagamento negativo', () => {
    const csv = ['date,category,title,amount', '2026-10-05,restaurante,Padaria,12.50', '2026-10-06,transporte,Uber,30.00', '2026-10-07,pagamento,Pagamento recebido,-500.00'].join('\n');
    const r = lerCsv(csv);
    expect(r.banco).toBe('nubank');
    expect(r.itens.map((i) => i.valor)).toEqual([12.5, 30, -500]);
    expect(r.itens[0].data).toBe('05/10');
    expect(totalGastos(r.itens)).toBe(42.5);
  });

  it('formato com ; e "R$", coluna Tipo e parcela', () => {
    const csv = ['Extrato do cartão', 'Data;Lançamento;Categoria;Tipo;Valor', '10/10/2026;LOJA X;Casa;Compra à vista;R$ 1.234,56', '11/10/2026;LOJA Y 2/6;Casa;Parcelado;R$ 100,00', '12/10/2026;PAGAMENTO FATURA;;Pagamento;R$ 900,00'].join('\n');
    const r = lerCsv(csv);
    expect(r.itens).toHaveLength(3);
    expect(r.itens[0]).toMatchObject({ valor: 1234.56, data: '10/10' });
    expect(r.itens[1]).toMatchObject({ parcela: '2/6', descricao: 'LOJA Y', valor: 100 });
    expect(r.itens[2].valor).toBe(-900);
  });

  it('normaliza quando o banco exporta gastos como negativos', () => {
    const csv = ['Data;Descrição;Valor', '01/10/2026;CAFE;-10,00', '02/10/2026;LIVRO;-20,00', '03/10/2026;PAGAMENTO RECEBIDO;30,00'].join('\n');
    const r = lerCsv(csv);
    expect(r.itens.map((i) => i.valor)).toEqual([10, 20, -30]);
    expect(totalGastos(r.itens)).toBe(30);
  });

  it('Banco do Brasil: valor com sufixo C/D, parcela e linhas de saldo ignoradas', () => {
    const csv = [
      'Banco do Brasil - Ourocard',
      'Data;Histórico;Parcela;Valor R$',
      '09/10/2026;SALDO FATURA ANTERIOR;;1.000,00 D',
      '10/10/2026;LOJA A;;123,45 D',
      '11/10/2026;MERCADO B;02/05;50,00 D',
      '12/10/2026;PAGAMENTO FATURA;;500,00 C',
      '13/10/2026;ESTORNO LOJA C;;10,00 C',
    ].join('\n');
    const r = lerCsv(csv);
    expect(r.banco).toBe('bb');
    expect(r.itens.map((i) => i.valor)).toEqual([123.45, 50, -500, -10]);
    expect(r.itens[1]).toMatchObject({ parcela: '02/05', descricao: 'MERCADO B' });
    expect(totalGastos(r.itens)).toBe(173.45);
  });

  it('Banco do Brasil: também lê valores com sinal, sem sufixo', () => {
    const csv = ['Banco do Brasil', 'Data;Histórico;Valor', '10/10/2026;LOJA A;123,45', '12/10/2026;PAGAMENTO RECEBIDO;-123,45'].join('\n');
    const r = lerCsv(csv);
    expect(r.banco).toBe('bb');
    expect(r.itens.map((i) => i.valor)).toEqual([123.45, -123.45]);
  });

  it('arquivo sem cabeçalho reconhecível não gera lançamentos', () => {
    expect(lerCsv('foo;bar\n1;2').itens).toEqual([]);
  });

  it('detectarBanco usa palavras do arquivo', () => {
    expect(detectarBanco(dividirLinhas('Extrato Itaú\nData;Lançamento;Valor'))).toBe('itau');
    expect(detectarBanco(dividirLinhas('Data;Descrição;Valor'))).toBe('generico');
  });
});

describe('identificar (deduplicação)', () => {
  const base = [
    { data: '06/10', descricao: 'CAFE', valor: 5 },
    { data: '06/10', descricao: 'CAFE', valor: 5 },
    { data: '07/10', descricao: 'LIVRO', valor: 40 },
  ];

  it('compras idênticas no mesmo dia continuam distintas', () => {
    const ids = identificar(base).map((i) => i.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('um arquivo mais novo reaproveita os ids dos lançamentos já importados', () => {
    const antigos = identificar(base).map((i) => i.id);
    const novos = identificar([...base, { data: '08/10', descricao: 'MERCADO', valor: 90 }]).map((i) => i.id);
    expect(novos.slice(0, 3)).toEqual(antigos);
    expect(novos).toHaveLength(4);
  });

  it('programado e lançamento normal nunca colidem', () => {
    const [a, b] = identificar([{ data: '01/10', descricao: 'X', valor: 1 }, { data: '01/10', descricao: 'X', valor: 1, programado: true }]);
    expect(a.id).not.toBe(b.id);
  });
});

describe('extrairParcela', () => {
  it('separa a parcela do fim da descrição', () => {
    expect(extrairParcela('LOJA Sa 03/12')).toEqual({ descricao: 'LOJA', parcela: '03/12' });
    expect(extrairParcela('LOJA 3/10')).toEqual({ descricao: 'LOJA', parcela: '3/10' });
    expect(extrairParcela('PADARIA CENTRAL')).toEqual({ descricao: 'PADARIA CENTRAL' });
  });
});
