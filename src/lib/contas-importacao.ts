import type { TipoMovimentacaoConta } from '@/types/contas';

export type LinhaExtrato = {
  data: string;
  descricao: string;
  valor: number;
  tipo: TipoMovimentacaoConta;
  direcao?: 'entrada' | 'saida';
  idExterno?: string;
  linha: number;
};
export type MapeamentoCsv = { data: number; descricao: number; valor?: number; debito?: number; credito?: number };
type ResultadoParser = { linhas: LinhaExtrato[]; erros: { linha: number; erro: string }[]; cabecalhos?: string[]; texto?: string };

function normalizarCabecalho(valor: string) {
  return valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

function dividirLinha(texto: string, separador: string): string[] {
  const colunas: string[] = [];
  let valor = '';
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const char = texto[i];
    if (char === '"' && texto[i + 1] === '"' && aspas) { valor += '"'; i++; }
    else if (char === '"') aspas = !aspas;
    else if (char === separador && !aspas) { colunas.push(valor); valor = ''; }
    else valor += char;
  }
  colunas.push(valor);
  return colunas.map((item) => item.trim());
}

function parseValor(raw: string): number | null {
  let value = raw.trim().replace(/\s/g, '').replace(/^R\$/i, '').replace(/[R$]/g, '');
  const negative = value.startsWith('(') && value.endsWith(')');
  value = value.replace(/[()]/g, '').replace(/[^\d,.-]/g, '');
  if (!value || !/\d/.test(value)) return null;
  if (value.includes(',') && value.includes('.')) value = value.lastIndexOf(',') > value.lastIndexOf('.') ? value.replace(/\./g, '').replace(',', '.') : value.replace(/,/g, '');
  else if (value.includes(',')) value = value.replace(',', '.');
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (negative) return -Math.abs(number);
  return number;
}

function parseData(raw: string): string | null {
  const validar = (year: number, month: number, day: number) => {
    const candidate = new Date(Date.UTC(year, month - 1, day));
    return candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day;
  };
  const value = raw.trim();
  let match = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/.exec(value);
  if (match) {
    let year = Number(match[3]); if (year < 100) year += year >= 70 ? 1900 : 2000;
    const month = Number(match[2]); const day = Number(match[1]);
    if (month < 1 || month > 12 || !validar(year, month, day)) return null;
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  return validar(Number(match[1]), Number(match[2]), Number(match[3])) ? value.slice(0, 10) : null;
}

export function chaveExtrato(input: Pick<LinhaExtrato, 'data' | 'descricao' | 'valor'>, ocorrencia = 1): string {
  const base = `${input.data}|${input.valor.toFixed(2)}|${input.descricao.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}|${ocorrencia}`;
  let a = 0x811c9dc5;
  for (let i = 0; i < base.length; i++) { a ^= base.charCodeAt(i); a = Math.imul(a, 0x01000193); }
  return (a >>> 0).toString(16).padStart(8, '0') + (base.length.toString(16).padStart(4, '0'));
}

function classificar(descricao: string, valor: number): TipoMovimentacaoConta {
  const text = normalizarCabecalho(descricao);
  if (/pagamento (de )?fatura|pagto fatura|debito fatura cartao|pagamento cartao/.test(text)) return 'pagamento_fatura';
  if (/transferencia|transf entre contas|ted recebida|pix enviado para conta propria|aplicacao resgate/.test(text)) return 'transferencia';
  return valor < 0 ? 'saida' : 'entrada';
}

export function parseCsvExtrato(texto: string, mapping?: MapeamentoCsv): ResultadoParser {
  const clean = texto.replace(/^\uFEFF/, '').trim().replace(/^\x60{3}(?:csv)?\s*/i, '').replace(/\s*\x60{3}$/, '').trim();
  if (!clean) return { linhas: [], erros: [{ linha: 1, erro: 'O arquivo está vazio.' }] };
  const physicalLines = clean.split(/\r?\n/).filter((line) => line.trim());
  const candidates = [',', ';', '\t'];
  const separator = candidates.sort((a, b) =>
    Math.max(...physicalLines.slice(0, 20).map((line) => dividirLinha(line, b).length))
      - Math.max(...physicalLines.slice(0, 20).map((line) => dividirLinha(line, a).length))
  )[0];
  const detectedHeaderIndex = physicalLines.slice(0, 20).findIndex((line) => {
    const cells = dividirLinha(line, separator).map(normalizarCabecalho);
    return cells.some((item) => ['data', 'date', 'dt lancamento'].includes(item) || item.startsWith('data ')) &&
      cells.some((item) => ['descricao', 'historico', 'description', 'memo', 'lancamento', 'estabelecimento'].some((name) => item === name || item.includes(name)));
  });
  const headerIndex = detectedHeaderIndex >= 0
    ? detectedHeaderIndex
    : mapping
      ? -1
      : physicalLines.slice(0, 20).reduce((best, line, index, list) => dividirLinha(line, separator).length > dividirLinha(list[best] ?? '', separator).length ? index : best, 0);
  const headerLineIndex = headerIndex >= 0 ? headerIndex : 0;
  const labels = dividirLinha(physicalLines[headerLineIndex], separator);
  const headers = labels.map(normalizarCabecalho);
  if (!mapping && !physicalLines.slice(0, 20).some((line) => {
    const cells = dividirLinha(line, separator).map(normalizarCabecalho);
    return cells.some((item) => ['data', 'date', 'dt lancamento'].includes(item) || item.startsWith('data ')) &&
      cells.some((item) => ['descricao', 'historico', 'description', 'memo', 'lancamento', 'estabelecimento'].some((name) => item === name || item.includes(name)));
  })) return { linhas: [], erros: [{ linha: headerLineIndex + 1, erro: 'Cabeçalho não reconhecido. Escolha as colunas no mapeamento manual.' }], cabecalhos: labels };
  const find = (...names: string[]) => headers.findIndex((header) => names.some((name) => header === name || header.includes(name)));
  const dateIndex = mapping?.data ?? find('data', 'date', 'dt lancamento');
  const descriptionIndex = mapping?.descricao ?? find('descricao', 'historico', 'description', 'estabelecimento', 'memo', 'lancamento');
  const amountIndex = mapping?.valor ?? find('valor', 'amount', 'montante', 'value');
  const debitIndex = mapping?.debito ?? find('debito', 'debit', 'saida', 'retirada');
  const creditIndex = mapping?.credito ?? find('credito', 'credit', 'entrada', 'deposito');
  const idIndex = headerIndex >= 0 ? find('fitid', 'id transacao', 'transaction id', 'identificador') : -1;
  if (dateIndex < 0 || descriptionIndex < 0 || (amountIndex < 0 && debitIndex < 0 && creditIndex < 0)) {
    return { linhas: [], erros: [{ linha: headerLineIndex + 1, erro: 'Não encontrei colunas de data, descrição e valor (ou débito/crédito). Confira o mapeamento do CSV.' }], cabecalhos: labels };
  }
  const linhas: LinhaExtrato[] = [];
  const erros: { linha: number; erro: string }[] = [];
  for (let index = headerIndex + 1; index < physicalLines.length; index++) {
    const cells = dividirLinha(physicalLines[index], separator);
    if (cells.every((cell) => !cell)) continue;
    const data = parseData(cells[dateIndex] ?? '');
    const descricao = (cells[descriptionIndex] ?? '').trim();
    const rawValue = amountIndex >= 0 ? cells[amountIndex] ?? '' : '';
    const amount = amountIndex >= 0 ? parseValor(rawValue) : null;
    const debit = debitIndex >= 0 ? Math.abs(parseValor(cells[debitIndex] ?? '') ?? 0) : 0;
    const credit = creditIndex >= 0 ? Math.abs(parseValor(cells[creditIndex] ?? '') ?? 0) : 0;
    const valor = amount ?? (credit > 0 ? credit : debit > 0 ? -debit : null);
    if (!data || !descricao || valor === null) { erros.push({ linha: index + 1, erro: 'Data, descrição ou valor inválido.' }); continue; }
    const tipo = classificar(descricao, valor);
    linhas.push({ data, descricao, valor: Math.abs(valor), tipo, ...(tipo === 'transferencia' ? { direcao: valor < 0 ? 'saida' : 'entrada' } : {}), ...(idIndex >= 0 && cells[idIndex] ? { idExterno: cells[idIndex] } : {}), linha: index + 1 });
  }
  return { linhas, erros, cabecalhos: labels };
}

export function parseOfxExtrato(texto: string): { linhas: LinhaExtrato[]; erros: { linha: number; erro: string }[] } {
  // OFX 1.x is commonly SGML and omits the closing STMTTRN tag; OFX 2.x may include it.
  const items = [...texto.matchAll(/<STMTTRN>([\s\S]*?)(?=<STMTTRN>|<\/BANKTRANLIST>|$)/gi)];
  if (!items.length) return { linhas: [], erros: [{ linha: 1, erro: 'Nenhuma transação OFX foi encontrada.' }] };
  const linhas: LinhaExtrato[] = [];
  const erros: { linha: number; erro: string }[] = [];
  items.forEach((match, index) => {
    const block = match[1];
    const get = (name: string) => new RegExp(`<${name}>([^<\\r\\n]+)`, 'i').exec(block)?.[1]?.trim() ?? '';
    const rawDate = get('DTPOSTED');
    const date = /^(\d{4})(\d{2})(\d{2})/.exec(rawDate);
    const data = date ? `${date[1]}-${date[2]}-${date[3]}` : null;
    const valor = parseValor(get('TRNAMT'));
    const descricao = get('NAME') || get('MEMO');
    if (!data || valor === null || !descricao) { erros.push({ linha: index + 1, erro: 'Transação OFX incompleta ou inválida.' }); return; }
    const tipo = classificar(descricao, valor);
    linhas.push({ data, descricao, valor: Math.abs(valor), tipo, ...(tipo === 'transferencia' ? { direcao: valor < 0 ? 'saida' : 'entrada' } : {}), ...(get('FITID') ? { idExterno: get('FITID') } : {}), linha: index + 1 });
  });
  return { linhas, erros };
}

export async function lerArquivoExtrato(file: File, mapping?: MapeamentoCsv): Promise<ResultadoParser & { formato: 'csv' | 'ofx' }> {
  const buffer = await file.arrayBuffer();
  let text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  if (text.includes('\uFFFD')) text = new TextDecoder('windows-1252').decode(buffer);
  const ofx = /\.ofx$|\.qfx$/i.test(file.name) || /<OFX>/i.test(text);
  return { ...(ofx ? parseOfxExtrato(text) : parseCsvExtrato(text, mapping)), formato: ofx ? 'ofx' : 'csv', texto: ofx ? undefined : text };
}
