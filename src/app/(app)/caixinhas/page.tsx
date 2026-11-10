'use client';

import { useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import Link from 'next/link';
import { Modal } from '@/components/Modal';
import { GraficoRosca } from '@/components/graficos';
import { faturasPorMes, totaisDoMes } from '@/lib/analises';
import { useAuth } from '@/lib/auth-context';
import { resumoCaixinhas, validarCaixinha } from '@/lib/caixinhas';
import { useCaixinhasUsuario, useGastosManuais } from '@/lib/caixinhas-db';
import { useColecao } from '@/lib/colecao';
import { chaveDe, useColecoes } from '@/lib/colecoes';
import { MESES, rotuloCurto, rotuloYm, somarMeses, ymAtual } from '@/lib/datas';
import { arredondar, brl, lerDecimal } from '@/lib/formato';
import type { CaixinhaUsuario, OrigemCaixinha } from '@/types/caixinhas';
import type { Cartao, Com, ContaFixa, Divida, Fatura, Renda } from '@/types/finance';
import estilos from './caixinhas.module.css';

const CORES = [
  { valor: '#0B3B8C', nome: 'Azul-marinho' },
  { valor: '#DC2626', nome: 'Vermelho' },
  { valor: '#F59E0B', nome: 'Âmbar' },
  { valor: '#2563EB', nome: 'Azul' },
  { valor: '#16A34A', nome: 'Verde' },
  { valor: '#7C3AED', nome: 'Roxo' },
  { valor: '#0891B2', nome: 'Turquesa' },
  { valor: '#DB2777', nome: 'Rosa' },
];
const ICONES = ['🎯', '🏠', '🚗', '✈️', '🛒', '📚', '🐾', '💰', '🎓', '🏥', '🎉', '💡'];

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

function FormCaixinha({ inicial, origensUsadas, onSalvar, onCancelar }: {
  inicial?: { id: string; dados: CaixinhaUsuario };
  origensUsadas: OrigemCaixinha[];
  onSalvar: (id: string, dados: Omit<CaixinhaUsuario, 'atualizadoEm'>) => Promise<void>;
  onCancelar: () => void;
}) {
  const [nome, setNome] = useState(inicial?.dados.nome ?? '');
  const [percentual, setPercentual] = useState(String(inicial?.dados.percentual ?? ''));
  const [icone, setIcone] = useState(inicial?.dados.icone ?? ICONES[0]);
  const [cor, setCor] = useState(inicial?.dados.cor ?? CORES[0].valor);
  const [origem, setOrigem] = useState<OrigemCaixinha>(inicial?.dados.origem ?? 'manual');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    const validacao = validarCaixinha(nome, percentual);
    if (!validacao.ok) return setErro(validacao.erro);
    setSalvando(true);
    try {
      const id = inicial?.id ?? crypto.randomUUID();
      await onSalvar(id, { ...validacao.valores, icone, cor, origem, ativa: true });
    } catch {
      setErro('Não foi possível salvar. Tente novamente.');
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="pilha">
      <p className="pequeno suave">Dê um nome que faça sentido para seu orçamento, como Moradia, Viagem ou Reserva.</p>
      <div className="campo"><label htmlFor="cx-nome">Nome da caixinha</label><input id="cx-nome" value={nome} maxLength={40} onChange={(e) => setNome(e.target.value)} autoFocus placeholder="Ex.: Viagem" /></div>
      <div className="grade-2">
        <div className="campo"><label htmlFor="cx-percentual">Percentual da renda (%)</label><input id="cx-percentual" inputMode="decimal" value={percentual} onChange={(e) => setPercentual(e.target.value)} placeholder="0" /></div>
        <div className="campo"><label htmlFor="cx-origem">Como calcular o gasto</label>
          <select id="cx-origem" value={origem} onChange={(e) => setOrigem(e.target.value as OrigemCaixinha)}>
            <option value="manual">Vou informar manualmente</option>
            <option value="fixas" disabled={origensUsadas.includes('fixas') && inicial?.dados.origem !== 'fixas'}>Somar minhas contas fixas</option>
            <option value="cartaoDividas" disabled={origensUsadas.includes('cartaoDividas') && inicial?.dados.origem !== 'cartaoDividas'}>Somar cartões e dívidas</option>
          </select>
        </div>
      </div>
      <div className="grade-2">
        <div className="campo"><label htmlFor="cx-icone">Ícone</label><select id="cx-icone" value={icone} onChange={(e) => setIcone(e.target.value)}>{ICONES.map((i) => <option key={i} value={i}>{i}</option>)}</select></div>
        <fieldset className={estilos.campoCor}>
          <legend>Cor</legend>
          <div className={estilos.paleta}>
            {CORES.map((opcao) => (
              <label key={opcao.valor} className={estilos.opcaoCor} title={opcao.nome}>
                <input type="radio" name="cx-cor" value={opcao.valor} checked={cor === opcao.valor} onChange={() => setCor(opcao.valor)} aria-label={opcao.nome} />
                <span className={estilos.amostraCor} style={{ '--amostra': opcao.valor } as CSSProperties} />
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      {erro && <div className="aviso aviso-erro" role="alert">{erro}</div>}
      <div className="acoes" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-sec" onClick={onCancelar}>Cancelar</button>
        <button type="submit" className="btn" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar caixinha'}</button>
      </div>
    </form>
  );
}

function FormGasto({ nome, rotuloMes, automatica, gastoAuto, valorInicial, editado, onSalvar, onLimpar, onCancelar }: {
  nome: string; rotuloMes: string; automatica: boolean; gastoAuto: number; valorInicial: number | null; editado: boolean;
  onSalvar: (valor: number) => Promise<void>; onLimpar: () => Promise<void>; onCancelar: () => void;
}) {
  const [valor, setValor] = useState(valorInicial !== null ? String(valorInicial) : automatica ? String(gastoAuto) : '');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function executar(acao: () => Promise<void>) {
    setOcupado(true);
    try { await acao(); } catch { setErro('Não foi possível salvar. Tente novamente.'); setOcupado(false); }
  }
  function enviar(ev: FormEvent) {
    ev.preventDefault();
    const v = lerDecimal(valor);
    if (!Number.isFinite(v) || v < 0) return setErro('Informe um valor válido (zero ou maior).');
    void executar(() => onSalvar(arredondar(v)));
  }

  return (
    <form onSubmit={enviar} className="pilha">
      <p className="pequeno suave">{nome} · gasto em {rotuloMes}</p>
      <div className="campo"><label htmlFor="cg-valor">Valor gasto (R$)</label><input id="cg-valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} autoFocus placeholder="0,00" /></div>
      <p className="pequeno suave">{automatica ? `Valor calculado pelos dados cadastrados no app: ${brl(gastoAuto)}. Se editar, esse valor manual substitui o cálculo neste mês.` : 'Informe o valor gasto nesta caixinha no mês.'}</p>
      {erro && <div className="aviso aviso-erro" role="alert">{erro}</div>}
      <div className="acoes" style={{ justifyContent: 'flex-end' }}>
        {editado && <button type="button" className="btn btn-sec" style={{ marginRight: 'auto' }} disabled={ocupado} onClick={() => void executar(onLimpar)}>Restaurar cálculo automático</button>}
        <button type="button" className="btn btn-sec" onClick={onCancelar}>Cancelar</button>
        <button type="submit" className="btn" disabled={ocupado}>{ocupado ? 'Salvando…' : 'Salvar'}</button>
      </div>
    </form>
  );
}

export default function CaixinhasPage() {
  const { user } = useAuth();
  const uid = user?.uid;
  const [ym, setYm] = useState(ymAtual());
  const [editor, setEditor] = useState<{ id: string; dados: CaixinhaUsuario } | null | false>(false);
  const [editandoGasto, setEditandoGasto] = useState<string | null>(null);
  const caixas = useCaixinhasUsuario(uid);
  const manuais = useGastosManuais(uid, ym);
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

  const carregando = caixas.carregando || manuais.carregando || cartoes.carregando || dividas.carregando || rendas.carregando || fixas.carregando || faturasCol.carregando;
  const erro = caixas.erro ?? manuais.erro ?? cartoes.erro ?? dividas.erro ?? rendas.erro ?? fixas.erro ?? faturasCol.erro;
  const totais = useMemo(() => totaisDoMes(ym, { faturas: faturasPorMes(faturasPorCartao), dividas: dividas.itens, fixas: fixas.itens, rendas: rendas.itens }), [ym, faturasPorCartao, dividas.itens, fixas.itens, rendas.itens]);
  const ativas = caixas.itens.filter((c) => c.ativa);
  const arquivadas = caixas.itens.filter((c) => !c.ativa);
  const resumo = useMemo(() => resumoCaixinhas({ renda: totais.renda, caixinhas: ativas.map(({ id, ...dados }) => ({ id, dados })), totais, manuais: manuais.valores }), [totais, ativas, manuais.valores]);
  const fatias = resumo.caixinhas.filter((c) => c.planejado > 0).map((c) => ({ nome: c.nome, valor: c.planejado, cor: c.cor }));
  const aberta = editandoGasto ? resumo.caixinhas.find((c) => c.id === editandoGasto) : undefined;
  const origensUsadas = ativas.map((c) => c.origem);

  return (
    <>
      <div className="pagina-cab">
        <div><div className="sub">Orçamento personalizado</div><h1>Caixinhas</h1></div>
        <div className="acoes"><SeletorMes ym={ym} onChange={setYm} /><button type="button" className="btn" onClick={() => setEditor(null)}>+ Criar caixinha</button></div>
      </div>
      {erro && <div className="aviso aviso-erro" role="alert" style={{ marginBottom: '1rem' }}>{erro}</div>}
      {!carregando && !(totais.renda > 0) && <div className="aviso aviso-info" style={{ marginBottom: '1rem' }}>Cadastre uma renda em <Link href="/rendas">Rendas</Link> para ver quanto cada caixa representa do orçamento.</div>}

      <div className="kpis" aria-busy={carregando}>
        <div className="k m"><small>Renda em {rotuloCurto(ym)}</small><b>{carregando ? '—' : brl(totais.renda)}</b></div>
        <div className="k"><small>Planejado ({carregando ? '—' : `${resumo.somaPct}%`} da renda)</small><b>{carregando ? '—' : brl(resumo.totalPlanejado)}</b></div>
        <div className="k"><small>Gasto nas caixinhas</small><b>{carregando ? '—' : brl(resumo.totalGasto)}</b></div>
        <div className="k"><small>Sem caixinha</small><b className={!carregando && resumo.naoAlocado < 0 ? 'neg' : undefined}>{carregando ? '—' : brl(resumo.naoAlocado)}</b></div>
      </div>

      {carregando ? <p className="suave" style={{ marginTop: '1rem' }}>Carregando…</p> : (
        <>
          {ativas.length > 0 && resumo.somaPct !== 100 && <div className={`aviso aviso-alerta ${estilos.soma}`}>Seus percentuais somam {resumo.somaPct}%. Ajuste as caixinhas para distribuir 100% da renda, se desejar.</div>}
          {ativas.length === 0 ? (
            <div className={`card card-corpo ${estilos.vazio}`}>
              <span className={estilos.vazioIcone} aria-hidden="true">🪙</span>
              <h2>Organize seu orçamento do seu jeito</h2>
              <p>Crie caixinhas para os objetivos e despesas que importam para você. Escolha o nome e quanto da renda quer reservar.</p>
              <button type="button" className="btn" onClick={() => setEditor(null)}>Criar minha primeira caixinha</button>
            </div>
          ) : (
            <>
              <div className={estilos.grade}>
                {resumo.caixinhas.map((c) => (
                  <section key={c.id} className={`card ${estilos.caixa}`} style={{ '--cor': c.cor } as CSSProperties} aria-label={c.nome}>
                    <div className={estilos.topo} />
                    <div className={estilos.cab}><span className={estilos.icone} aria-hidden="true">{c.icone}</span><b className={estilos.nome}>{c.nome}</b><span className="selo">{c.percentual}%</span></div>
                    <div className={estilos.linha}><span>Planejado</span><b>{brl(c.planejado)}</b></div>
                    <div className={estilos.linha}><span>Gasto{c.editado ? ' · manual' : ''}</span><b className={estilos[c.situacao]}>{brl(c.gasto)}</b></div>
                    <div className={estilos.uso}><div className="barra" role="progressbar" aria-label={`Uso de ${c.nome}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, c.usoPct)}><span className={estilos[`preench-${c.situacao}`]} style={{ width: `${Math.min(100, c.usoPct)}%` }} /></div><div className="pequeno suave" style={{ marginTop: '.35rem' }}>{c.usoPct}% da caixinha usado{!c.automatica && !c.editado ? ' · nenhum gasto lançado' : ''}</div></div>
                    <div className={estilos.rodape}>
                      <button type="button" className="btn btn-sec btn-mini" onClick={() => setEditandoGasto(c.id)}>Gasto</button>
                      <button type="button" className="btn btn-sec btn-mini" onClick={() => setEditor({ id: c.id, dados: c })}>Editar</button>
                      <button type="button" className="btn-link pequeno" onClick={() => void caixas.arquivar(c.id)}>Arquivar</button>
                    </div>
                  </section>
                ))}
              </div>
              <div className={`card card-corpo ${estilos['rosca-bloco']}`}><div className="grupo-titulo">Distribuição planejada da renda</div>{fatias.length ? <GraficoRosca titulo={`Distribuição planejada da renda de ${rotuloYm(ym)}`} fatias={fatias} /> : <div className="grafico-vazio" style={{ height: 120 }}>Defina percentuais para exibir a distribuição.</div>}</div>
            </>
          )}
          {arquivadas.length > 0 && <section className={estilos.arquivadas}><h2>Caixinhas arquivadas</h2><p className="pequeno suave">Os dados e gastos anteriores foram preservados.</p>{arquivadas.map((c) => <div key={c.id} className={estilos.arquivada}><span>{c.icone} {c.nome} · {c.percentual}%</span><button type="button" className="btn btn-sec btn-mini" onClick={() => void caixas.restaurar(c.id)}>Restaurar</button></div>)}</section>}
        </>
      )}

      <Modal aberto={editor !== false} titulo={editor ? `Editar · ${editor.dados.nome}` : 'Criar caixinha'} onFechar={() => setEditor(false)}>
        {editor !== false && <FormCaixinha key={editor?.id ?? 'nova'} inicial={editor || undefined} origensUsadas={origensUsadas} onCancelar={() => setEditor(false)} onSalvar={async (id, dados) => { await caixas.salvar(id, dados); setEditor(false); }} />}
      </Modal>
      <Modal aberto={aberta !== undefined} titulo={aberta ? `Gasto · ${aberta.nome}` : 'Gasto'} onFechar={() => setEditandoGasto(null)}>
        {aberta && <FormGasto key={`${aberta.id}-${ym}`} nome={aberta.nome} rotuloMes={rotuloYm(ym)} automatica={aberta.automatica} gastoAuto={aberta.gastoAuto} valorInicial={aberta.editado ? aberta.gasto : null} editado={aberta.editado} onCancelar={() => setEditandoGasto(null)} onSalvar={async (valor) => { await manuais.definir(aberta.id, valor); setEditandoGasto(null); }} onLimpar={async () => { await manuais.limpar(aberta.id); setEditandoGasto(null); }} />}
      </Modal>
    </>
  );
}
