/**
 * Modelo de dados no Firestore. Tudo fica sob users/{uid}/..., isolado por usuário.
 *   users/{uid}/perfil/dados          -> Perfil
 *   users/{uid}/cartoes/{id}          -> Cartao (faturas em users/{uid}/cartoes/{id}/faturas/{ym})
 *   users/{uid}/dividas/{id}          -> Divida
 *   users/{uid}/rendas/{id}           -> Renda
 *   users/{uid}/fixas/{id}            -> ContaFixa (pagamentos por mês em fixasPagas/{ym})
 * Os módulos de cartões, dívidas, rendas e contas fixas entram na etapa 3.
 */
export type Perfil = {
  nome: string;
  idade?: number;
  anoIni: number;
  mesIni: number;
  anoFim: number;
  mesFim: number;
};

export const PERFIL_PADRAO: Perfil = {
  nome: '',
  anoIni: 2026,
  mesIni: 1,
  anoFim: 2027,
  mesFim: 12,
};

export type StatusFatura = 'Pendente' | 'Pago' | 'Em Atraso';

export type Cartao = {
  nome: string;
  bandeira: string;
  diaVencimento?: number;
  limite?: number;
  corBase: string;
};

export type Fatura = {
  ym: string; // AAAA-MM do mês em que a fatura é paga
  valor: number;
  status: StatusFatura;
};

export type ParcelaDivida = { ym: string; valor: number; paga: boolean };

export type Divida = {
  nome: string;
  credor?: string;
  categoria: string;
  parcelas: ParcelaDivida[];
};

export type Renda = { nome: string; tipo: string; valor: number; dia?: number };

export type ContaFixa = { nome: string; categoria: string; valor: number; dia?: number };
