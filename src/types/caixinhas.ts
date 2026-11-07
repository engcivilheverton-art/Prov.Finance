/** Cada pessoa define as próprias categorias de orçamento. */
export type OrigemCaixinha = 'manual' | 'fixas' | 'cartaoDividas';

export type CaixinhaUsuario = {
  nome: string;
  percentual: number;
  icone: string;
  cor: string;
  origem: OrigemCaixinha;
  ativa: boolean;
  atualizadoEm?: unknown;
};

/** Formato antigo salvo antes das caixas personalizadas. Usado só na migração. */
export const CAIXINHAS_LEGADAS = [
  { id: 'fixas', nome: 'Contas Fixas', icone: '🏠', cor: '#0B3B8C', origem: 'fixas' },
  { id: 'cartaoDividas', nome: 'Cartão de Crédito e Dívidas', icone: '💳', cor: '#DC2626', origem: 'cartaoDividas' },
  { id: 'dizimo', nome: 'Dízimo', icone: '🙏', cor: '#F59E0B', origem: 'manual' },
  { id: 'lazer', nome: 'Lazer', icone: '🎮', cor: '#2563EB', origem: 'manual' },
  { id: 'investimento', nome: 'Investimento', icone: '💼', cor: '#16A34A', origem: 'manual' },
] as const;

export type ChaveCaixinha = string;
export type GastosManuais = Record<string, number>;
export type SituacaoUso = 'ok' | 'atencao' | 'estourou';
