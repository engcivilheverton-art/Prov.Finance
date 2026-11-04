/** Eixo "bonito" para gráficos: passos de 1, 2, 2,5, 5 × 10^n que cobrem [min, max]. */
export function escalaBonita(min: number, max: number, alvo = 4): { min: number; max: number; ticks: number[] } {
  const baixo = Math.min(0, min);
  const alto = Math.max(max, baixo + 1);
  const bruto = (alto - baixo) / alvo;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const n = bruto / mag;
  const passo = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  const lo = Math.floor(baixo / passo) * passo;
  const hi = Math.ceil(alto / passo) * passo;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + passo / 1000; v += passo) ticks.push(Math.round(v * 100) / 100);
  return { min: lo, max: hi, ticks };
}

/** 1.234 → "1,2k"; 12.500 → "13k"; valores pequenos ficam inteiros. */
export function abreviar(v: number): string {
  const a = Math.abs(v);
  const s = v < 0 ? '−' : '';
  if (a >= 1_000_000) return `${s}${(a / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (a >= 10_000) return `${s}${Math.round(a / 1000)}k`;
  if (a >= 1000) return `${s}${(a / 1000).toFixed(1).replace('.', ',')}k`;
  return `${s}${Math.round(a)}`;
}
