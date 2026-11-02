export const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
export const MESES_ABR = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** Mês no formato AAAA-MM (ordenável como texto). */
export function ymAtual(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function montarYm(ano: number, mes: number): string {
  return `${ano}-${String(mes).padStart(2, '0')}`;
}

export function somarMeses(ym: string, n: number): string {
  const [a, m] = ym.split('-').map(Number);
  const t = a * 12 + (m - 1) + n;
  return montarYm(Math.floor(t / 12), (t % 12) + 1);
}

export function rotuloYm(ym: string): string {
  const [a, m] = ym.split('-').map(Number);
  return `${MESES[m - 1]}/${a}`;
}

export function rotuloCurto(ym: string): string {
  const [a, m] = ym.split('-').map(Number);
  return `${MESES_ABR[m - 1]}/${String(a).slice(2)}`;
}

/** Lista de meses de `ini` a `fim`, inclusive. */
export function intervaloYm(ini: string, fim: string): string[] {
  const out: string[] = [];
  for (let ym = ini; ym <= fim && out.length < 600; ym = somarMeses(ym, 1)) out.push(ym);
  return out;
}
