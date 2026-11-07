'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Modal } from '@/components/Modal';
import { PremiumBadge } from '@/components/PremiumBadge';
import { UpgradeModal } from '@/components/UpgradeModal';
import { useAuth } from '@/lib/auth-context';
import { resumoCartao } from '@/lib/cartoes';
import { excluirCartao } from '@/lib/cartoes-db';
import { useColecao } from '@/lib/colecao';
import { usePlanLimits } from '@/lib/use-plan-limits';
import { rotuloYm } from '@/lib/datas';
import { brl } from '@/lib/formato';
import { PALETA_CARTAO, type Cartao, type Com, type Fatura } from '@/types/finance';

const BANDEIRAS = ['Visa', 'Mastercard', 'Elo', 'American Express', 'Hipercard', 'Outra'];
const gradiente = (base: string) => {
  const p = PALETA_CARTAO.find((c) => c.base === base) ?? PALETA_CARTAO[0];
  return `linear-gradient(135deg, ${p.base}, ${p.fim})`;
};

function CartaoCard({ uid, cartao, onEditar, onExcluir }: { uid: string; cartao: Com<Cartao>; onEditar: () => void; onExcluir: () => void }) {
  const { itens: faturas } = useColecao<Fatura>(['users', uid, 'cartoes', cartao.id, 'faturas']);
  const r = resumoCartao(faturas, cartao.limite);

  return (
    <div className="cc-wrap">
      <Link href={`/cartoes/${cartao.id}`} className="cc" style={{ background: gradiente(cartao.corBase) }}>
        <span className="marca">{cartao.bandeira}</span>
        <div>
          <div className="nome">{cartao.nome}</div>
          <div className="rot" style={{ marginTop: '.7rem' }}>
            {r.proxima ? `Fatura ${rotuloYm(r.proxima.id)} · ${r.proximaAtrasada ? 'em atraso' : 'em aberto'}` : 'Sem fatura em aberto'}
          </div>
          <div className="valor">{brl(r.proxima?.valor ?? 0)}</div>
          <div className="rot" style={{ marginTop: '.4rem' }}>
            {cartao.diaVencimento ? `Vence dia ${cartao.diaVencimento}` : 'Vencimento não informado'}
            {r.disponivel !== null && ` · Disponível ${brl(r.disponivel)}`}
          </div>
          {cartao.limite ? (
            <div className="pb" style={{ marginTop: '.6rem' }}>
              <i style={{ width: `${Math.min(100, Math.round((r.emAberto / cartao.limite) * 100))}%` }} />
            </div>
          ) : null}
        </div>
      </Link>
      <div className="cc-acoes">
        <button type="button" aria-label={`Editar ${cartao.nome}`} onClick={onEditar}>✎</button>
        <button type="button" aria-label={`Excluir ${cartao.nome}`} onClick={onExcluir}>✕</button>
      </div>
    </div>
  );
}

function FormCartao({ inicial, onSalvar, onCancelar }: { inicial: Cartao | null; onSalvar: (c: Cartao) => Promise<void>; onCancelar: () => void }) {
  const [nome, setNome] = useState(inicial?.nome ?? '');
  const [bandeira, setBandeira] = useState(inicial?.bandeira ?? 'Visa');
  const [dia, setDia] = useState(inicial?.diaVencimento ? String(inicial.diaVencimento) : '');
  const [limite, setLimite] = useState(inicial?.limite ? String(inicial.limite) : '');
  const [cor, setCor] = useState(inicial?.corBase ?? PALETA_CARTAO[0].base);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    const d = dia ? Number(dia) : undefined;
    const l = limite ? Number(limite.replace(',', '.')) : undefined;
    if (!nome.trim()) return setErro('Informe o nome do cartão.');
    if (d !== undefined && (!Number.isInteger(d) || d < 1 || d > 31)) return setErro('O dia de vencimento deve ficar entre 1 e 31.');
    if (l !== undefined && (Number.isNaN(l) || l < 0)) return setErro('Limite inválido.');
    setSalvando(true);
    try {
      await onSalvar({ nome: nome.trim(), bandeira, diaVencimento: d, limite: l, corBase: cor });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar. Tente novamente.');
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="pilha">
      <div className="grade-2">
        <div className="campo col-total"><label htmlFor="c-nome">Nome do cartão</label><input id="c-nome" name="nome-cartao" autoComplete="off" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Cartão principal" autoFocus /></div>
        <div className="campo"><label htmlFor="c-band">Bandeira</label><select id="c-band" value={bandeira} onChange={(e) => setBandeira(e.target.value)}>{BANDEIRAS.map((b) => <option key={b}>{b}</option>)}</select></div>
        <div className="campo"><label htmlFor="c-dia">Dia do vencimento</label><input id="c-dia" inputMode="numeric" value={dia} onChange={(e) => setDia(e.target.value)} placeholder="10" /></div>
        <div className="campo col-total"><label htmlFor="c-lim">Limite (R$)</label><input id="c-lim" inputMode="decimal" value={limite} onChange={(e) => setLimite(e.target.value)} placeholder="0,00" /></div>
      </div>
      <div className="campo">
        <label>Cor</label>
        <div className="paleta">
          {PALETA_CARTAO.map((c) => (
            <button key={c.base} type="button" className="cor" aria-label={c.nome} aria-pressed={cor === c.base} style={{ background: gradiente(c.base) }} onClick={() => setCor(c.base)} />
          ))}
        </div>
      </div>
      <div className="cc" style={{ background: gradiente(cor), minHeight: 110 }}>
        <span className="marca">{bandeira}</span>
        <div className="nome">{nome || 'Nome do cartão'}</div>
      </div>
      {erro && <div className="aviso aviso-erro" role="alert">{erro}</div>}
      <div className="acoes" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-sec" onClick={onCancelar}>Cancelar</button>
        <button type="submit" className="btn" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
      </div>
    </form>
  );
}

export default function CartoesPage() {
  const { user } = useAuth();
  const limites = usePlanLimits();
  const uid = user?.uid;
  const { itens: cartoes, carregando, erro, salvar } = useColecao<Cartao>(uid ? ['users', uid, 'cartoes'] : null);
  const [edicao, setEdicao] = useState<Com<Cartao> | 'novo' | null>(null);
  const [upgrade, setUpgrade] = useState(false);
  const podeAdicionar = limites.canAdd('cards', cartoes.length);

  async function excluir(c: Com<Cartao>) {
    if (!uid || !confirm(`Excluir o cartão "${c.nome}" e todas as faturas dele?`)) return;
    await excluirCartao(uid, c.id);
  }

  return (
    <>
      <div className="pagina-cab">
        <div><div className="sub">Crédito</div><h1>Cartões</h1></div>
      </div>

      {erro && <div className="aviso aviso-erro" role="alert">{erro}</div>}
      {carregando ? <p className="suave">Carregando…</p> : (
        <div className="cartoes">
          {uid && cartoes.map((c) => <CartaoCard key={c.id} uid={uid} cartao={c} onEditar={() => setEdicao(c)} onExcluir={() => void excluir(c)} />)}
          <button type="button" className="cc cc-novo" onClick={() => podeAdicionar ? setEdicao('novo') : setUpgrade(true)} disabled={limites.carregando}>
            <span style={{ fontSize: '1.6rem' }}>＋</span>Adicionar cartão {!podeAdicionar && <PremiumBadge />}
            {!limites.premium && <span className="pequeno">{cartoes.length}/2 no Free</span>}
          </button>
        </div>
      )}

      <Modal aberto={edicao !== null} titulo={edicao === 'novo' ? 'Novo cartão' : 'Editar cartão'} onFechar={() => setEdicao(null)}>
        <FormCartao
          inicial={edicao && edicao !== 'novo' ? edicao : null}
          onCancelar={() => setEdicao(null)}
          onSalvar={async (dados) => {
            if (edicao && edicao !== 'novo') await salvar(edicao.id, dados);
            else await limites.create('cards', dados);
            setEdicao(null);
          }}
        />
      </Modal>
      <UpgradeModal aberto={upgrade} onFechar={() => setUpgrade(false)} recurso="cartões adicionais" />
    </>
  );
}
