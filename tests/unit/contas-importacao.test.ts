import { describe, expect, it } from 'vitest';
import { chaveExtrato, parseCsvExtrato, parseOfxExtrato } from '@/lib/contas-importacao';

describe('importação local de extratos bancários', () => {
  it('lê CSV brasileiro com ponto e vírgula, valores assinados, linhas vazias e texto entre aspas', () => {
    const parsed = parseCsvExtrato('\uFEFFData;Descrição;Valor\r\n05/11/2026;"Mercado; Central";-1.234,56\r\n06/11/2026;Salário;3200,00\r\n\r\n');
    expect(parsed.erros).toEqual([]);
    expect(parsed.linhas).toHaveLength(2);
    expect(parsed.linhas[0]).toMatchObject({ data: '2026-11-05', descricao: 'Mercado; Central', valor: 1234.56, tipo: 'saida' });
    expect(parsed.linhas[1]).toMatchObject({ data: '2026-11-06', valor: 3200, tipo: 'entrada' });
  });

  it('aceita o formato exato do prompt, com BOM, cabeçalho sem acento e bloco Markdown', () => {
    const fence = String.fromCharCode(96).repeat(3);
    const parsed = parseCsvExtrato('\uFEFF' + fence + 'csv\nData;Descricao;Valor\n"05/11/2026";"Conta de luz";"-89,90"\n' + fence + '\n');
    expect(parsed.erros).toEqual([]);
    expect(parsed.linhas).toMatchObject([{ data: '2026-11-05', descricao: 'Conta de luz', valor: 89.9, tipo: 'saida' }]);
  });

  it('classifica pagamento de fatura e guarda direção de transferência', () => {
    const parsed = parseCsvExtrato('Data,Descrição,Valor\n2026-11-05,Pagamento de fatura cartão,-500.00\n2026-11-06,Transferência para reserva,-100.00');
    expect(parsed.linhas[0].tipo).toBe('pagamento_fatura');
    expect(parsed.linhas[1]).toMatchObject({ tipo: 'transferencia', direcao: 'saida' });
  });

  it('mapeia extrato com colunas separadas de débito e crédito', () => {
    const parsed = parseCsvExtrato('Data;Descrição;Débito;Crédito\n05/11/2026;Farmácia;43,90;\n06/11/2026;Salário;;3000,00');
    expect(parsed.linhas.map((row) => [row.valor, row.tipo])).toEqual([[43.9, 'saida'], [3000, 'entrada']]);
  });

  it('aplica um mapeamento manual a CSV sem cabeçalho sem descartar a primeira movimentação', () => {
    const raw = '05/11/2026;Mercado;43,90\n06/11/2026;Salário;3000,00';
    const parsed = parseCsvExtrato(raw, { data: 0, descricao: 1, valor: 2 });
    expect(parsed.erros).toEqual([]);
    expect(parsed.linhas).toMatchObject([
      { linha: 1, data: '2026-11-05', descricao: 'Mercado', valor: 43.9 },
      { linha: 2, data: '2026-11-06', descricao: 'Salário', valor: 3000 },
    ]);
  });

  it('lê transações OFX, FITID e sinal de entrada/saída', () => {
    const parsed = parseOfxExtrato('<OFX><BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261105120000<TRNAMT>-52.30<FITID>fit-1<NAME>Farmacia</STMTTRN><STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261106120000<TRNAMT>1000.00<FITID>fit-2<NAME>Salario</STMTTRN></BANKTRANLIST></OFX>');
    expect(parsed.erros).toEqual([]);
    expect(parsed.linhas[0]).toMatchObject({ data: '2026-11-05', valor: 52.3, tipo: 'saida', idExterno: 'fit-1' });
    expect(parsed.linhas[1]).toMatchObject({ tipo: 'entrada', valor: 1000 });
  });

  it('lê OFX 1.x no formato SGML, sem tags de fechamento STMTTRN', () => {
    const parsed = parseOfxExtrato('<OFX><BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261105120000<TRNAMT>-52.30<FITID>fit-1<NAME>Farmacia<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261106120000<TRNAMT>1000.00<FITID>fit-2<NAME>Salario</BANKTRANLIST></OFX>');
    expect(parsed.erros).toEqual([]);
    expect(parsed.linhas).toHaveLength(2);
    expect(parsed.linhas[0]).toMatchObject({ data: '2026-11-05', valor: 52.3, tipo: 'saida', idExterno: 'fit-1' });
    expect(parsed.linhas[1]).toMatchObject({ tipo: 'entrada', valor: 1000, idExterno: 'fit-2' });
  });

  it('produz a mesma chave estável e diferencia ocorrências idênticas', () => {
    const row = { data: '2026-11-05', descricao: 'Mercado São João', valor: 22.5 };
    expect(chaveExtrato(row)).toBe(chaveExtrato(row));
    expect(chaveExtrato(row, 1)).not.toBe(chaveExtrato(row, 2));
  });

  it('retorna erros em linhas inválidas e quando não reconhece os cabeçalhos', () => {
    expect(parseCsvExtrato('nome;total\nPessoa;20').erros[0].linha).toBe(1);
    const parsed = parseCsvExtrato('Data;Descrição;Valor\n31/02/2026;Inválido;10,00');
    expect(parsed.erros[0]).toMatchObject({ linha: 2 });
  });
});
