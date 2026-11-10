import { describe, expect, it } from 'vitest';
import { lerCsv } from '@/lib/csv';
import { distribuirParcelamentos } from '@/lib/csv/parcelamentos';

describe('parcelamentos futuros de CSV do Bradesco', () => {
  it('continua a série de uma parcela programada 6/12 até 12/12', () => {
    const csv = [
      'Data: 09/11/2026 10:07:58',
      'Situacao da Fatura: ABERTA',
      'Data;Historico;Valor(US$);Valor(R$);',
      '05/11;COMPRA ATUAL;0,00;19,90',
      'Total da fatura em Real: ;;;19,90',
      '* Fatura em Aberto: Valores sujeitos a alteracao.',
      'Lancamentos programados',
      'Data;Historico;Valor(US$);Valor(R$);',
      '07/06/2026;RECARGAPAY*CLIENTE   SA 6/12;;32,80',
      'Total para CLIENTE DEMONSTRACAO:;;;32,80',
    ].join('\n');

    const resultado = lerCsv(csv);
    expect(resultado.banco).toBe('bradesco');
    expect(resultado.itens).toContainEqual(expect.objectContaining({
      descricao: 'RECARGAPAY*CLIENTE', parcela: '6/12', valor: 32.8, programado: true,
    }));

    const faturas = distribuirParcelamentos(resultado.itens, '2026-11');
    const futuras = faturas.filter((fatura) => fatura.ym !== '2026-11');
    expect(futuras.map((fatura) => [fatura.ym, fatura.itens[0]?.parcela])).toEqual([
      ['2026-12', '6/12'],
      ['2027-01', '7/12'],
      ['2027-02', '8/12'],
      ['2027-03', '9/12'],
      ['2027-04', '10/12'],
      ['2027-05', '11/12'],
      ['2027-06', '12/12'],
    ]);
    expect(futuras.flatMap((fatura) => fatura.itens).every((item) => !item.programado)).toBe(true);
  });
});
