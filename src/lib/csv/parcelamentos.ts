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

export type FaturaPlanejadaCsv = { ym: string; itens: ItemFatura[] };

/** Mantém o conteúdo atual no mês escolhido e distribui apenas parcelas ainda não lançadas. */
export function distribuirParcelamentos(itens: ItemFatura[], ym: string): FaturaPlanejadaCsv[] {
  const porMes = new Map<string, ItemFatura[]>();
  const adicionar = (mes: string, item: ItemFatura) => {
    const lista = porMes.get(mes) ?? [];
    lista.push(item);
    porMes.set(mes, lista);
  };
  const atuais = itens.filter((item) => !item.programado);
  const programados = itens.filter((item) => item.programado === true);
  const usados = new Set<number>();
  let gerados = 0;
  atuais.forEach((item) => adicionar(ym, item));

  for (const item of atuais) {
    if (item.valor <= 0) continue;
    const parcela = lerParcela(item.parcela);
    if (!parcela || parcela.atual >= parcela.total) continue;
    for (let numero = parcela.atual + 1; numero <= parcela.total; numero++) {
      gerados++;
      if (gerados > MAX_PARCELAS_FUTURAS) throw new Error('Este arquivo contém parcelas futuras demais para importar de uma vez.');
      const destino = somarMesesFatura(ym, numero - parcela.atual);
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
    const destino = somarMesesFatura(ym, 1);
    // Uma linha em "Lançamentos programados" representa a próxima parcela
    // (no mês seguinte ao selecionado), mas ainda pode haver parcelas depois dela.
    adicionar(destino, { data: item.data, descricao: item.descricao, valor: item.valor, ...(item.parcela ? { parcela: item.parcela } : {}), competenciaYm: destino });
    const parcela = lerParcela(item.parcela);
    if (!parcela || item.valor <= 0) return;
    for (let numero = parcela.atual + 1; numero <= parcela.total; numero++) {
      gerados++;
      if (gerados > MAX_PARCELAS_FUTURAS) throw new Error('Este arquivo contém parcelas futuras demais para importar de uma vez.');
      const mesParcela = somarMesesFatura(ym, numero - parcela.atual + 1);
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
