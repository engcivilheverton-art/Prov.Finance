export type PlanoAssinatura = 'mensal' | 'anual';

export const PLANOS_ASSINATURA = {
  mensal: { nome: 'Plano mensal PROV', valor: 11.99, frequencia: 1, tipoFrequencia: 'months' },
  anual: { nome: 'Plano anual PROV', valor: 119.88, frequencia: 12, tipoFrequencia: 'months' },
} as const satisfies Record<PlanoAssinatura, { nome: string; valor: number; frequencia: number; tipoFrequencia: 'months' }>;

export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://prov-financeiro.vercel.app').replace(/\/$/, '');

export function mercadoPagoConfigurado() {
  return Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN);
}
