import { arredondar, lerDecimal } from '@/lib/formato';
import type { ItemFatura } from '@/types/finance';

export type BancoId = 'bradesco' | 'bb' | 'nubank' | 'inter' | 'itau' | 'mercadopago' | 'c6' | 'generico';

export const NOMES_BANCO: Record<BancoId, string> = {
  bradesco: 'Bradesco', bb: 'Banco do Brasil', nubank: 'Nubank', inter: 'Banco Inter', itau: 'Itaú',
  mercadopago: 'Mercado Pago', c6: 'C6 Bank', generico: 'Formato genérico',
};

export type ResultadoCsv = {
  banco: BancoId;
  itens: ItemFatura[];
  situacao?: string;
  /** Data em que o arquivo foi gerado, quando o banco informa. */
  exportadoEm?: { dia: number; mes: number; ano: number };
};

/** Bancos digitais exportam em UTF-8; o Bradesco e outros usam Windows-1252. */
export function decodificar(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

export function dividirLinhas(texto: string): string[] {
  return texto.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean);
}

const semAcento = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function detectarBanco(linhas: string[]): BancoId {
  const topo = semAcento(linhas.slice(0, 40).join('\n'));
  if (topo.includes('situacao da fatura') || /valor\(r\$\)/.test(topo)) return 'bradesco';
  if (topo.includes('banco do brasil') || topo.includes('ourocard') || topo.includes('bb.com.br')) return 'bb';
  if (topo.includes('nubank')) return 'nubank';
  if (topo.includes('banco inter') || /\binter\b/.test(topo)) return 'inter';
  if (topo.includes('itau')) return 'itau';
  if (topo.includes('mercado pago') || topo.includes('mercadopago')) return 'mercadopago';
  if (topo.includes('c6 bank') || /\bc6\b/.test(topo)) return 'c6';
  const cab = semAcento(linhas[0] ?? '');
  if (/^date,(category,)?title,amount/.test(cab)) return 'nubank';
  return 'generico';
}

/** "Sa 3/12", "03/12" no fim da descrição → parcela "3/12". */
export function extrairParcela(desc: string): { descricao: string; parcela?: string } {
  const m = desc.match(/(?:\s[A-Za-z]{2})?\s(\d{1,2}\/\d{1,2})\s*$/);
  if (!m) return { descricao: desc.trim() };
  return { descricao: desc.slice(0, m.index).trim(), parcela: m[1] };
}

function normalizarData(texto: string): string | null {
  const t = texto.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?/);
  if (m) return `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}`;
  return null;
}

// ── Bradesco ─────────────────────────────────────────────────────────────────
function ehCabecalhoBradesco(l: string) {
  return l.startsWith('Data;') && l.includes('Valor(R$)');
}

function lerBlocoBradesco(linhas: string[], de: number, programado: boolean): ItemFatura[] {
  const itens: ItemFatura[] = [];
  for (let i = de; i < linhas.length; i++) {
    const l = linhas[i];
    if (/^Total/i.test(l) || /^\*/.test(l) || ehCabecalhoBradesco(l)) break;
    const c = l.split(';');
    const data = normalizarData(c[0] ?? '');
    if (!data) continue;
    if (/SALDO ANTERIOR/i.test(c[1] ?? '')) continue;
    const valor = lerDecimal(c[3] ?? '');
    if (Number.isNaN(valor)) continue;
    const { descricao, parcela } = extrairParcela((c[1] ?? '').trim());
    const item: ItemFatura = { data, descricao, valor };
    if (parcela) item.parcela = parcela;
    if (programado) item.programado = true;
    itens.push(item);
  }
  return itens;
}

function lerBradesco(linhas: string[]): ResultadoCsv {
  const situacao = linhas.find((l) => l.startsWith('Situa'))?.split(':')[1]?.trim();
  const dataLinha = linhas.find((l) => l.startsWith('Data:'))?.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  const cabs = linhas.map((l, i) => (ehCabecalhoBradesco(l) ? i : -1)).filter((i) => i >= 0);
  const itens: ItemFatura[] = [];
  if (cabs[0] !== undefined) itens.push(...lerBlocoBradesco(linhas, cabs[0] + 1, false));
  if (cabs[1] !== undefined) itens.push(...lerBlocoBradesco(linhas, cabs[1] + 1, true));
  return {
    banco: 'bradesco',
    itens,
    situacao,
    exportadoEm: dataLinha ? { dia: +dataLinha[1], mes: +dataLinha[2], ano: +dataLinha[3] } : undefined,
  };
}

// ── Leitor genérico guiado pelo cabeçalho (Nubank, Inter, Itaú, Mercado Pago, C6...) ──
function dividirCampos(linha: string, sep: string): string[] {
  const out: string[] = [];
  let atual = '';
  let aspas = false;
  for (const ch of linha) {
    if (ch === '"') aspas = !aspas;
    else if (ch === sep && !aspas) { out.push(atual); atual = ''; }
    else atual += ch;
  }
  out.push(atual);
  return out.map((c) => c.trim());
}

type Colunas = { data: number; descricao: number; valor: number; tipo: number; parcela: number };

function mapearColunas(campos: string[]): Colunas | null {
  const n = campos.map(semAcento);
  const achar = (pred: (c: string) => boolean) => n.findIndex(pred);
  const data = achar((c) => c.startsWith('data') || c.startsWith('date'));
  const descricao = achar((c) => ['descri', 'lancamento', 'historico', 'estabelecimento', 'title', 'titulo', 'detalhe'].some((k) => c.includes(k)));
  const valor = achar((c) => c.includes('valor') || c.includes('amount'));
  if (data < 0 || descricao < 0 || valor < 0) return null;
  return {
    data, descricao, valor,
    tipo: achar((c) => c === 'tipo' || c.includes('natureza')),
    parcela: achar((c) => c.includes('parcela')),
  };
}

const REGEX_CREDITO = /pagamento|estorno|credito|reembolso|cashback|desconto/;
const REGEX_GASTO = /compra|debito|despesa|parcelad|saque/;

function lerGenerico(linhas: string[], banco: BancoId): ResultadoCsv {
  const sep = [';', ',', '\t'].map((s) => ({ s, n: linhas.slice(0, 10).join('\n').split(s).length })).sort((a, b) => b.n - a.n)[0].s;
  let cols: Colunas | null = null;
  let inicio = 0;
  for (let i = 0; i < Math.min(linhas.length, 30); i++) {
    cols = mapearColunas(dividirCampos(linhas[i], sep));
    if (cols) { inicio = i + 1; break; }
  }
  if (!cols) return { banco, itens: [] };

  type Bruto = { data: string; descricao: string; parcela?: string; valor: number; classe: 'gasto' | 'credito' | null };
  const brutos: Bruto[] = [];
  for (let i = inicio; i < linhas.length; i++) {
    const c = dividirCampos(linhas[i], sep);
    const data = normalizarData(c[cols.data] ?? '');
    // Alguns bancos (ex.: Banco do Brasil) terminam o valor com C (crédito) ou D (débito).
    const brutoValor = (c[cols.valor] ?? '').trim();
    const marca = brutoValor.match(/\d\s*([CD])$/i)?.[1]?.toUpperCase();
    const valor = lerDecimal(marca ? brutoValor.slice(0, -1) : brutoValor);
    if (!data || Number.isNaN(valor)) continue;
    const bruta = (c[cols.descricao] ?? '').replace(/"/g, '');
    if (/^\s*(saldo (da fatura |fatura )?anterior|saldo atual|total)\b/i.test(semAcento(bruta))) continue;
    const { descricao, parcela: pDesc } = extrairParcela(bruta);
    const parcela = (cols.parcela >= 0 ? c[cols.parcela]?.match(/\d+\/\d+/)?.[0] : undefined) ?? pDesc;
    const rotulo = semAcento(`${cols.tipo >= 0 ? c[cols.tipo] ?? '' : ''} ${descricao}`);
    const classe: Bruto['classe'] = marca === 'C' ? 'credito' : marca === 'D' ? 'gasto' : REGEX_CREDITO.test(rotulo) ? 'credito' : cols.tipo >= 0 && REGEX_GASTO.test(rotulo) ? 'gasto' : null;
    brutos.push({ data, descricao, parcela, valor, classe });
  }

  // Alguns bancos exportam gastos positivos, outros negativos: vale o sinal da maioria dos lançamentos não classificados.
  const livres = brutos.filter((b) => b.classe === null);
  const negativos = livres.filter((b) => b.valor < 0).length;
  const gastoNegativo = negativos > livres.length - negativos;

  const itens = brutos.map<ItemFatura>((b) => {
    let valor = Math.abs(b.valor);
    if (b.classe === 'credito') valor = -valor;
    else if (b.classe === null && gastoNegativo) valor = -b.valor;
    else if (b.classe === null) valor = b.valor;
    const item: ItemFatura = { data: b.data, descricao: b.descricao, valor: arredondar(valor) };
    if (b.parcela) item.parcela = b.parcela;
    return item;
  });
  return { banco, itens };
}

export function lerCsv(texto: string): ResultadoCsv {
  const linhas = dividirLinhas(texto);
  const banco = detectarBanco(linhas);
  return banco === 'bradesco' ? lerBradesco(linhas) : lerGenerico(linhas, banco);
}

// ── Utilidades de importação ─────────────────────────────────────────────────
export type ItemComId = ItemFatura & { id: string };

function hash(texto: string): string {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) { h ^= texto.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

/**
 * Gera um id estável por lançamento. Compras idênticas no mesmo dia (mesmo valor e descrição)
 * ganham um número de ocorrência, então reimportar o mesmo arquivo — ou um arquivo mais novo
 * que contenha os mesmos lançamentos — nunca duplica nem funde compras legítimas.
 */
export function identificar(itens: ItemFatura[]): ItemComId[] {
  const vistos = new Map<string, number>();
  return itens.map((it) => {
    const base = `${it.programado ? 'P' : 'L'}|${it.data}|${it.descricao}|${it.valor.toFixed(2)}`;
    const n = (vistos.get(base) ?? 0) + 1;
    vistos.set(base, n);
    return { ...it, id: `${hash(base)}-${n}` };
  });
}

export const totalGastos = (itens: ItemFatura[]): number =>
  arredondar(itens.filter((i) => !i.programado && i.valor > 0).reduce((a, i) => a + i.valor, 0));

/** Fatura sugerida: gastos de outubro costumam fechar na fatura paga em novembro. */
export function sugerirMesFatura(res: ResultadoCsv, hoje: Date = new Date()): string {
  const base = res.exportadoEm ?? { mes: hoje.getMonth() + 1, ano: hoje.getFullYear(), dia: hoje.getDate() };
  const total = base.ano * 12 + (base.mes - 1) + 1;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}
