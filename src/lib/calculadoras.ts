import taxTables from '@/vendor/calculadora-trabalhador/tax-tables.json';
import CTCore from '@/vendor/calculadora-trabalhador/ct-core.js';
import toolData from '@/content/calculadoras/tools.json';

export type FerramentaCalculadora = {
  slug: string;
  order: number;
  title: string;
  h1: string;
  subtitle: string;
  hub: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string;
};

export type LinhaResultado = { label: string; value: number | string; kind: 'money' | 'text'; tone?: 'blue' | 'green' | 'red' | null };
export type ResultadoCalculadora = { ok: true; title: string; rows: LinhaResultado[]; total: LinhaResultado | null; notes: string[]; data: Record<string, unknown> } | { ok: false; error: string };
type ApiCore = {
  createCalculators(tables: typeof taxTables): {
    calculate(slug: string, values: Record<string, string | number | boolean>): unknown;
    formatRow(row: LinhaResultado): string;
    toText(result: unknown): string;
  };
};

export const anoTabelas = taxTables.ano;
export const ferramentas = (toolData as FerramentaCalculadora[]).map((item) => ({
  ...item,
  metaTitle: item.metaTitle.replaceAll('{{ANO}}', String(anoTabelas)),
  metaDescription: item.metaDescription.replaceAll('{{ANO}}', String(anoTabelas)),
  hub: item.hub.replaceAll('{{ANO}}', String(anoTabelas)),
})).sort((a, b) => a.order - b.order);

// O núcleo original espera ct-tables.js gerado. Aqui inicializamos o mesmo
// núcleo diretamente com tax-tables.json, mantendo uma única fonte legal.
const CT = (CTCore as unknown as ApiCore).createCalculators(taxTables);

export function obterFerramenta(slug: string) {
  return ferramentas.find((item) => item.slug === slug);
}

export function calcular(slug: string, values: Record<string, string | number | boolean>): ResultadoCalculadora {
  return CT.calculate(slug, values) as ResultadoCalculadora;
}

export function formatarLinha(row: LinhaResultado) {
  return CT.formatRow(row);
}

export function resultadoEmTexto(result: ResultadoCalculadora) {
  return result.ok ? CT.toText(result) : result.error;
}
