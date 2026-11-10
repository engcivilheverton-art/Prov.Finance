import { arredondar } from '@/lib/formato';
import { intervaloYm, montarYm, ymAtual } from '@/lib/datas';
import { valorNoMes } from '@/lib/dividas';
import { rendaDoMes } from '@/lib/rendas';
import { categoriaDoItem, SEM_CATEGORIA, type CategoriaComId, type RegraCategoria } from '@/lib/categorias';
import type { Cartao, Com, ContaFixa, Divida, Fatura, ItemFatura, Perfil, Renda } from '@/types/finance';

type Periodo = Pick<Perfil, 'anoIni' | 'mesIni' | 'anoFim' | 'mesFim'>;

/** Meses (AAAA-MM) do período do perfil; vazio se o início for depois do fim. */
export const mesesDoPeriodo = (p: Periodo): string[] =>
  intervaloYm(montarYm(p.anoIni, p.mesIni), montarYm(p.anoFim, p.mesFim));

/** Soma as faturas de todos os cartões por mês de pagamento. `cartaoId` restringe a um cartão. */
export function faturasPorMes(
  faturasPorCartao: Record<string, Com<Fatura>[]>,
  cartaoId?: string,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, lista] of Object.entries(faturasPorCartao)) {
    if (cartaoId && id !== cartaoId) continue;
    for (const f of lista) out[f.id] = arredondar((out[f.id] ?? 0) + f.valor);
  }
  return out;
}

export type EntradaMensal = {
  faturas: Record<string, number>;
  dividas: Pick<Divida, 'parcelas'>[];
  fixas: Pick<ContaFixa, 'valor'>[];
  rendas: Renda[];
};

export function totaisDoMes(ym: string, e: EntradaMensal) {
  const cartoes = arredondar(e.faturas[ym] ?? 0);
  const dividas = arredondar(e.dividas.reduce((a, d) => a + valorNoMes(d.parcelas, ym), 0));
  const fixas = arredondar(e.fixas.reduce((a, f) => a + f.valor, 0));
  const renda = rendaDoMes(e.rendas, ym);
  const gastos = arredondar(cartoes + dividas + fixas);
  return { cartoes, dividas, fixas, renda, gastos, saldo: arredondar(renda - gastos) };
}

export function serieMensal(meses: string[], e: EntradaMensal) {
  const t = meses.map((ym) => totaisDoMes(ym, e));
  return {
    meses,
    cartoes: t.map((x) => x.cartoes),
    dividas: t.map((x) => x.dividas),
    fixas: t.map((x) => x.fixas),
    renda: t.map((x) => x.renda),
    gastos: t.map((x) => x.gastos),
    balanco: t.map((x) => x.saldo),
  };
}

export type FaturaAberta = { cartaoId: string; cartaoNome: string; ym: string; valor: number; atrasada: boolean };

export function faturasEmAberto(
  cartoes: Com<Cartao>[],
  faturasPorCartao: Record<string, Com<Fatura>[]>,
  hoje: string = ymAtual(),
): FaturaAberta[] {
  const out: FaturaAberta[] = [];
  for (const c of cartoes) {
    for (const f of faturasPorCartao[c.id] ?? []) {
      if (f.status === 'Pendente') out.push({ cartaoId: c.id, cartaoNome: c.nome, ym: f.id, valor: f.valor, atrasada: f.id < hoje });
    }
  }
  return out.sort((a, b) => a.ym.localeCompare(b.ym) || a.cartaoNome.localeCompare(b.cartaoNome));
}

// ── Compras por data real ────────────────────────────────────────────────────

export type Compra = {
  id: string;
  cartaoId: string;
  cartaoNome: string;
  dataIso: string; // AAAA-MM-DD
  descricao: string;
  parcela?: string;
  valor: number;
};

/**
 * O CSV traz a compra só com dia/mês. O ano vem da fatura: se o mês da compra é posterior ao mês
 * da fatura, a compra é do ano anterior (compra de dezembro numa fatura de janeiro).
 */
export function dataDaCompra(dataDDMM: string, ymFatura: string): string | null {
  const m = dataDDMM.match(/^(\d{2})\/(\d{2})$/);
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  const [anoF, mesF] = ymFatura.split('-').map(Number);
  if (!anoF || !mesF) return null;
  const ano = mes > mesF ? anoF - 1 : anoF;
  const d = new Date(ano, mes - 1, dia);
  if (d.getFullYear() !== ano || d.getMonth() !== mes - 1 || d.getDate() !== dia) return null;
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function dataDaCompetencia(dataDDMM: string, competenciaYm: string): string | null {
  const m = dataDDMM.match(/^\d{2}\/(\d{2})$/);
  if (!m) return null;
  const diaOriginal = Number(dataDDMM.slice(0, 2));
  const [ano, mes] = competenciaYm.split('-').map(Number);
  if (!ano || mes < 1 || mes > 12) return null;
  const dia = Math.min(diaOriginal, new Date(ano, mes, 0).getDate());
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

export type ItensDaFatura = { cartaoId: string; cartaoNome: string; ymFatura: string; itens: Com<ItemFatura>[] };

/** Gastos (sem pagamentos, estornos nem parcelamentos futuros) cuja data real cai no mês `ym`. */
export function comprasDoMes(fontes: ItensDaFatura[], ym: string): Compra[] {
  const out: Compra[] = [];
  for (const f of fontes) {
    for (const it of f.itens) {
      if (it.programado || it.ignorado || !(it.valor > 0)) continue;
      const dataIso = it.competenciaYm ? dataDaCompetencia(it.data, it.competenciaYm) : dataDaCompra(it.data, f.ymFatura);
      if (!dataIso || !dataIso.startsWith(ym)) continue;
      out.push({ id: `${f.cartaoId}:${f.ymFatura}:${it.id}`, cartaoId: f.cartaoId, cartaoNome: f.cartaoNome, dataIso, descricao: it.descricao, parcela: it.parcela, valor: it.valor });
    }
  }
  return out.sort((a, b) => a.dataIso.localeCompare(b.dataIso) || b.valor - a.valor);
}

export type DiaDeGastos = { dia: number; total: number; compras: Compra[] };

export function agruparPorDia(compras: Compra[]): Record<number, DiaDeGastos> {
  const out: Record<number, DiaDeGastos> = {};
  for (const c of compras) {
    const dia = Number(c.dataIso.slice(8, 10));
    const atual = out[dia] ?? { dia, total: 0, compras: [] };
    atual.total = arredondar(atual.total + c.valor);
    atual.compras.push(c);
    out[dia] = atual;
  }
  return out;
}

export const diasNoMes = (ym: string): number => {
  const [a, m] = ym.split('-').map(Number);
  return new Date(a, m, 0).getDate();
};

export function resumoCalendario(compras: Compra[], ym: string, hoje: string = ymAtual(), diaHoje: number = new Date().getDate()) {
  const porDia = agruparPorDia(compras);
  const dias = Object.values(porDia);
  const total = arredondar(dias.reduce((a, d) => a + d.total, 0));
  const maior = dias.reduce<DiaDeGastos | null>((m, d) => (!m || d.total > m.total ? d : m), null);
  const base = ym === hoje ? diaHoje : diasNoMes(ym); // mês corrente: média até hoje
  return { porDia, total, diasComGasto: dias.length, maior, mediaPorDia: base > 0 ? arredondar(total / base) : 0 };
}

export type Fatia = { nome: string; valor: number };

/** Soma por categoria; o excedente visual vira "Demais categorias", sem gravá-lo como categoria. */
export function gastosPorCategoria(compras: Compra[], categorias: CategoriaComId[], regras: RegraCategoria[], maximo = 8): Fatia[] {
  const soma = new Map<string, number>();
  for (const c of compras) {
    const cat = categoriaDoItem(c.descricao, categorias, regras);
    soma.set(cat, (soma.get(cat) ?? 0) + c.valor);
  }
  const semValor = soma.get(SEM_CATEGORIA) ?? 0;
  const ordenado = [...soma.entries()].filter(([nome]) => nome !== SEM_CATEGORIA).sort((a, b) => b[1] - a[1]);
  const precisaSem = semValor > 0;
  const limite = Math.max(precisaSem && ordenado.length ? 2 : 1, Math.floor(maximo));
  const categoriasPermitidas = Math.max(0, limite - Number(precisaSem));
  const precisaAgrupar = ordenado.length > categoriasPermitidas;
  const principais = precisaAgrupar ? ordenado.slice(0, Math.max(0, categoriasPermitidas - 1)) : ordenado.slice(0, categoriasPermitidas);
  const agrupado = ordenado.slice(principais.length).reduce((total, [, valor]) => total + valor, 0);
  const resultado = principais.map(([nome, valor]) => ({ nome, valor: arredondar(valor) }));
  if (agrupado > 0) resultado.push({ nome: 'Demais categorias', valor: arredondar(agrupado) });
  if (precisaSem) resultado.push({ nome: SEM_CATEGORIA, valor: arredondar(semValor) });
  return resultado;
}
