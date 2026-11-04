'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarioGastos } from '@/components/CalendarioGastos';
import { GraficoBarras, GraficoRosca } from '@/components/graficos';
import {
  comprasDoMes, faturasEmAberto, faturasPorMes, gastosPorCategoria, mesesDoPeriodo, serieMensal, totaisDoMes,
  type ItensDaFatura,
} from '@/lib/analises';
import { useAuth } from '@/lib/auth-context';
import { useColecao } from '@/lib/colecao';
import { chaveDe, useColecoes } from '@/lib/colecoes';
import { MESES, rotuloCurto, rotuloYm, somarMeses, ymAtual } from '@/lib/datas';
import { arredondar, brl } from '@/lib/formato';
import { carregarPerfil } from '@/lib/perfil';
import { useAssinatura } from '@/lib/use-assinatura';
import {
  PERFIL_PADRAO, type Cartao, type Com, type ContaFixa, type Divida, type Fatura, type ItemFatura, type Perfil, type Renda,
} from '@/types/finance';

const CORES_ROSCA = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'];

function SeletorMes({ ym, onChange }: { ym: string; onChange: (ym: string) => void }) {
  const [ano, mes] = ym.split('-').map(Number);
  return (
    <div className="seletor-mes" role="group" aria-label="Mês em análise">
      <button type="button" className="btn btn-sec btn-mini" aria-label="Mês anterior" onClick={() => onChange(somarMeses(ym, -1))}>‹</button>
      <span className="seletor-mes-rotulo" aria-live="polite">{MESES[mes - 1]} {ano}</span>
      <button type="button" className="btn btn-sec btn-mini" aria-label="Próximo mês" onClick={() => onChange(somarMeses(ym, 1))}>›</button>
      {ym !== ymAtual() && <button type="button" className="btn-link pequeno" onClick={() => onChange(ymAtual())}>Hoje</button>}
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const uid = user?.uid;
  const assinatura = useAssinatura();
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [perfilPronto, setPerfilPronto] = useState(false);
  const [ym, setYm] = useState(ymAtual());
  const [filtroCartao, setFiltroCartao] = useState('todos');

  useEffect(() => {
    if (!user) return;
    carregarPerfil(user.uid).then(setPerfil).finally(() => setPerfilPronto(true));
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

  const carregando = cartoes.carregando || dividas.carregando || rendas.carregando || fixas.carregando || faturasCol.carregando;
  const erro = cartoes.erro ?? dividas.erro ?? rendas.erro ?? fixas.erro ?? faturasCol.erro;

  const periodo = perfil ?? PERFIL_PADRAO;
  const meses = useMemo(() => mesesDoPeriodo(periodo), [periodo]);
  const entrada = useMemo(
    () => ({ faturas: faturasPorMes(faturasPorCartao), dividas: dividas.itens, fixas: fixas.itens, rendas: rendas.itens }),
    [faturasPorCartao, dividas.itens, fixas.itens, rendas.itens],
  );
  const serie = useMemo(() => serieMensal(meses, entrada), [meses, entrada]);
  const rotulos = useMemo(() => meses.map(rotuloCurto), [meses]);
  const totais = totaisDoMes(ym, entrada);
  const abertas = useMemo(() => faturasEmAberto(cartoes.itens, faturasPorCartao), [cartoes.itens, faturasPorCartao]);
  const totalAberto = arredondar(abertas.reduce((a, f) => a + f.valor, 0));

  // Lançamentos do mês (calendário e rosca): só são lidos quando o Premium está confirmado.
  const premium = assinatura.premium;
  const faturasDoMes = [ym, somarMeses(ym, 1)];
  const caminhosItens = premium && uid && !cartoes.carregando
    ? cartoes.itens.flatMap((c) => faturasDoMes.map((fy) => ['users', uid, 'cartoes', c.id, 'faturas', fy, 'itens']))
    : null;
  const itensCol = useColecoes<ItemFatura>(caminhosItens);
  const fontes: ItensDaFatura[] = useMemo(
    () => (uid ? cartoes.itens.flatMap((c) => [ym, somarMeses(ym, 1)].map((fy) => ({
      cartaoId: c.id, cartaoNome: c.nome, ymFatura: fy,
      itens: itensCol.dados[chaveDe(['users', uid, 'cartoes', c.id, 'faturas', fy, 'itens'])] ?? [],
    }))) : []),
    [cartoes.itens, itensCol.dados, uid, ym],
  );
  const comprasMes = useMemo(() => comprasDoMes(fontes, ym), [fontes, ym]);
  const filtroValido = filtroCartao === 'todos' || cartoes.itens.some((c) => c.id === filtroCartao) ? filtroCartao : 'todos';
  const comprasRosca = filtroValido === 'todos' ? comprasMes : comprasMes.filter((c) => c.cartaoId === filtroValido);
  const fatias = gastosPorCategoria(comprasRosca).map((f, i) => ({ ...f, cor: CORES_ROSCA[i % CORES_ROSCA.length] }));

  const hoje = new Date();
  const nome = perfil?.nome || user?.displayName || '';

  return (
    <>
      <div className="pagina-cab">
        <div><div className="sub">Visão geral</div><h1>{nome ? `Olá, ${nome.split(' ')[0]}` : 'Painel financeiro'}</h1></div>
        <SeletorMes ym={ym} onChange={setYm} />
      </div>

      {perfilPronto && !perfil && (
        <div className="aviso aviso-info" style={{ marginBottom: '1rem' }}>
          Complete seu <Link href="/perfil">perfil</Link> para definir o período dos gráficos.
        </div>
      )}
      {erro && <div className="aviso aviso-erro" role="alert" style={{ marginBottom: '1rem' }}>{erro}</div>}

      <div className="kpis" aria-busy={carregando}>
        <div className="k m"><small>Renda em {rotuloCurto(ym)}</small><b>{carregando ? '—' : brl(totais.renda)}</b></div>
        <div className="k"><small>Despesas previstas</small><b>{carregando ? '—' : brl(totais.gastos)}</b></div>
        <div className="k"><small>Saldo projetado</small><b className={!carregando && totais.saldo < 0 ? 'neg' : 'pos'}>{carregando ? '—' : brl(totais.saldo)}</b></div>
        <div className="k"><small>Faturas em aberto</small><b>{carregando ? '—' : brl(totalAberto)}</b></div>
      </div>
      {!carregando && (
        <p className="suave pequeno" style={{ marginTop: '-.4rem', marginBottom: '1rem' }}>
          Projeção baseada nos valores das faturas atribuídas a {rotuloYm(ym)} ({brl(totais.cartoes)}), parcelas cadastradas de dívidas ({brl(totais.dividas)}) e contas fixas ({brl(totais.fixas)}). Inclui compromissos ainda pendentes; a renda considera os valores informados no cadastro.
        </p>
      )}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-cab"><h2>Próximas faturas</h2><Link href="/cartoes" className="pequeno">Ver cartões</Link></div>
        <div className="card-corpo">
          {carregando ? <p className="suave">Carregando…</p> : !abertas.length ? (
            <p className="suave">Nenhuma fatura em aberto.</p>
          ) : (
            <div className="lista">
              {abertas.slice(0, 6).map((f) => (
                <div key={`${f.cartaoId}-${f.ym}`} className="linha">
                  <div className="grow">
                    <div className="titulo"><Link href={`/cartoes/${f.cartaoId}`}>{f.cartaoNome}</Link></div>
                    <div className="pequeno suave">Fatura de {rotuloYm(f.ym)}</div>
                  </div>
                  <span className={`selo ${f.atrasada ? 'selo-verm' : 'selo-ambar'}`}>{f.atrasada ? 'Em atraso' : 'Em aberto'}</span>
                  <span className="num">{brl(f.valor)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="pagina-cab" style={{ marginTop: '2rem', marginBottom: '1rem' }}>
        <div><div className="sub">Análises</div><h2 style={{ fontSize: '1.3rem' }}>Projeções e calendário de compras</h2></div>
        {meses.length > 0 && <span className="suave pequeno">{rotuloYm(meses[0])} a {rotuloYm(meses[meses.length - 1])} · {meses.length} meses · <Link href="/perfil">alterar período</Link></span>}
      </div>

      {assinatura.carregando ? (
        <div className="card vazio" aria-busy>Verificando a sua assinatura…</div>
      ) : !premium ? (
        <div className="card card-corpo bloqueado">
          <h2>Gráficos e calendário fazem parte do PROV. Premium</h2>
          <p className="suave" style={{ margin: '.4rem 0 1rem' }}>
            Acompanhe a evolução de faturas, renda e saldo mês a mês, veja os gastos por categoria e por cartão e o total gasto em cada dia do mês.
          </p>
          <Link className="btn" href="/planos" style={{ textDecoration: 'none' }}>Ver planos Premium</Link>
          {assinatura.erro && <p className="aviso aviso-alerta" role="status" style={{ marginTop: '1rem' }}>{assinatura.erro}</p>}
        </div>
      ) : meses.length === 0 ? (
        <div className="aviso aviso-alerta">O período do perfil está invertido. Ajuste-o em <Link href="/perfil">Meu perfil</Link>.</div>
      ) : (
        <div className="pilha">
          <div className="card">
            <div className="card-cab"><h2>Projeção mensal de despesas e renda</h2></div>
            <div className="card-corpo">
              <GraficoBarras titulo="Projeção mensal de despesas cadastradas (cartões, dívidas e contas fixas) e renda informada" rotulos={rotulos} altura={300}
                barras={[
                  { nome: 'Cartões', cor: 'var(--ch-cartoes)', valores: serie.cartoes },
                  { nome: 'Dívidas', cor: 'var(--ch-dividas)', valores: serie.dividas },
                  { nome: 'Contas fixas', cor: 'var(--ch-fixas)', valores: serie.fixas },
                ]}
                linha={{ nome: 'Renda', cor: 'var(--ch-renda)', valores: serie.renda }} />
            </div>
          </div>

          <div className="grade-graficos">
            <div className="card">
              <div className="card-cab"><h2>Faturas de cartões por mês</h2></div>
              <div className="card-corpo"><GraficoBarras titulo="Total de faturas de cartões por mês" rotulos={rotulos} barras={[{ nome: 'Faturas', cor: 'var(--ch-cartoes)', valores: serie.cartoes }]} /></div>
            </div>
            <div className="card">
              <div className="card-cab"><h2>Renda por mês</h2></div>
              <div className="card-corpo"><GraficoBarras titulo="Renda por mês" rotulos={rotulos} barras={[{ nome: 'Renda', cor: 'var(--ch-renda)', valores: serie.renda }]} /></div>
            </div>
            <div className="card">
              <div className="card-cab"><h2>Saldo mensal projetado</h2></div>
              <div className="card-corpo">
                <GraficoBarras titulo="Saldo mensal projetado: renda informada menos despesas cadastradas" rotulos={rotulos} barras={[{ nome: 'Saldo projetado', cor: 'var(--ch-renda)', valores: serie.balanco }]} />
                <p className="suave pequeno" style={{ marginTop: '.5rem' }}>Verde: renda informada supera os compromissos cadastrados. Vermelho: os compromissos cadastrados superam a renda informada.</p>
              </div>
            </div>
            <div className="card">
              <div className="card-cab">
                <h2>Gastos por categoria · {rotuloCurto(ym)}</h2>
                <label>
                  <span className="sr-only">Cartão</span>
                  <select className="filtro" value={filtroValido} onChange={(e) => setFiltroCartao(e.target.value)}>
                    <option value="todos">Todos os cartões</option>
                    {cartoes.itens.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </label>
              </div>
              <div className="card-corpo">
                {itensCol.carregando ? <p className="suave">Carregando…</p> : <GraficoRosca titulo={`Gastos por categoria em ${rotuloYm(ym)}`} fatias={fatias} />}
                <p className="suave pequeno" style={{ marginTop: '.6rem' }}>Pela data da compra. Categorias estimadas pelo nome do estabelecimento, a partir dos lançamentos importados por CSV.</p>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-cab"><h2>Calendário de gastos · {rotuloYm(ym)}</h2></div>
            <div className="card-corpo">
              {itensCol.carregando
                ? <p className="suave">Carregando lançamentos…</p>
                : <CalendarioGastos key={ym} ym={ym} compras={comprasMes} hojeYm={ymAtual(hoje)} hojeDia={hoje.getDate()} />}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
