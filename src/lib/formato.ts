const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const brl = (v: number): string => moeda.format(Number.isFinite(v) ? v : 0);

/** Converte "1.234,56", "R$ 12,50", "-3,2" ou "1234.56" em número. NaN se não for número. */
export function lerDecimal(texto: string): number {
  let t = texto.replace(/R\$|\s/g, '').replace(/"/g, '');
  if (!t) return NaN;
  const virgula = t.lastIndexOf(',');
  const ponto = t.lastIndexOf('.');
  if (virgula > -1 && ponto > -1) {
    t = virgula > ponto ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (virgula > -1) {
    t = t.replace(',', '.');
  }
  return /^[-+]?\d*\.?\d+$/.test(t) ? Number(t) : NaN;
}

export const arredondar = (v: number): number => Math.round(v * 100) / 100;
