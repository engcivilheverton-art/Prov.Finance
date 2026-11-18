export type PlanoId = 'mensal' | 'anual';

export const PLANOS: Record<PlanoId, { id: PlanoId; nome: string; valor: number; frequencia: number; frequenciaTipo: 'months'; descricao: string }> = {
  mensal: { id: 'mensal', nome: 'Premium mensal', valor: 9.90, frequencia: 1, frequenciaTipo: 'months', descricao: 'Cobrança mensal' },
  anual: { id: 'anual', nome: 'Premium anual', valor: 94.80, frequencia: 12, frequenciaTipo: 'months', descricao: 'Cobrança anual' },
};

// Mantém assinaturas já contratadas válidas pelos valores originais.
const PRECOS_ANTERIORES: Record<PlanoId, readonly number[]> = {
  mensal: [11.99],
  anual: [119.88],
};

/** Limites do plano Free; recursos com `false` são exclusivos do Premium. */
export const FREE_LIMITS = {
  cards: 2,
  fixedAccounts: 1,
  bankAccounts: 1,
  debts: 1,
  dashboardCharts: 1,
  csvImport: false,
} as const;

export type LimitedResource = 'cards' | 'fixedAccounts' | 'bankAccounts' | 'debts';

export function canAddResource(resource: LimitedResource, currentCount: number, premium: boolean): boolean {
  return premium || currentCount < FREE_LIMITS[resource];
}

export function canUseFeature(feature: 'csvImport', premium: boolean): boolean {
  return premium || FREE_LIMITS[feature];
}

export const RECURSOS = {
  free: ['Painel financeiro básico', '2 cartões, 1 conta bancária, 1 conta fixa e 1 dívida', 'Cadastro e edição manual de faturas', '1 gráfico escolhido no painel'],
  premium: ['Todos os recursos Free', 'Mais cartões, contas bancárias, contas fixas e dívidas', 'Importação de extratos e faturas', 'Gráficos e análises financeiras', 'Calendário de gastos por dia'],
} as const;

export function planoValido(valor: unknown): valor is PlanoId {
  return valor === 'mensal' || valor === 'anual';
}

type PreapprovalPlan = {
  auto_recurring?: { frequency?: number; frequency_type?: string; transaction_amount?: number; currency_id?: string };
};

function matchesPlanPrices(preapproval: PreapprovalPlan, planId: PlanoId, valores: number[]): boolean {
  const recurring = preapproval.auto_recurring;
  const plan = PLANOS[planId];
  return recurring?.frequency === plan.frequencia
    && recurring.frequency_type === plan.frequenciaTipo
    && valores.includes(Number(recurring.transaction_amount))
    && recurring.currency_id === 'BRL';
}

/** Valida o preço atual usado para gerar um novo checkout. */
export function matchesCurrentPlan(preapproval: PreapprovalPlan, planId: string): boolean {
  if (!planoValido(planId)) return false;
  return matchesPlanPrices(preapproval, planId, [PLANOS[planId].valor]);
}

/** Valida o preço atual e os valores históricos para preservar assinaturas existentes. */
export function matchesPlan(preapproval: PreapprovalPlan, planId: string): boolean {
  if (!planoValido(planId)) return false;
  return matchesPlanPrices(preapproval, planId, [PLANOS[planId].valor, ...PRECOS_ANTERIORES[planId]]);
}
