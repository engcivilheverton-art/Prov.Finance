export type CategoriaUsuario = { nome: string; palavras: string[]; ordem: number };
export type CategoriaComId = CategoriaUsuario & { id: string };
export type RegraCategoria = { id: string; chave: string; categoriaId: string };

export const SEM_CATEGORIA = 'Sem categoria';
export const ID_META_SEMENTE = '__meta_seed';

/** Padrões técnicos contra abuso; não são limites de plano. Documentados também no README. */
export const LIMITES_CATEGORIAS = {
  nome: 30,
  palavra: 40,
  palavrasPorCategoria: 100,
  categorias: 50,
  regras: 5000,
  chaveRegra: 200,
} as const;

export const CATEGORIAS_PADRAO: Omit<CategoriaComId, 'id'>[] = [
  { nome: 'Supermercado', ordem: 0, palavras: ['SUPERMERC', 'CARREFOUR', 'ATACADAO', 'ASSAI', 'SUPERNOSSO', 'VERDEMAR', 'BH SUPER', 'HIPERMERC', 'HORTIFRUTI'] },
  { nome: 'Restaurantes', ordem: 1, palavras: ['IFD*', 'IFOOD', 'UBER EATS', 'UBEREATS', 'RESTAUR', 'LANCHONETE', 'PIZZ', 'BURGER', 'HAMBURG', 'PADARIA', 'CAFETERIA', 'SORVET', 'MCDONALD', 'MC DONALD', 'HABIBS', 'OUTBACK', 'CHURRASC', 'ACAI'] },
  { nome: 'Saúde', ordem: 2, palavras: ['DROGA', 'FARMAC', 'PAGUE MENOS', 'PACHECO', 'CLINICA', 'LABORATOR', 'HOSPITAL', 'ODONTO', 'UNIMED'] },
  { nome: 'Compras', ordem: 3, palavras: ['MERCADOLIVRE', 'MERCADO LIVRE', 'AMAZON MKTP', 'AMAZON.COM', 'SHOPEE', 'MAGALU', 'MAGAZINE LUIZA', 'SHEIN', 'ALIEXPRESS', 'AMERICANAS', 'RENNER', 'RIACHUELO', 'ZARA', 'KABUM'] },
  { nome: 'Assinatura', ordem: 4, palavras: ['NETFLIX', 'SPOTIFY', 'DISNEY', 'HBO', 'PRIME VIDEO', 'AMAZON PRIME', 'YOUTUBE', 'DEEZER', 'APPLE.COM/BILL', 'GLOBOPLAY', 'CLARO VIDEO'] },
  { nome: 'Lazer', ordem: 5, palavras: ['CINEMA', 'CINEMARK', 'INGRESSO', 'SYMPLA', 'STEAM', 'PLAYSTATION', 'XBOX', 'NINTENDO', 'TEATRO'] },
  { nome: 'Viagens', ordem: 6, palavras: ['LATAM', 'GOL LINHAS', 'AZUL LINHAS', 'AIRBNB', 'BOOKING', 'HOTEL', 'POUSADA', 'DECOLAR', 'HURB', 'CVC VIAGENS'] },
  { nome: 'Transporte', ordem: 7, palavras: ['VELOE', 'SEM PARAR', 'CONECTCAR', 'UBER', 'CABIFY', 'POSTO', 'SHELL', 'IPIRANGA', 'ESTACIONAMENTO', 'ESTAPAR', 'METRO', 'BHTRANS'] },
  { nome: 'Estética', ordem: 8, palavras: ['SALAO', 'BARBEARIA', 'ESTETIC', 'BELEZA', 'BOTICARIO', 'NATURA', 'MANICURE', 'SOBRANCELHA', 'DEPILA', 'SPA'] },
];

export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
}

export function chaveBase(descricao: string): string {
  return normalizar(descricao).replace(/\s\d{1,2}\/\d{1,2}$/, '').trim();
}

export function palavraCasa(descricaoNormalizada: string, palavra: string): boolean {
  const termo = normalizar(palavra);
  if (!termo) return false;
  const escapado = termo.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  return new RegExp(`(^|[^A-Z0-9])${escapado}`).test(descricaoNormalizada);
}

export function categoriaDoItem(descricao: string, categorias: CategoriaComId[], regras: RegraCategoria[]): string {
  const chave = chaveBase(descricao);
  const regra = regras.find((item) => item.chave === chave);
  if (regra && categorias.some((categoria) => categoria.id === regra.categoriaId)) {
    return categorias.find((categoria) => categoria.id === regra.categoriaId)!.nome;
  }
  const alvo = normalizar(descricao);
  const ordem = [...categorias].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome));
  return ordem.find((categoria) => categoria.palavras.some((palavra) => palavraCasa(alvo, palavra)))?.nome ?? SEM_CATEGORIA;
}

export function idCategoriaPadrao(nome: string): string {
  return `padrao-${normalizar(nome).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

/** Identificador estável seguro para Firestore mesmo quando a descrição contém barras. */
export async function idRegraCategoria(chave: string): Promise<string> {
  const bytes = new TextEncoder().encode(chaveBase(chave));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function validarNomeCategoria(nome: string, categorias: CategoriaComId[]): string | null {
  const limpo = nome.trim().replace(/\s+/g, ' ');
  if (!limpo) return 'Informe o nome da categoria.';
  if (limpo.length > LIMITES_CATEGORIAS.nome) return `O nome pode ter até ${LIMITES_CATEGORIAS.nome} caracteres.`;
  if (normalizar(limpo) === normalizar(SEM_CATEGORIA)) return `“${SEM_CATEGORIA}” é reservado.`;
  if (categorias.some((categoria) => normalizar(categoria.nome) === normalizar(limpo))) return 'Já existe uma categoria com esse nome.';
  return null;
}

export function validarPalavrasCategoria(palavras: string[]): string | null {
  if (palavras.length > LIMITES_CATEGORIAS.palavrasPorCategoria) return `Use até ${LIMITES_CATEGORIAS.palavrasPorCategoria} palavras-chave por categoria.`;
  if (palavras.some((palavra) => !palavra.trim() || palavra.trim().length > LIMITES_CATEGORIAS.palavra)) return `Cada palavra-chave deve ter de 1 a ${LIMITES_CATEGORIAS.palavra} caracteres.`;
  return null;
}

export function validarChaveRegra(chave: string): string | null {
  if (!chave) return 'A descrição não contém texto para criar uma regra.';
  if (chave.length > LIMITES_CATEGORIAS.chaveRegra) return `A descrição é longa demais para salvar uma regra (máximo ${LIMITES_CATEGORIAS.chaveRegra} caracteres).`;
  return null;
}

export function removerCategoriaERegras(categorias: CategoriaComId[], regras: RegraCategoria[], categoriaId: string) {
  return {
    categorias: categorias.filter((categoria) => categoria.id !== categoriaId),
    regras: regras.filter((regra) => regra.categoriaId !== categoriaId),
  };
}
