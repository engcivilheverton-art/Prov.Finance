export type PlanoId = 'mensal' | 'anual';

export const PLANOS: Record<PlanoId, { id: PlanoId; nome: string; valor: number; frequencia: number; frequenciaTipo: 'months'; descricao: string }> = {
  mensal: { id: 'mensal', nome: 'Premium mensal', valor: 11.99, frequencia: 1, frequenciaTipo: 'months', descricao: 'Cobrança mensal' },
  anual: { id: 'anual', nome: 'Premium anual', valor: 119.88, frequencia: 12, frequenciaTipo: 'months', descricao: 'Cobrança anual' },
};

export const RECURSOS = {
  free: ['Painel financeiro básico', 'Rendas, dívidas e contas fixas', 'Cartões e faturas', 'Cadastro e edição manual de faturas'],
  premium: ['Todos os recursos Free', 'Importação de faturas por CSV', 'Gráficos e análises financeiras', 'Calendário de gastos por dia'],
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
