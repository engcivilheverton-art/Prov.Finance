/**
 * Modelo de dados no Firestore (tudo isolado em users/{uid}/...).
 *   perfil/dados                              Perfil
 *   cartoes/{id}                              Cartao
 *   cartoes/{id}/faturas/{AAAA-MM}            Fatura  (mês em que a fatura é paga)
 *   cartoes/{id}/faturas/{AAAA-MM}/itens/{id} ItemFatura (lançamentos importados do CSV)
 *   dividas/{id}                              Divida (com a lista de parcelas)
 *   rendas/{id}                               Renda
 *   fixas/{id}                                ContaFixa
 *   fixasPagas/{AAAA-MM}                      PagamentosFixas
 */
export type Perfil = {
  nome: string;
  idade?: number;
  anoIni: number;
  mesIni: number;
  anoFim: number;
  mesFim: number;
};

export const PERFIL_PADRAO: Perfil = { nome: '', anoIni: 2026, mesIni: 1, anoFim: 2027, mesFim: 12 };

export type Com<T> = T & { id: string };

export type Cartao = {
  nome: string;
  banco?: string;
  bandeira: string;
  diaVencimento?: number;
  limite?: number;
  corBase: string;
};

export type StatusFatura = 'Pendente' | 'Pago';

export type Fatura = {
  valor: number;
  status: StatusFatura;
  origem: 'manual' | 'csv';
  atualizadaEm?: string;
};

export type ItemFatura = {
  data: string; // DD/MM
  descricao: string;
  parcela?: string;
  valor: number; // positivo = gasto, negativo = pagamento/estorno
  programado?: boolean; // parcelamento futuro (não entra no total da fatura)
  ignorado?: boolean; // lançamento mantido para consulta, mas fora dos totais e análises
  competenciaYm?: string; // mês em que a parcela entra na fatura, mesmo com a data original da compra
};

export type ParcelaDivida = { ym: string; valor: number; paga: boolean };

export type Divida = {
  nome: string;
  credor?: string;
  categoria: string;
  parcela: number;
  inicio: string; // AAAA-MM da 1ª parcela
  diaVencimento?: number;
  parcelas: ParcelaDivida[];
};

export type Renda = {
  nome: string;
  tipo: string;
  valor: number;
  recorrencia: 'mensal' | 'unica';
  ym?: string; // obrigatório quando recorrencia === 'unica'
  dia?: number;
};

export type ContaFixa = { nome: string; categoria: string; valor: number; dia?: number };

export type PagamentosFixas = { pagas: Record<string, boolean> };

// Cores sólidas inspiradas na marca PROV e nas instituições disponíveis no cadastro.
export const PALETA_CARTAO = [
  { nome: 'Marinho', base: '#142b4a' },
  { nome: 'Verde', base: '#047857' },
  { nome: 'Aço', base: '#55677f' },
  { nome: 'Dourado', base: '#8a6d1f' },
  { nome: 'Grafite', base: '#0f172a' },
  { nome: 'Petróleo', base: '#0b4f5c' },
  { nome: 'Roxo', base: '#4c1d95' },
  { nome: 'Vinho', base: '#7f1d1d' },
  { nome: 'Itaú', base: '#b84d00' },
  { nome: 'Caixa', base: '#005ca9' },
  { nome: 'Santander', base: '#c8102e' },
  { nome: 'Banco do Brasil', base: '#003a70' },
  { nome: 'C6', base: '#292929' },
  { nome: 'Mercado Pago', base: '#007eb5' },
  { nome: 'Inter', base: '#c94e00' },
  { nome: 'Bradesco', base: '#b00020' },
  { nome: 'Nubank', base: '#6a00ad' },
] as const;

export const CATEGORIAS_DIVIDA = [
  'Empréstimo pessoal', 'Financiamento imobiliário', 'Financiamento de veículo',
  'Cartão de crédito', 'Cheque especial', 'Acordo / renegociação', 'Outra',
];
export const TIPOS_RENDA = ['Salário CLT', 'Salário PJ', 'Freelance', 'Aluguel', 'Dividendos', 'Pensão', 'Outro'];
export const CATEGORIAS_FIXA = [
  'Moradia', 'Alimentação', 'Transporte', 'Saúde', 'Educação', 'Lazer',
  'Assinaturas', 'Telefonia / Internet', 'Seguro', 'Outra',
];
