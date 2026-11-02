'use client';

import { useState, type FormEvent } from 'react';
import { Modal } from '@/components/Modal';
import { useAuth } from '@/lib/auth-context';
import { useColecao } from '@/lib/colecao';
import { rotuloCurto, ymAtual } from '@/lib/datas';
import { reconstruirParcelas, resumoDivida } from '@/lib/dividas';
import { arredondar, brl } from '@/lib/formato';
import { CATEGORIAS_DIVIDA, type Com, type Divida } from '@/types/finance';

function FormDivida({ inicial, onSalvar, onCancelar }: { inicial: Com<Divida> | null; onSalvar: (d: Divida) => Promise<void>; onCancelar: () => void }) {
  const [nome, setNome] = useState(inicial?.nome ?? '');
  const [credor, setCredor] = useState(inicial?.credor ?? '');
  const [categoria, setCategoria] = useState(inicial?.categoria ?? CATEGORIAS_DIVIDA[0]);
  const [parcela, setParcela] = useState(inicial ? String(inicial.parcela) : '');
  const [total, setTotal] = useState(inicial ? String(inicial.parcelas.length) : '');
  const [pagas, setPagas] = useState(inicial ? String(inicial.parcelas.filter((p) => p.paga).length) : '0');
  const [inicio, setInicio] = useState(inicial?.inicio ?? ymAtual());
  const [dia, setDia] = useState(inicial?.diaVencimento ? String(inicial.diaVencimento) : '');
  const [erro, setErro] = useState('');

  const v = Number(parcela.replace(',', '.'));
  const n = Number(total);
  const p = Number(pagas || 0);
  const previa = v > 0 && n > 0 ? { total: arredondar(v * n), pago: arredondar(v * Math.min(p, n)) } : null;

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    if (!nome.trim()) return setErro('Informe a descrição da dívida.');
    if (!(v > 0)) return setErro('Informe o valor da parcela.');
    if (!Number.isInteger(n) || n < 1 || n > 480) return setErro('O número de parcelas deve ficar entre 1 e 480.');
    if (!Number.isInteger(p) || p < 0 || p > n) return setErro('As parcelas pagas devem ficar entre 0 e o total.');
    if (!/^\d{4}-\d{2}$/.test(inicio)) return setErro('Informe o mês da primeira parcela.');
    const d = dia ? Number(dia) : undefined;
    if (d !== undefined && (!Number.isInteger(d) || d < 1 || d > 31)) return setErro('O dia de vencimento deve ficar entre 1 e 31.');
    try {
      await onSalvar({
        nome: nome.trim(), credor: credor.trim() || undefined, categoria, parcela: v, inicio, diaVencimento: d,
        parcelas: reconstruirParcelas(inicial?.parcelas, v, n, p, inicio),
      });
    } catch {
      setErro('Não foi possível salvar. Tente novamente.');
    }
  }

  return (
    <form onSubmit={enviar} className="pilha">
      <div className="grade-2">
        <div className="campo col-total"><label htmlFor="d-nome">Descrição</label><input id="d-nome" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus placeholder="Ex.: Empréstimo, Financiamento" /></div>
        <div className="campo"><label htmlFor="d-cred">Credor / banco</label><input id="d-cred" value={credor} onChange={(e) => setCredor(e.target.value)} /></div>
        <div className="campo"><label htmlFor="d-cat">Categoria</label><select id="d-cat" value={categoria} onChange={(e) => setCategoria(e.target.value)}>{CATEGORIAS_DIVIDA.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div className="campo"><label htmlFor="d-par">Valor da parcela (R$)</label><input id="d-par" inputMode="decimal" value={parcela} onChange={(e) => setParcela(e.target.value)} /></div>
        <div className="campo"><label htmlFor="d-tot">Nº total de parcelas</label><input id="d-tot" inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value)} /></div>
        <div className="campo"><label htmlFor="d-pag">Parcelas já pagas</label><input id="d-pag" inputMode="numeric" value={pagas} onChange={(e) => setPagas(e.target.value)} /></div>
        <div className="campo"><label htmlFor="d-ini">Mês da 1ª parcela</label><input id="d-ini" type="month" value={inicio} onChange={(e) => setInicio(e.target.value)} /></div>
        <div className="campo"><label htmlFor="d-dia">Dia do vencimento</label><input id="d-dia" inputMode="numeric" value={dia} onChange={(e) => setDia(e.target.value)} /></div>
      </div>
      {previa && <div className="aviso aviso-info">Total {brl(previa.total)} · pago {brl(previa.pago)} · restante {brl(previa.total - previa.pago)}</div>}
      {erro && <div className="aviso aviso-erro" role="alert">{erro}</div>}
      <div className="acoes" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-sec" onClick={onCancelar}>Cancelar</button>
        <button type="submit" className="btn">Salvar dívida</button>
      </div>
    </form>
  );
}

function CartaoDivida({ d, onEditar, onExcluir, onAlterar }: { d: Com<Divida>; onEditar: () => void; onExcluir: () => void; onAlterar: (parcelas: Divida['parcelas']) => void }) {
  const r = resumoDivida(d.parcelas);
  const hoje = ymAtual();
  return (
    <details className="card" style={{ marginBottom: '.8rem', opacity: r.quitada ? 0.75 : 1 }}>
      <summary className="card-cab">
        <div className="acoes" style={{ flex: 1, minWidth: 0 }}>
          <span className="detalhe-seta" aria-hidden>▸</span>
          <div style={{ minWidth: 0 }}>
            <div className="titulo" style={{ fontWeight: 700, color: 'var(--texto-forte)' }}>{d.nome}{r.quitada && <span className="selo selo-verde" style={{ marginLeft: '.5rem' }}>Quitada</span>}</div>
            <div className="pequeno suave">{[d.credor, d.categoria].filter(Boolean).join(' · ')}</div>
          </div>
        </div>
        <span className={`selo ${r.vencidas ? 'selo-verm' : r.quitada ? 'selo-verde' : 'selo-azul'}`}>{r.pagas}/{r.total} parcelas</span>
        <span className="num">{brl(r.restante)}</span>
      </summary>
      <div className="card-corpo">
        <div className="barra"><span style={{ width: `${r.percentual}%`, background: r.quitada ? 'var(--verde)' : undefined }} /></div>
        <div className="acoes pequeno suave" style={{ justifyContent: 'space-between', margin: '.6rem 0 .2rem' }}>
          <span>Parcela {brl(d.parcela)}</span><span>Total {brl(r.valorTotal)}</span><span>{r.percentual}% quitado</span>
          {r.vencidas > 0 && <span className="neg">{r.vencidas} em atraso</span>}
        </div>
        <div className="parcelas">
          {d.parcelas.map((p, i) => (
            <button key={p.ym} type="button" className={`parcela ${p.paga ? 'paga' : p.ym < hoje ? 'vencida' : ''}`} aria-pressed={p.paga}
              onClick={() => onAlterar(d.parcelas.map((x, j) => (j === i ? { ...x, paga: !x.paga } : x)))}>
              <b>{String(i + 1).padStart(2, '0')}/{r.total}</b>{rotuloCurto(p.ym)}<br />{brl(p.valor)}
            </button>
          ))}
        </div>
        <div className="acoes" style={{ marginTop: '1rem' }}>
          <button type="button" className="btn btn-sec btn-mini" onClick={() => onAlterar(d.parcelas.map((p) => ({ ...p, paga: true })))}>Marcar todas pagas</button>
          <button type="button" className="btn btn-sec btn-mini" onClick={() => onAlterar(d.parcelas.map((p) => ({ ...p, paga: false })))}>Desmarcar todas</button>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn btn-sec btn-mini" onClick={onEditar}>Editar</button>
          <button type="button" className="btn btn-perigo btn-mini" onClick={onExcluir}>Excluir</button>
        </div>
      </div>
    </details>
  );
}

export default function DividasPage() {
  const { user } = useAuth();
  const uid = user?.uid;
  const { itens, carregando, erro, adicionar, salvar, mesclar, remover } = useColecao<Divida>(uid ? ['users', uid, 'dividas'] : null);
  const [edicao, setEdicao] = useState<Com<Divida> | 'nova' | null>(null);

  const abertas = itens.filter((d) => !resumoDivida(d.parcelas).quitada).sort((a, b) => a.nome.localeCompare(b.nome));
  const concluidas = itens.filter((d) => resumoDivida(d.parcelas).quitada).sort((a, b) => a.nome.localeCompare(b.nome));
  const totalAberto = arredondar(abertas.reduce((a, d) => a + resumoDivida(d.parcelas).restante, 0));

  const lista = (ds: Com<Divida>[]) => ds.map((d) => (
    <CartaoDivida key={d.id} d={d} onEditar={() => setEdicao(d)}
      onExcluir={() => { if (confirm(`Excluir a dívida "${d.nome}"?`)) void remover(d.id); }}
      onAlterar={(parcelas) => void mesclar(d.id, { parcelas })} />
  ));

  return (
    <>
      <div className="pagina-cab">
        <div><div className="sub">Passivo</div><h1>Dívidas</h1></div>
        <button type="button" className="btn" onClick={() => setEdicao('nova')}>Nova dívida</button>
      </div>

      {erro && <div className="aviso aviso-erro" role="alert">{erro}</div>}
      {carregando ? <p className="suave">Carregando…</p> : !itens.length ? (
        <div className="card vazio">Nenhuma dívida cadastrada. Cadastre uma para acompanhar o pagamento parcela a parcela.</div>
      ) : (
        <>
          <div className="kpis">
            <div className="k m"><small>Total em aberto</small><b>{brl(totalAberto)}</b></div>
            <div className="k"><small>Dívidas em aberto</small><b>{abertas.length}</b></div>
            <div className="k"><small>Concluídas</small><b>{concluidas.length}</b></div>
          </div>
          {abertas.length > 0 && <><div className="grupo-titulo">Em aberto · {abertas.length}</div>{lista(abertas)}</>}
          {concluidas.length > 0 && <><div className="grupo-titulo">Concluídas · {concluidas.length}</div>{lista(concluidas)}</>}
        </>
      )}

      <Modal aberto={edicao !== null} titulo={edicao === 'nova' ? 'Nova dívida' : 'Editar dívida'} onFechar={() => setEdicao(null)}>
        <FormDivida
          inicial={edicao && edicao !== 'nova' ? edicao : null}
          onCancelar={() => setEdicao(null)}
          onSalvar={async (dados) => {
            if (edicao && edicao !== 'nova') await salvar(edicao.id, dados);
            else await adicionar(dados);
            setEdicao(null);
          }}
        />
      </Modal>
    </>
  );
}
