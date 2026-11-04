/**
 * Categoria estimada pelo nome do estabelecimento. É uma heurística simples (palavras-chave), pensada
 * para dar uma visão geral — não substitui uma categorização feita pelo usuário.
 */
export const CATEGORIAS_COMPRA = [
  'Compras online', 'Mercado', 'Alimentação fora', 'Transporte', 'Saúde', 'Assinaturas',
  'Casa', 'Educação', 'Lazer e viagens', 'Taxas e serviços', 'Outros',
] as const;
export type CategoriaCompra = (typeof CATEGORIAS_COMPRA)[number];

const REGRAS: [CategoriaCompra, RegExp][] = [
  ['Compras online', /mercado ?livre|mercadolivre|amazon|shopee|aliexpress|shein|americanas|magalu|magazine|kabum|netshoes|\bml\*|\bmp\*/],
  ['Assinaturas', /netflix|spotify|disney|hbo|prime video|youtube|google (one|play)|apple\.com|icloud|globoplay|deezer|adobe|openai|chatgpt|assinatura/],
  ['Mercado', /supermerc|mercado|atacad|hortifruti|padaria|a[cç]ougue|sacol[aã]o|assai|carrefour|big bompreco|pao de acucar|feira/],
  ['Alimentação fora', /restaurante|lanchonete|pizzaria|hamburg|burger|ifood|rappi|cafeteria|\bcafe\b|\bbar\b|sorvet|churrasc|sushi|mcdonald|subway|outback|bk brasil/],
  ['Transporte', /\buber\b|\b99\b|99app|cabify|posto|combust|gasolina|shell|ipiranga|estacion|ped[aá]gio|sem parar|conectcar|metr[oô]|[oô]nibus|bilhete [uú]nico/],
  ['Saúde', /farm[aá]c|drogar|drogaria|\bdroga\b|hospital|cl[ií]nica|laborat|odonto|dentista|raia|pacheco|unimed|consulta|academia|smart ?fit/],
  ['Casa', /leroy|telhanorte|c&c|tok ?& ?stok|mobly|m[oó]veis|casas bahia|ponto frio|colch|decora|utilidades|condom[ií]nio/],
  ['Educação', /curso|escola|faculdade|universid|udemy|alura|coursera|livraria|saraiva|col[eé]gio|mensalidade/],
  ['Lazer e viagens', /cinema|ingresso|teatro|show|hotel|airbnb|booking|decolar|latam|\bgol\b|\bazul\b|clube|parque|viagem|hospedagem/],
  ['Taxas e serviços', /anuidade|tarifa|\biof\b|juros|seguro|\btaxa\b|multa|encargo|mora/],
];

const normalizar = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function categoriaDaCompra(descricao: string): CategoriaCompra {
  const alvo = normalizar(descricao);
  for (const [cat, re] of REGRAS) if (re.test(alvo)) return cat;
  return 'Outros';
}
