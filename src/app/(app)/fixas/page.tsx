'use client';

import { useState, type FormEvent } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { Modal } from '@/components/Modal';
import { useAuth } from '@/lib/auth-context';
import { useColecao } from '@/lib/colecao';
import { rotuloYm, ymAtual } from '@/lib/datas';
import { db } from '@/lib/firebase';
import { arredondar, brl } from '@/lib/formato';
import { CATEGORIAS_FIXA, type Com, type ContaFixa, type PagamentosFixas } from '@/types/finance';

function FormFixa({ inicial, onSalvar, onCancelar }: { inicial: ContaFixa | null; onSalvar: (c: ContaFixa) => Promise<void>; onCancelar: () => void }) {
  const [nome, setNome] = useState(inicial?.nome ?? '');
  const [categoria, setCategoria] = useState(inicial?.categoria ?? CATEGORIAS_FIXA[0]);
  const [valor, setValor] = useState(inicial ? String(inicial.valor) : '');
  const [dia, setDia] = useState(inicial?.dia ? String(inicial.dia) : '');
  const [erro, setErro] = useState('');

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    const v = Number(valor.replace(',', '.'));
    const d = dia ? Number(dia) : undefined;
    if (!nome.trim()) return setErro('Informe o nome da conta.');
    if (!(v > 0)) return setErro('Informe um valor maior que zero.');
    if (d !== undefined && (!Number.isInteger(d) || d < 1 || d > 31)) return setErro('O dia deve ficar entre 1 e 31.');
    try {
      await onSalvar({ nome: nome.trim(), categoria, valor: v, dia: d });
    } catch {
      setErro('Não foi possível salvar. Tente novamente.');
    }
  }

  return (
    <form onSubmit={enviar} className="pilha">
      <div className="grade-2">
        <div className="campo col-total"><label htmlFor="x-nome">Nome</label><input id="x-nome" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus placeholder="Ex.: Condomínio, internet" /></div>
        <div className="campo"><label htmlFor="x-cat">Categoria</label><select id="x-cat" value={categoria} onChange={(e) => setCategoria(e.target.value)}>{CATEGORIAS_FIXA.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div className="campo"><label htmlFor="x-val">Valor (R$)</label><input id="x-val" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} /></div>
        <div className="campo"><label htmlFor="x-dia">Dia do vencimento</label><input id="x-dia" inputMode="numeric" value={dia} onChange={(e) => setDia(e.target.value)} /></div>
      </div>
      {erro && <div className="aviso aviso-erro" role="alert">{erro}</div>}
      <div className="acoes" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-sec" onClick={onCancelar}>Cancelar</button>
        <button type="submit" className="btn">Salvar</button>
      </div>
    </form>
  );
}

export default function FixasPage() {
  const { user } = useAuth();
  const uid = user?.uid;
  const contas = useColecao<ContaFixa>(uid ? ['users', uid, 'fixas'] : null);
  const pagamentos = useColecao<PagamentosFixas>(uid ? ['users', uid, 'fixasPagas'] : null);
  const [ym, setYm] = useState(ymAtual());
  const [edicao, setEdicao] = useState<Com<ContaFixa> | 'nova' | null>(null);

  const pagas = pagamentos.itens.find((p) => p.id === ym)?.pagas ?? {};
  const total = arredondar(contas.itens.reduce((a, c) => a + c.valor, 0));
  const totalPago = arredondar(contas.itens.filter((c) => pagas[c.id]).reduce((a, c) => a + c.valor, 0));
  const pct = total > 0 ? Math.round((totalPago / total) * 100) : 0;
  const pendentes = contas.itens.filter((c) => !pagas[c.id]).sort((a, b) => (a.dia ?? 99) - (b.dia ?? 99));
  const quitadas = contas.itens.filter((c) => pagas[c.id]).sort((a, b) => (a.dia ?? 99) - (b.dia ?? 99));

  async function alternar(c: Com<ContaFixa>) {
    if (!uid || !/^\d{4}-\d{2}$/.test(ym)) return;
    await setDoc(doc(db, 'users', uid, 'fixasPagas', ym), { pagas: { [c.id]: !pagas[c.id] } }, { merge: true });
  }

  const linha = (c: Com<ContaFixa>, paga: boolean) => (
    <div key={c.id} className="linha">
      <button type="button" role="checkbox" aria-checked={paga} aria-label={`${c.nome}: ${paga ? 'paga' : 'pendente'}`} className="check" onClick={() => void alternar(c)}>{paga ? '✓' : ''}</button>
      <div className="grow">
        <div className="titulo" style={paga ? { textDecoration: 'line-through', color: 'var(--suave)' } : undefined}>{c.nome}</div>
        <div className="pequeno suave">{c.categoria}{c.dia ? ` · vence dia ${c.dia}` : ''}</div>
      </div>
      <span className="num" style={paga ? { color: 'var(--suave)' } : undefined}>{brl(c.valor)}</span>
      <div className="acoes">
        <button type="button" className="btn btn-sec btn-mini" onClick={() => setEdicao(c)}>Editar</button>
        <button type="button" className="btn btn-perigo btn-mini" aria-label={`Excluir ${c.nome}`} onClick={() => { if (confirm(`Excluir "${c.nome}"?`)) void contas.remover(c.id); }}>✕</button>
      </div>
    </div>
  );

  return (
    <>
      <div className="pagina-cab">
        <div><div className="sub">Recorrentes</div><h1>Contas fixas</h1></div>
        <div className="acoes">
          <input type="month" className="mes-input campo" aria-label="Mês de controle" value={ym} onChange={(e) => setYm(e.target.value)}
            style={{ minHeight: 44, padding: '.5rem .7rem', border: '1px solid var(--linha)', borderRadius: 10, background: 'var(--card)', color: 'var(--ink)' }} />
          <button type="button" className="btn" onClick={() => setEdicao('nova')}>Nova conta</button>
        </div>
      </div>

      {(contas.erro || pagamentos.erro) && <div className="aviso aviso-erro" role="alert">{contas.erro ?? pagamentos.erro}</div>}
      {contas.carregando ? <p className="suave">Carregando…</p> : !contas.itens.length ? (
        <div className="card vazio">Nenhuma conta fixa cadastrada.</div>
      ) : (
        <>
          <div className="card card-corpo" style={{ marginBottom: '.5rem' }}>
            <div className="acoes" style={{ justifyContent: 'space-between' }}>
              <span className="suave pequeno">Pago em {/^\d{4}-\d{2}$/.test(ym) ? rotuloYm(ym) : '—'}</span>
              <span className="num">{brl(totalPago)} <span className="suave" style={{ fontWeight: 500 }}>de {brl(total)}</span></span>
            </div>
            <div className="barra" style={{ marginTop: '.6rem' }}><span style={{ width: `${pct}%`, background: pct === 100 ? 'var(--verde)' : undefined }} /></div>
          </div>
          {pendentes.length > 0 && <><div className="grupo-titulo">Pendentes · {pendentes.length}</div><div className="card card-corpo"><div className="lista">{pendentes.map((c) => linha(c, false))}</div></div></>}
          {quitadas.length > 0 && <><div className="grupo-titulo">Pagas no mês · {quitadas.length}</div><div className="card card-corpo"><div className="lista">{quitadas.map((c) => linha(c, true))}</div></div></>}
        </>
      )}

      <Modal aberto={edicao !== null} titulo={edicao === 'nova' ? 'Nova conta fixa' : 'Editar conta fixa'} onFechar={() => setEdicao(null)}>
        <FormFixa
          inicial={edicao && edicao !== 'nova' ? edicao : null}
          onCancelar={() => setEdicao(null)}
          onSalvar={async (dados) => {
            if (edicao && edicao !== 'nova') await contas.salvar(edicao.id, dados);
            else await contas.adicionar(dados);
            setEdicao(null);
          }}
        />
      </Modal>
    </>
  );
}
