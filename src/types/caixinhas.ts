/**
 * Caixinhas (envelopes do orçamento) — modelo de dados no Firestore, isolado em users/{uid}/...
 *   caixinhas/config            ConfigCaixinhas  percentual da renda mensal destinado a cada caixinha
 *   caixinhasGastos/{AAAA-MM}   GastosManuais    valores lançados ou editados à mão naquele mês
 *
 * Os valores "planejado" e "gasto automático" NÃO são gravados: são calculados a cada leitura
 * a partir de rendas, contas fixas, faturas e dívidas (ver src/lib/caixinhas.ts).
 */
export const CAIXINHAS = [
  { chave: 'fixas', nome: 'Contas Fixas', icone: '🏠', cor: '#0B3B8C', automatica: true },
  { chave: 'cartaoDividas', nome: 'Cartão de Crédito e Dívidas', icone: '💳', cor: '#DC2626', automatica: true },
  { chave: 'dizimo', nome: 'Dízimo', icone: '🙏', cor: '#F59E0B', automatica: false },
  { chave: 'lazer', nome: 'Lazer', icone: '🎮', cor: '#2563EB', automatica: false },
  // O app ainda não tem a seção Investimentos. Quando existir, troque para `automatica: true`
  // e passe a soma dos aportes do mês em `aportes` (ver resumoCaixinhas).
  { chave: 'investimento', nome: 'Investimento', icone: '💼', cor: '#16A34A', automatica: false },
] as const;

export type ChaveCaixinha = (typeof CAIXINHAS)[number]['chave'];
export const CHAVES_CAIXINHAS: ChaveCaixinha[] = CAIXINHAS.map((c) => c.chave);

export type Percentuais = Record<ChaveCaixinha, number>;

/** Distribuição inicial sugerida (a mesma do planejador em HTML). Soma 100%. */
export const PERCENTUAIS_PADRAO: Percentuais = {
  fixas: 35,
  cartaoDividas: 25,
  dizimo: 10,
  lazer: 10,
  investimento: 20,
};

export type ConfigCaixinhas = { pct: Percentuais; atualizadoEm?: unknown };

export type GastosManuais = { valores: Partial<Record<ChaveCaixinha, number>>; atualizadoEm?: unknown };

export type SituacaoUso = 'ok' | 'atencao' | 'estourou';
