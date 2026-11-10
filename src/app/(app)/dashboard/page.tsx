'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { CalendarioGastos } from '@/components/CalendarioGastos';
import { GraficoBarras, GraficoRosca } from '@/components/graficos';
import { PremiumBadge } from '@/components/PremiumBadge';
import { UpgradeModal } from '@/components/UpgradeModal';
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
import { usePlanLimits } from '@/lib/use-plan-limits';
import { useCategorias } from '@/lib/use-categorias';
import { SEM_CATEGORIA } from '@/lib/categorias';
import {
  PERFIL_PADRAO, type Cartao, type Com, type ContaFixa, type Divida, type Fatura, type ItemFatura, type Perfil, type Renda,
} from '@/types/finance';

const CORES_ROSCA = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'];
const TIPOS_GRAFICO = [
  { id: 'projection', title: 'Projeção mensal de despesas e renda', description: 'Compara faturas, dívidas e contas fixas com a renda informada em cada mês.' },
  { id: 'cards', title: 'Faturas de cartões por mês', description: 'Mostra o total das faturas atribuídas a cada mês. Exemplo: R$ 1.200 em novembro e R$ 950 em dezembro.' },
  { id: 'income', title: 'Renda por mês', description: 'Compara a renda cadastrada ao longo do período. Exemplo: salário e outras rendas mês a mês.' },
  { id: 'balance', title: 'Saldo mensal projetado', description: 'Calcula renda menos despesas cadastradas. Verde indica saldo positivo; vermelho, saldo negativo.' },
  { id: 'categories', title: 'Gastos por categoria', description: 'Distribui as compras importadas por CSV entre categorias, como alimentação, transporte e moradia.' },
] as const;
type TipoGrafico = (typeof TIPOS_GRAFICO)[number]['id'];
const semGraficoNoServidor = () => null;
function interpretarGraficos(raw: string | null): TipoGrafico[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (Array.isArray(value)) return value.filter((item): item is TipoGrafico => TIPOS_GRAFICO.some((tipo) => tipo.id === item));
  } catch { /* Compatibilidade com a preferência antiga, que guardava um único id sem JSON. */ }
  return TIPOS_GRAFICO.some((tipo) => tipo.id === raw) ? [raw as TipoGrafico] : [];
}

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
  const assinatura = usePlanLimits();
  const categoriasCSV = useCategorias(uid);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [perfilPronto, setPerfilPronto] = useState(false);
  const [ym, setYm] = useState(ymAtual());
  const [filtroCartao, setFiltroCartao] = useState('todos');
  const [upgrade, setUpgrade] = useState(false);
  const [substituindoGrafico, setSubstituindoGrafico] = useState(false);

  const subscribeChart = useCallback((notify: () => void) => {
    if (!uid) return () => undefined;
    const key = `prov:dashboard:free-chart:${uid}`;
    const aoAlterarOutraAba = (event: StorageEvent) => { if (event.key === key) notify(); };
    window.addEventListener('prov-dashboard-chart', notify);
    window.addEventListener('storage', aoAlterarOutraAba);
    return () => {
      window.removeEventListener('prov-dashboard-chart', notify);
      window.removeEventListener('storage', aoAlterarOutraAba);
    };
  }, [uid]);
  const lerGraficoSalvo = useCallback(() => {
    if (!uid) return null;
    try {
      const stored = localStorage.getItem(`prov:dashboard:free-chart:${uid}`);
      return TIPOS_GRAFICO.some((item) => item.id === stored) ? stored as TipoGrafico : null;
    } catch { return null; }
  }, [uid]);
  const graficosFree = interpretarGraficos(useSyncExternalStore(subscribeChart, lerGraficoSalvo, semGraficoNoServidor));

  function escolherGrafico(tipo: TipoGrafico) {
    if (graficosFree.includes(tipo)) return;
    if (!substituindoGrafico && graficosFree.length >= assinatura.dashboardChartLimit) { setUpgrade(true); return; }
    if (uid) {
      try {
        const next = substituindoGrafico ? [tipo] : [...graficosFree, tipo];
        localStorage.setItem(`prov:dashboard:free-chart:${uid}`, JSON.stringify(next));
        window.dispatchEvent(new Event('prov-dashboard-chart'));
        setSubstituindoGrafico(false);
      } catch { /* A escolha vale nesta sessão, sem persistência no navegador. */ }
    }
  }

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
  const caminhosItens = (premium || (!premium && graficosFree.includes('categories'))) && uid && !cartoes.carregando
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
  const fatias = gastosPorCategoria(comprasRosca, categoriasCSV.categorias, categoriasCSV.regras)
    .map((f, i) => ({ ...f, cor: f.nome === SEM_CATEGORIA ? 'var(--ch-fixas)' : CORES_ROSCA[i % CORES_ROSCA.length] }));

  const hoje = new Date();
  const mesProximo = somarMeses(ymAtual(hoje), 1);
  const faturasProximoMes = abertas.filter((f) => f.ym === mesProximo);
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
          {carregando ? <p className="suave">Carregando…</p> : !faturasProximoMes.length ? (
            <p className="suave">Nenhuma fatura em aberto para {rotuloYm(mesProximo)}.</p>
          ) : (
            <div className="lista">
              {faturasProximoMes.map((f) => (
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
        <div className="pilha">
          <div className="card card-corpo">
            <h2>{graficosFree.length ? 'Gráficos do plano Free' : 'Escolha gráficos para o painel'}</h2>
            <p className="suave" style={{ margin: '.4rem 0 1rem' }}>
              {substituindoGrafico ? 'Escolha qual gráfico ficará visível.' : `O plano Free pode exibir até ${assinatura.dashboardChartLimit} gráfico(s). Os gráficos adicionais e o calendário de gastos são exclusivos do Premium.`}
            </p>
            {graficosFree.length > 0 && !substituindoGrafico && <button type="button" className="btn btn-sec btn-mini" style={{ marginBottom: '.8rem' }} onClick={() => setSubstituindoGrafico(true)}>Escolher novamente</button>}
            <div className="grade-graficos-opcoes" role="group" aria-label="Gráficos do painel">
              {TIPOS_GRAFICO.map((tipo) => {
                const selecionado = graficosFree.includes(tipo.id);
                const bloqueado = !selecionado && graficosFree.length >= assinatura.dashboardChartLimit && !substituindoGrafico;
                return (
                  <div key={tipo.id} className="grafico-opcao">
                    <button type="button" className={`btn btn-sec ${selecionado ? 'grafico-selecionado' : ''}`}
                      aria-pressed={selecionado} aria-describedby={`grafico-dica-${tipo.id}`} title={tipo.description}
                      onClick={() => bloqueado ? setUpgrade(true) : escolherGrafico(tipo.id)}>
                      {tipo.title} {selecionado ? '✓' : bloqueado && <PremiumBadge />}
                    </button>
                    <span id={`grafico-dica-${tipo.id}`} className="grafico-opcao-dica" role="tooltip">{tipo.description}</span>
                  </div>
                );
              })}
            </div>
            {assinatura.erro && <p className="aviso aviso-alerta" role="status" style={{ marginTop: '1rem' }}>{assinatura.erro}</p>}
          </div>
          {graficosFree.length > 0 && meses.length > 0 && graficosFree.map((graficoFree) => (
            <div className="card" key={graficoFree}>
              <div className="card-cab"><h2>{TIPOS_GRAFICO.find((tipo) => tipo.id === graficoFree)?.title}</h2></div>
              <div className="card-corpo">
                {graficoFree === 'projection' && <GraficoBarras titulo="Projeção mensal de despesas cadastradas (cartões, dívidas e contas fixas) e renda informada" rotulos={rotulos} altura={300} barras={[
                  { nome: 'Cartões', cor: 'var(--ch-cartoes)', valores: serie.cartoes },
                  { nome: 'Dívidas', cor: 'var(--ch-dividas)', valores: serie.dividas },
                  { nome: 'Contas fixas', cor: 'var(--ch-fixas)', valores: serie.fixas },
                ]} linha={{ nome: 'Renda', cor: 'var(--ch-renda)', valores: serie.renda }} />}
                {graficoFree === 'cards' && <GraficoBarras titulo="Total de faturas de cartões por mês" rotulos={rotulos} barras={[{ nome: 'Faturas', cor: 'var(--ch-cartoes)', valores: serie.cartoes }]} />}
                {graficoFree === 'income' && <GraficoBarras titulo="Renda por mês" rotulos={rotulos} barras={[{ nome: 'Renda', cor: 'var(--ch-renda)', valores: serie.renda }]} />}
                {graficoFree === 'balance' && <GraficoBarras titulo="Saldo mensal projetado: renda informada menos despesas cadastradas" rotulos={rotulos} barras={[{ nome: 'Saldo projetado', cor: 'var(--ch-renda)', valores: serie.balanco }]} />}
                {graficoFree === 'categories' && <>
                  <label className="campo" style={{ maxWidth: 280, marginBottom: '1rem' }}><span>Cartão</span>
                    <select className="filtro" value={filtroValido} onChange={(e) => setFiltroCartao(e.target.value)}>
                      <option value="todos">Todos os cartões</option>
                      {cartoes.itens.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                  </label>
                  {categoriasCSV.carregando || itensCol.carregando ? <p className="suave">Carregando…</p> : <GraficoRosca key={`categorias-${ym}-${filtroValido}`} titulo={`Gastos por categoria em ${rotuloYm(ym)}`} fatias={fatias} />}
                  {categoriasCSV.erro && <p className="aviso aviso-erro" role="alert">{categoriasCSV.erro}</p>}
                </>}
              </div>
            </div>
          ))}
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
                {categoriasCSV.carregando || itensCol.carregando ? <p className="suave">Carregando…</p> : <GraficoRosca key={`categorias-${ym}-${filtroValido}`} titulo={`Gastos por categoria em ${rotuloYm(ym)}`} fatias={fatias} />}
                {categoriasCSV.erro && <p className="aviso aviso-erro" role="alert">{categoriasCSV.erro}</p>}
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
      <UpgradeModal aberto={upgrade} onFechar={() => setUpgrade(false)} recurso="gráficos adicionais" />
    </>
  );
}
