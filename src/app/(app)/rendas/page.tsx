'use client';

import { useState, type FormEvent } from 'react';
import { Modal } from '@/components/Modal';
import { useAuth } from '@/lib/auth-context';
import { useColecao } from '@/lib/colecao';
import { rotuloYm, ymAtual } from '@/lib/datas';
import { arredondar, brl } from '@/lib/formato';
import { TIPOS_RENDA, type Com, type Renda } from '@/types/finance';

function FormRenda({ inicial, onSalvar, onCancelar }: { inicial: Renda | null; onSalvar: (r: Renda) => Promise<void>; onCancelar: () => void }) {
  const [nome, setNome] = useState(inicial?.nome ?? '');
  const [tipo, setTipo] = useState(inicial?.tipo ?? TIPOS_RENDA[0]);
  const [valor, setValor] = useState(inicial ? String(inicial.valor) : '');
  const [rec, setRec] = useState<Renda['recorrencia']>(inicial?.recorrencia ?? 'mensal');
  const [ym, setYm] = useState(inicial?.ym ?? ymAtual());
  const [dia, setDia] = useState(inicial?.dia ? String(inicial.dia) : '');
  const [erro, setErro] = useState('');

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    const v = Number(valor.replace(',', '.'));
    const d = dia ? Number(dia) : undefined;
    if (!nome.trim()) return setErro('Informe a descrição.');
    if (!(v > 0)) return setErro('Informe um valor maior que zero.');
    if (rec === 'unica' && !/^\d{4}-\d{2}$/.test(ym)) return setErro('Informe o mês do recebimento.');
    if (d !== undefined && (!Number.isInteger(d) || d < 1 || d > 31)) return setErro('O dia deve ficar entre 1 e 31.');
    try {
      await onSalvar({ nome: nome.trim(), tipo, valor: v, recorrencia: rec, ym: rec === 'unica' ? ym : undefined, dia: d });
    } catch {
      setErro('Não foi possível salvar. Tente novamente.');
    }
  }

  return (
    <form onSubmit={enviar} className="pilha">
      <div className="grade-2">
        <div className="campo col-total"><label htmlFor="r-nome">Descrição</label><input id="r-nome" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus placeholder="Ex.: Salário, projeto extra" /></div>
        <div className="campo"><label htmlFor="r-tipo">Tipo</label><select id="r-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>{TIPOS_RENDA.map((t) => <option key={t}>{t}</option>)}</select></div>
        <div className="campo"><label htmlFor="r-val">Valor (R$)</label><input id="r-val" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} /></div>
        <div className="campo"><label htmlFor="r-rec">Recebimento</label><select id="r-rec" value={rec} onChange={(e) => setRec(e.target.value as Renda['recorrencia'])}><option value="mensal">Todo mês</option><option value="unica">Só em um mês</option></select></div>
        {rec === 'unica'
          ? <div className="campo"><label htmlFor="r-ym">Mês</label><input id="r-ym" type="month" value={ym} onChange={(e) => setYm(e.target.value)} /></div>
          : <div className="campo"><label htmlFor="r-dia">Dia do recebimento</label><input id="r-dia" inputMode="numeric" value={dia} onChange={(e) => setDia(e.target.value)} /></div>}
      </div>
      {erro && <div className="aviso aviso-erro" role="alert">{erro}</div>}
      <div className="acoes" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-sec" onClick={onCancelar}>Cancelar</button>
        <button type="submit" className="btn">Salvar</button>
      </div>
    </form>
  );
}

export default function RendasPage() {
  const { user } = useAuth();
  const uid = user?.uid;
  const { itens, carregando, erro, adicionar, salvar, remover } = useColecao<Renda>(uid ? ['users', uid, 'rendas'] : null);
  const [edicao, setEdicao] = useState<Com<Renda> | 'nova' | null>(null);

  const mensais = itens.filter((r) => r.recorrencia === 'mensal').sort((a, b) => a.nome.localeCompare(b.nome));
  const avulsas = itens.filter((r) => r.recorrencia === 'unica').sort((a, b) => (a.ym ?? '').localeCompare(b.ym ?? ''));
  const totalMensal = arredondar(mensais.reduce((a, r) => a + r.valor, 0));

  const linha = (r: Com<Renda>) => (
    <div key={r.id} className="linha">
      <div className="grow">
        <div className="titulo">{r.nome}</div>
        <div className="pequeno suave">{r.tipo}{r.recorrencia === 'unica' && r.ym ? ` · ${rotuloYm(r.ym)}` : r.dia ? ` · recebe dia ${r.dia}` : ''}</div>
      </div>
      <span className="num pos">{brl(r.valor)}</span>
      <div className="acoes">
        <button type="button" className="btn btn-sec btn-mini" onClick={() => setEdicao(r)}>Editar</button>
        <button type="button" className="btn btn-perigo btn-mini" aria-label={`Excluir ${r.nome}`} onClick={() => { if (confirm(`Excluir "${r.nome}"?`)) void remover(r.id); }}>✕</button>
      </div>
    </div>
  );

  return (
    <>
      <div className="pagina-cab">
        <div><div className="sub">Entradas</div><h1>Rendas</h1></div>
        <button type="button" className="btn" onClick={() => setEdicao('nova')}>Nova renda</button>
      </div>

      {erro && <div className="aviso aviso-erro" role="alert">{erro}</div>}
      {carregando ? <p className="suave">Carregando…</p> : !itens.length ? (
        <div className="card vazio">Nenhuma renda cadastrada.</div>
      ) : (
        <>
          <div className="kpis">
            <div className="k m"><small>Renda mensal recorrente</small><b>{brl(totalMensal)}</b></div>
            <div className="k"><small>Fontes todo mês</small><b>{mensais.length}</b></div>
            <div className="k"><small>Recebimentos avulsos</small><b>{avulsas.length}</b></div>
          </div>
          {mensais.length > 0 && <><div className="grupo-titulo">Todo mês · {mensais.length}</div><div className="card card-corpo"><div className="lista">{mensais.map(linha)}</div></div></>}
          {avulsas.length > 0 && <><div className="grupo-titulo">Recebimentos avulsos · {avulsas.length}</div><div className="card card-corpo"><div className="lista">{avulsas.map(linha)}</div></div></>}
        </>
      )}

      <Modal aberto={edicao !== null} titulo={edicao === 'nova' ? 'Nova renda' : 'Editar renda'} onFechar={() => setEdicao(null)}>
        <FormRenda
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
