export type PlanoId = 'mensal' | 'anual';

export const PLANOS: Record<PlanoId, { id: PlanoId; nome: string; valor: number; frequencia: number; frequenciaTipo: 'months'; descricao: string }> = {
  mensal: { id: 'mensal', nome: 'Premium mensal', valor: 11.99, frequencia: 1, frequenciaTipo: 'months', descricao: 'Cobrança mensal' },
  anual: { id: 'anual', nome: 'Premium anual', valor: 119.88, frequencia: 12, frequenciaTipo: 'months', descricao: 'Cobrança anual' },
};

/** Limites do plano Free; recursos com `false` são exclusivos do Premium. */
export const FREE_LIMITS = {
  cards: 1,
  bankAccounts: 1,
  debts: 1,
  dashboardCharts: 1,
  csvImport: false,
} as const;

export type LimitedResource = 'cards' | 'bankAccounts' | 'debts';

export function canAddResource(resource: LimitedResource, currentCount: number, premium: boolean): boolean {
  return premium || currentCount < FREE_LIMITS[resource];
}

export function canUseFeature(feature: 'csvImport', premium: boolean): boolean {
  return premium || FREE_LIMITS[feature];
}

export const RECURSOS = {
  free: ['Painel financeiro básico', '1 cartão, 1 conta fixa e 1 dívida', 'Cadastro e edição manual de faturas', '1 gráfico escolhido no painel'],
  premium: ['Todos os recursos Free', 'Mais cartões, contas fixas e dívidas', 'Importação de faturas por CSV', 'Gráficos e análises financeiras', 'Calendário de gastos por dia'],
} as const;

export function planoValido(valor: unknown): valor is PlanoId {
  return valor === 'mensal' || valor === 'anual';
}

export function matchesPlan(preapproval: {
  auto_recurring?: { frequency?: number; frequency_type?: string; transaction_amount?: number; currency_id?: string };
}, planId: string): boolean {
  if (!planoValido(planId)) return false;
  const recurring = preapproval.auto_recurring;
  const plan = PLANOS[planId];
  return recurring?.frequency === plan.frequencia
    && recurring.frequency_type === plan.frequenciaTipo
    && Number(recurring.transaction_amount) === plan.valor
    && recurring.currency_id === 'BRL';
}
