'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { GraficoBarras, GraficoRosca } from '@/components/graficos';
import { useAuth } from '@/lib/auth-context';
import { useCategorias } from '@/lib/use-categorias';
import { comprasDoMes, faturasPorMes, gastosPorCategoria, mesesDoPeriodo, serieMensal, totaisDoMes, type ItensDaFatura } from '@/lib/analises';
import { useColecao } from '@/lib/colecao';
import { chaveDe, useColecoes } from '@/lib/colecoes';
import { rotuloCurto, rotuloYm, somarMeses, ymAtual } from '@/lib/datas';
import { brl } from '@/lib/formato';
import { carregarPerfil } from '@/lib/perfil';
import { SEM_CATEGORIA } from '@/lib/categorias';
import { PERFIL_PADRAO, type Cartao, type Com, type ContaFixa, type Divida, type Fatura, type ItemFatura, type Perfil, type Renda } from '@/types/finance';

const CORES_ROSCA = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'];

export default function RelatoriosPage() {
  return <Suspense fallback={<p className="suave">Preparando relatório…</p>}><Relatorio /></Suspense>;
}

function Relatorio() {
  const { user } = useAuth();
  const uid = user?.uid;
  const searchParams = useSearchParams();
  const categoriasCSV = useCategorias(uid);
  const [perfil, setPerfil] = useState<Perfil>(PERFIL_PADRAO);
  const [mensagem, setMensagem] = useState('');
  const [promptCopiado, setPromptCopiado] = useState(false);
  const ymQuery = searchParams.get('ym');
  const ym = ymQuery && /^\d{4}-(0[1-9]|1[0-2])$/.test(ymQuery) ? ymQuery : ymAtual();

  useEffect(() => {
    if (!user) return;
    carregarPerfil(user.uid).then((dados) => { if (dados) setPerfil(dados); });
  }, [user]);

  const cartoes = useColecao<Cartao>(uid ? ['users', uid, 'cartoes'] : null);
  const dividas = useColecao<Divida>(uid ? ['users', uid, 'dividas'] : null);
  const rendas = useColecao<Renda>(uid ? ['users', uid, 'rendas'] : null);
  const fixas = useColecao<ContaFixa>(uid ? ['users', uid, 'fixas'] : null);
  const caminhosFaturas = uid && !cartoes.carregando ? cartoes.itens.map((c) => ['users', uid, 'cartoes', c.id, 'faturas']) : null;
  const faturasCol = useColecoes<Fatura>(caminhosFaturas);
  const faturasPorCartao = useMemo(() => {
    const out: Record<string, Com<Fatura>[]> = {};
    for (const c of cartoes.itens) out[c.id] = uid ? faturasCol.dados[chaveDe(['users', uid, 'cartoes', c.id, 'faturas'])] ?? [] : [];
    return out;
  }, [cartoes.itens, faturasCol.dados, uid]);
  const meses = useMemo(() => mesesDoPeriodo(perfil), [perfil]);
  const faturasMensais = useMemo(() => faturasPorMes(faturasPorCartao), [faturasPorCartao]);
  const entrada = useMemo(() => ({ faturas: faturasMensais, dividas: dividas.itens, fixas: fixas.itens, rendas: rendas.itens }), [faturasMensais, dividas.itens, fixas.itens, rendas.itens]);
  const serie = useMemo(() => serieMensal(meses, entrada), [meses, entrada]);
  const totalPeriodo = useMemo(() => meses.reduce((acc, mes) => {
    const total = totaisDoMes(mes, entrada);
    return { renda: acc.renda + total.renda, cartoes: acc.cartoes + total.cartoes, dividas: acc.dividas + total.dividas, fixas: acc.fixas + total.fixas, gastos: acc.gastos + total.gastos, saldo: acc.saldo + total.saldo };
  }, { renda: 0, cartoes: 0, dividas: 0, fixas: 0, gastos: 0, saldo: 0 }), [meses, entrada]);

  const caminhosItens = uid && !cartoes.carregando
    ? cartoes.itens.flatMap((c) => [ym, somarMeses(ym, 1)].map((fym) => ['users', uid, 'cartoes', c.id, 'faturas', fym, 'itens']))
    : null;
  const itensCol = useColecoes<ItemFatura>(caminhosItens);
  const fontes: ItensDaFatura[] = useMemo(() => uid ? cartoes.itens.flatMap((c) => [ym, somarMeses(ym, 1)].map((fym) => ({
    cartaoId: c.id,
    cartaoNome: c.nome,
    ymFatura: fym,
    itens: itensCol.dados[chaveDe(['users', uid, 'cartoes', c.id, 'faturas', fym, 'itens'])] ?? [],
  }))) : [], [cartoes.itens, itensCol.dados, uid, ym]);
  const comprasMes = useMemo(() => comprasDoMes(fontes, ym), [fontes, ym]);
  const fatias = useMemo(() => gastosPorCategoria(comprasMes, categoriasCSV.categorias, categoriasCSV.regras)
    .map((fatia, i) => ({ ...fatia, cor: fatia.nome === SEM_CATEGORIA ? 'var(--ch-fixas)' : CORES_ROSCA[i % CORES_ROSCA.length] })), [comprasMes, categoriasCSV.categorias, categoriasCSV.regras]);
  const carregando = cartoes.carregando || dividas.carregando || rendas.carregando || fixas.carregando || faturasCol.carregando || itensCol.carregando || categoriasCSV.carregando;
  const inicio = meses[0] ?? ym;
  const fim = meses[meses.length - 1] ?? ym;

  const prompt = useMemo(() => {
    const linhasMes = meses.map((mes, i) => `${rotuloYm(mes)}: renda ${brl(serie.renda[i] ?? 0)}; cartões ${brl(serie.cartoes[i] ?? 0)}; dívidas ${brl(serie.dividas[i] ?? 0)}; contas fixas ${brl(serie.fixas[i] ?? 0)}; despesas totais ${brl(serie.gastos[i] ?? 0)}; saldo projetado ${brl(serie.balanco[i] ?? 0)}.`);
    const linhasCategoria = fatias.map((fatia) => `${fatia.nome}: ${brl(fatia.valor)}`).join('\n') || 'Sem lançamentos categorizados no mês atual.';
    return [
      'Atue como um educador financeiro pessoal. Analise os dados abaixo com linguagem clara, respeitosa e prática.',
      'Não invente informações, não solicite senhas, números de cartão ou outros dados pessoais e deixe claro que a análise é educativa, não substitui aconselhamento financeiro profissional.',
      '',
      `Período analisado: ${rotuloYm(inicio)} a ${rotuloYm(fim)}.`,
      `Resumo do período: renda ${brl(totalPeriodo.renda)}; despesas ${brl(totalPeriodo.gastos)}; saldo projetado ${brl(totalPeriodo.saldo)}.`,
      '', 'Valores mensais:', ...linhasMes,
      '', `Categorias dos gastos em ${rotuloYm(ym)}:`, linhasCategoria,
      '', 'Por favor: identifique tendências e meses de maior pressão financeira; compare renda e despesas; aponte até três ações realistas para melhorar o orçamento; destaque limitações ou dados faltantes e não presuma objetivos que não foram informados.',
    ].join('\n');
  }, [meses, serie, fatias, inicio, fim, totalPeriodo, ym]);

  async function copiarPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setPromptCopiado(true);
      setMensagem('Prompt copiado. Cole-o na IA de sua preferência.');
    } catch {
      setPromptCopiado(false);
      setMensagem('Não foi possível copiar automaticamente. Selecione o texto do prompt e copie manualmente.');
    }
  }

  if (carregando) return <p className="suave">Preparando relatório…</p>;
  if (!meses.length) return <div className="aviso aviso-alerta">O período dos gráficos está inválido. Ajuste-o em <Link href="/perfil">Meu perfil</Link>.</div>;

  return (
    <section className="relatorio">
      <div className="pagina-cab">
        <div><div className="sub">Resumo financeiro</div><h1>Relatórios</h1><p className="suave">Período: {rotuloYm(inicio)} a {rotuloYm(fim)} · Categorias do mês selecionado: {rotuloYm(ym)}.</p></div>
        <div className="acoes relatorio-acoes">
          <Link className="btn btn-sec" href="/dashboard">Voltar ao painel</Link>
          <button type="button" className="btn" onClick={() => window.print()}>Imprimir / salvar PDF</button>
        </div>
      </div>

      <div className="kpis">
        <div className="k m"><small>Renda no período</small><b>{brl(totalPeriodo.renda)}</b></div>
        <div className="k"><small>Despesas no período</small><b>{brl(totalPeriodo.gastos)}</b></div>
        <div className="k"><small>Saldo projetado</small><b className={totalPeriodo.saldo < 0 ? 'neg' : 'pos'}>{brl(totalPeriodo.saldo)}</b></div>
        <div className="k"><small>Meses analisados</small><b>{meses.length}</b></div>
      </div>

      <div className="relatorio-graficos">
        <div className="card relatorio-quebra">
          <div className="card-cab"><h2>Despesas e renda por mês</h2></div>
          <div className="card-corpo"><GraficoBarras titulo="Despesas mensais por origem e renda" rotulos={meses.map(rotuloCurto)} altura={300} barras={[
            { nome: 'Cartões', cor: 'var(--ch-cartoes)', valores: serie.cartoes },
            { nome: 'Dívidas', cor: 'var(--ch-dividas)', valores: serie.dividas },
            { nome: 'Contas fixas', cor: 'var(--ch-fixas)', valores: serie.fixas },
          ]} linha={{ nome: 'Renda', cor: 'var(--ch-renda)', valores: serie.renda }} /></div>
        </div>
        <div className="card relatorio-quebra">
          <div className="card-cab"><h2>Saldo projetado por mês</h2></div>
          <div className="card-corpo"><GraficoBarras titulo="Saldo projetado por mês" rotulos={meses.map(rotuloCurto)} barras={[{ nome: 'Saldo', cor: 'var(--ch-renda)', valores: serie.balanco }]} /></div>
        </div>
        <div className="card relatorio-quebra">
          <div className="card-cab"><h2>Gastos por categoria · {rotuloYm(ym)}</h2></div>
          <div className="card-corpo">{fatias.length ? <GraficoRosca titulo={`Gastos por categoria em ${rotuloYm(ym)}`} fatias={fatias} /> : <p className="suave">Sem gastos categorizados no mês atual.</p>}</div>
        </div>
      </div>

      <div className="card relatorio-tabela relatorio-quebra">
        <div className="card-cab"><h2>Resumo mensal</h2></div>
        <div className="card-corpo tabela-rolagem">
          <table className="tabela-relatorio">
            <thead><tr><th>Mês</th><th>Renda</th><th>Cartões</th><th>Dívidas</th><th>Contas fixas</th><th>Despesas</th><th>Saldo projetado</th></tr></thead>
            <tbody>{meses.map((mes, i) => <tr key={mes}>
              <th scope="row">{rotuloYm(mes)}</th><td>{brl(serie.renda[i] ?? 0)}</td><td>{brl(serie.cartoes[i] ?? 0)}</td><td>{brl(serie.dividas[i] ?? 0)}</td>
              <td>{brl(serie.fixas[i] ?? 0)}</td><td>{brl(serie.gastos[i] ?? 0)}</td><td>{brl(serie.balanco[i] ?? 0)}</td>
            </tr>)}</tbody>
            <tfoot><tr><th scope="row">Total do período</th><td>{brl(totalPeriodo.renda)}</td><td>{brl(totalPeriodo.cartoes)}</td><td>{brl(totalPeriodo.dividas)}</td><td>{brl(totalPeriodo.fixas)}</td><td>{brl(totalPeriodo.gastos)}</td><td>{brl(totalPeriodo.saldo)}</td></tr></tfoot>
          </table>
        </div>
      </div>

      <div className="card relatorio-quebra relatorio-ia">
        <div className="card-cab"><h2>Gerar relatório para IA</h2></div>
        <div className="card-corpo pilha">
          <p className="suave">Gera um prompt com os totais mensais e categorias para você copiar e colar em uma IA. O PROV não envia seus dados a uma IA.</p>
          <div className="campo"><label htmlFor="prompt-financeiro">Prompt preparado</label><textarea id="prompt-financeiro" rows={12} readOnly value={prompt} /></div>
          {mensagem && <p className="aviso aviso-info" role="status">{mensagem}</p>}
          <div className="acoes"><button type="button" className="btn" onClick={() => void copiarPrompt()}>{promptCopiado ? 'Copiado' : 'Copiar prompt para IA'}</button></div>
        </div>
      </div>
      <p className="suave pequeno relatorio-rodape">Relatório calculado a partir dos dados cadastrados no PROV. Projeções não garantem valores futuros.</p>
    </section>
  );
}
