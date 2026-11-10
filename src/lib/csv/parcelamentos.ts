import type { ItemFatura } from '@/types/finance';

const MAX_PARCELAS_FUTURAS = 2000;

function normalizarDescricao(descricao: string): string {
  return descricao.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
}

function chaveDoItem(item: ItemFatura): string {
  return `${normalizarDescricao(item.descricao)}|${Math.round(item.valor * 100)}`;
}

function lerParcela(valor?: string): { atual: number; total: number } | null {
  const match = valor?.match(/^\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*$/);
  if (!match) return null;
  const atual = Number(match[1]);
  const total = Number(match[2]);
  return atual >= 1 && total >= atual && total <= 99 ? { atual, total } : null;
}

export function somarMesesFatura(ym: string, quantidade: number): string {
  const [ano, mes] = ym.split('-').map(Number);
  const serial = ano * 12 + mes - 1 + quantidade;
  return `${Math.floor(serial / 12)}-${String(serial % 12 + 1).padStart(2, '0')}`;
}

/** Fatura da parcela N = mês da compra + N; o mês escolhido no import serve de referência de ano. */
function faturaDaParcela(item: ItemFatura, referenciaYm: string, numero: number): string {
  const data = item.data.match(/^\s*(\d{1,2})\/(\d{1,2})/);
  const [anoReferencia, mesReferencia] = referenciaYm.split('-').map(Number);
  if (!data || !anoReferencia || mesReferencia < 1 || mesReferencia > 12) return somarMesesFatura(referenciaYm, numero);
  const mesCompra = Number(data[2]);
  if (mesCompra < 1 || mesCompra > 12) return somarMesesFatura(referenciaYm, numero);
  // Se a compra aparece em mês posterior à fatura de referência, ela ocorreu no ano anterior.
  const anoCompra = anoReferencia - Number(mesCompra > mesReferencia);
  return somarMesesFatura(`${anoCompra}-${String(mesCompra).padStart(2, '0')}`, numero);
}

export type FaturaPlanejadaCsv = { ym: string; itens: ItemFatura[] };

/** Distribui cada parcela usando a data da compra; parcela 1 comprada em novembro vence na fatura de dezembro. */
export function distribuirParcelamentos(itens: ItemFatura[], ym: string): FaturaPlanejadaCsv[] {
  const porMes = new Map<string, ItemFatura[]>();
  const adicionar = (mes: string, item: ItemFatura) => {
    const lista = porMes.get(mes) ?? [];
    lista.push(item);
    porMes.set(mes, lista);
  };
  const atuais = itens.filter((item) => !item.programado && !item.ignorado);
  const programados = itens.filter((item) => item.programado === true && !item.ignorado);
  const usados = new Set<number>();
  let gerados = 0;
  for (const item of atuais) {
    const parcela = lerParcela(item.parcela);
    if (item.valor <= 0 || !parcela) {
      adicionar(ym, item);
      continue;
    }
    const mesAtual = faturaDaParcela(item, ym, parcela.atual);
    adicionar(mesAtual, item);
    for (let numero = parcela.atual + 1; numero <= parcela.total; numero++) {
      gerados++;
      if (gerados > MAX_PARCELAS_FUTURAS) throw new Error('Este arquivo contém parcelas futuras demais para importar de uma vez.');
      const destino = faturaDaParcela(item, ym, numero);
      const chave = chaveDoItem(item);
      const correspondente = programados.findIndex((candidato, indice) => {
        if (usados.has(indice) || chaveDoItem(candidato) !== chave) return false;
        const parcelaProgramada = lerParcela(candidato.parcela);
        return !parcelaProgramada || parcelaProgramada.atual === numero;
      });
      if (correspondente >= 0) {
        usados.add(correspondente);
        const programado = programados[correspondente];
        adicionar(destino, {
          data: programado.data, descricao: programado.descricao, valor: programado.valor,
          parcela: programado.parcela ?? `${numero}/${parcela.total}`, competenciaYm: destino,
        });
      } else {
        adicionar(destino, { ...item, parcela: `${numero}/${parcela.total}`, competenciaYm: destino });
      }
    }
  }

  programados.forEach((item, indice) => {
    if (usados.has(indice)) return;
    const parcela = lerParcela(item.parcela);
    const destino = parcela ? faturaDaParcela(item, ym, parcela.atual) : somarMesesFatura(ym, 1);
    // A linha programada é a parcela atual ainda não lançada; as demais avançam pela data da compra.
    adicionar(destino, { data: item.data, descricao: item.descricao, valor: item.valor, ...(item.parcela ? { parcela: item.parcela } : {}), competenciaYm: destino });
    if (!parcela || item.valor <= 0) return;
    for (let numero = parcela.atual + 1; numero <= parcela.total; numero++) {
      gerados++;
      if (gerados > MAX_PARCELAS_FUTURAS) throw new Error('Este arquivo contém parcelas futuras demais para importar de uma vez.');
      const mesParcela = faturaDaParcela(item, ym, numero);
      adicionar(mesParcela, {
        data: item.data, descricao: item.descricao, valor: item.valor,
        parcela: `${numero}/${parcela.total}`, competenciaYm: mesParcela,
      });
    }
  });

  return [...porMes.entries()].map(([mes, lista]) => ({ ym: mes, itens: lista }));
}

export function resumirParcelamentos(faturas: FaturaPlanejadaCsv[], ymAtual: string) {
  return faturas.filter((fatura) => fatura.ym !== ymAtual && fatura.itens.length > 0)
    .map((fatura) => ({ ym: fatura.ym, quantidade: fatura.itens.length }));
}
