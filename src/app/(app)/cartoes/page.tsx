'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { Modal } from '@/components/Modal';
import { PremiumBadge } from '@/components/PremiumBadge';
import { UpgradeModal } from '@/components/UpgradeModal';
import { GraficoBarras } from '@/components/graficos';
import { useAuth } from '@/lib/auth-context';
import { resumoCartao } from '@/lib/cartoes';
import { excluirCartao } from '@/lib/cartoes-db';
import { useColecao } from '@/lib/colecao';
import { chaveDe, useColecoes } from '@/lib/colecoes';
import { rotuloCurto, rotuloYm } from '@/lib/datas';
import { arredondar, brl, lerDecimal } from '@/lib/formato';
import { db } from '@/lib/firebase';
import { usePlanLimits } from '@/lib/use-plan-limits';
import { PALETA_CARTAO, type Cartao, type Com, type Fatura } from '@/types/finance';

const BANDEIRAS = ['Visa', 'Mastercard', 'Elo', 'American Express', 'Hipercard', 'Outra'];
const BANCOS: { nome: string; logo?: string }[] = [
  { nome: 'Itaú', logo: '/logos/itau.png' },
  { nome: 'Caixa', logo: '/logos/caixa.png' },
  { nome: 'Santander', logo: '/logos/santander.png' },
  { nome: 'Banco do Brasil', logo: '/logos/banco_do_brasil.png' },
  { nome: 'C6' },
  { nome: 'Mercado Pago', logo: '/logos/mercado_pago.png' },
  { nome: 'Inter', logo: '/logos/inter.png' },
  { nome: 'Bradesco', logo: '/logos/bradesco.png' },
  { nome: 'Nubank', logo: '/logos/nubank.png' },
  { nome: 'Outro' },
];
const LOGOS_BANDEIRA: Record<string, string> = {
  Visa: '/logos/visa.png',
  Mastercard: '/logos/mastercard.png',
};

function corTexto(hex: string) {
  const cor = hex.replace('#', '');
  const rgb = [0, 2, 4].map((i) => Number.parseInt(cor.slice(i, i + 2), 16));
  const luminancia = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
  return luminancia > 155 ? '#172033' : '#ffffff';
}

function LogoMarca({ src, nome, className = '' }: { src?: string; nome: string; className?: string }) {
  return (
    <span className={`marca-logo ${className}`}>
      {src ? <Image src={src} alt={nome} width={76} height={38} /> : <span>{nome}</span>}
    </span>
  );
}

function CartaoCard({ cartao, faturas, onEditar, onExcluir }: { cartao: Com<Cartao>; faturas: Com<Fatura>[]; onEditar: () => void; onExcluir: () => void }) {
  const r = resumoCartao(faturas, cartao.limite);

  return (
    <div className="cc-wrap">
      <Link href={`/cartoes/${cartao.id}`} className="cc" style={{ background: cartao.corBase, color: corTexto(cartao.corBase) }}>
        <div className="cc-marcas">
          <LogoMarca src={BANCOS.find((b) => b.nome === cartao.banco)?.logo} nome={cartao.banco ?? 'Outro'} />
        </div>
        <div className="cc-info">
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
        <LogoMarca className="cc-bandeira" src={LOGOS_BANDEIRA[cartao.bandeira]} nome={cartao.bandeira} />
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
  const [banco, setBanco] = useState(inicial?.banco ?? 'Outro');
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
      await onSalvar({ nome: nome.trim(), banco, bandeira, diaVencimento: d, limite: l, corBase: cor });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar. Tente novamente.');
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="pilha">
      <div className="campo">
        <label>Banco ou instituição</label>
        <div className="marcas-selecao" role="group" aria-label="Banco ou instituição">
          {BANCOS.map((b) => (
            <button key={b.nome} type="button" className="marca-opcao" aria-pressed={banco === b.nome} onClick={() => setBanco(b.nome)}>
              <LogoMarca src={'logo' in b ? b.logo : undefined} nome={b.nome} />
              <span>{b.nome}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="grade-2">
        <div className="campo col-total"><label htmlFor="c-nome">Nome do cartão</label><input id="c-nome" name="nome-cartao" autoComplete="off" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Cartão principal" autoFocus /></div>
        <div className="campo col-total">
          <label>Bandeira</label>
          <div className="marcas-selecao bandeiras-selecao" role="group" aria-label="Bandeira do cartão">
            {BANDEIRAS.map((b) => (
              <button key={b} type="button" className="marca-opcao" aria-pressed={bandeira === b} onClick={() => setBandeira(b)}>
                <LogoMarca src={LOGOS_BANDEIRA[b]} nome={b} />
                <span>{b}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="campo"><label htmlFor="c-dia">Dia do vencimento</label><input id="c-dia" inputMode="numeric" value={dia} onChange={(e) => setDia(e.target.value)} placeholder="10" /></div>
        <div className="campo col-total"><label htmlFor="c-lim">Limite (R$)</label><input id="c-lim" inputMode="decimal" value={limite} onChange={(e) => setLimite(e.target.value)} placeholder="0,00" /></div>
      </div>
      <div className="campo">
        <label>Cor</label>
        <div className="paleta">
          {PALETA_CARTAO.map((c) => (
            <button key={c.base} type="button" className="cor" aria-label={c.nome} title={c.nome} aria-pressed={cor === c.base} style={{ background: c.base }} onClick={() => setCor(c.base)} />
          ))}
        </div>
      </div>
      <div className="cc" style={{ background: cor, color: corTexto(cor), minHeight: 125 }}>
        <div className="cc-marcas">
          <LogoMarca src={BANCOS.find((b) => b.nome === banco)?.logo} nome={banco} />
          <LogoMarca src={LOGOS_BANDEIRA[bandeira]} nome={bandeira} />
        </div>
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
  const caminhosFaturas = uid && !carregando ? cartoes.map((c) => ['users', uid, 'cartoes', c.id, 'faturas']) : null;
  const faturasCol = useColecoes<Fatura>(caminhosFaturas);
  const faturasPorCartao = useMemo(() => Object.fromEntries(cartoes.map((c) => [
    c.id,
    uid ? faturasCol.dados[chaveDe(['users', uid, 'cartoes', c.id, 'faturas'])] ?? [] : [],
  ])) as Record<string, Com<Fatura>[]>, [cartoes, faturasCol.dados, uid]);
  const mesesFaturas = useMemo(() => {
    const totais: Record<string, number> = {};
    for (const faturas of Object.values(faturasPorCartao)) {
      for (const fatura of faturas) totais[fatura.id] = arredondar((totais[fatura.id] ?? 0) + fatura.valor);
    }
    return Object.entries(totais).sort(([a], [b]) => a.localeCompare(b));
  }, [faturasPorCartao]);
  const [edicao, setEdicao] = useState<Com<Cartao> | 'novo' | null>(null);
  const [upgrade, setUpgrade] = useState(false);
  const [limiteTexto, setLimiteTexto] = useState('');
  const [limiteCarregando, setLimiteCarregando] = useState(true);
  const [limiteSalvando, setLimiteSalvando] = useState(false);
  const [erroLimite, setErroLimite] = useState('');
  const podeAdicionar = limites.canAdd('cards', cartoes.length);
  const limite = lerDecimal(limiteTexto);
  const limiteValido = Number.isFinite(limite) && limite > 0;

  useEffect(() => {
    let ativo = true;
    if (!uid) return () => { ativo = false; };
    getDoc(doc(db, 'users', uid, 'preferencias', 'cartoes'))
      .then((snap) => {
        if (!ativo) return;
        const valor = snap.data()?.limiteMensal;
        if (typeof valor === 'number' && Number.isFinite(valor) && valor > 0) {
          setLimiteTexto(new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(valor));
        }
      })
      .catch(() => { if (ativo) setErroLimite('Não foi possível carregar o limite mensal salvo.'); })
      .finally(() => { if (ativo) setLimiteCarregando(false); });
    return () => { ativo = false; };
  }, [uid]);

  async function salvarLimite() {
    setErroLimite('');
    if (!uid) return;
    if (!limiteValido) { setErroLimite('Informe um limite mensal maior que zero.'); return; }
    setLimiteSalvando(true);
    try {
      await setDoc(doc(db, 'users', uid, 'preferencias', 'cartoes'), { limiteMensal: arredondar(limite) }, { merge: true });
      setLimiteTexto(new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(arredondar(limite)));
    } catch {
      setErroLimite('Não foi possível salvar o limite. Tente novamente.');
    } finally { setLimiteSalvando(false); }
  }

  async function removerLimite() {
    if (!uid) return;
    setLimiteSalvando(true);
    setErroLimite('');
    try {
      await deleteDoc(doc(db, 'users', uid, 'preferencias', 'cartoes'));
      setLimiteTexto('');
    } catch {
      setErroLimite('Não foi possível remover o limite. Tente novamente.');
    } finally { setLimiteSalvando(false); }
  }

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
          {cartoes.map((c) => <CartaoCard key={c.id} cartao={c} faturas={faturasPorCartao[c.id] ?? []} onEditar={() => setEdicao(c)} onExcluir={() => void excluir(c)} />)}
          <button type="button" className="cc cc-novo" onClick={() => podeAdicionar ? setEdicao('novo') : setUpgrade(true)} disabled={limites.carregando}>
            <span style={{ fontSize: '1.6rem' }}>＋</span>Adicionar cartão {!podeAdicionar && <PremiumBadge />}
            {!limites.premium && <span className="pequeno">{cartoes.length}/2 no Free</span>}
          </button>
        </div>
      )}

      <div className="card cartoes-grafico" style={{ marginTop: '1rem' }}>
        <div className="card-cab"><h2>Faturas mensais dos cartões</h2></div>
        <div className="card-corpo pilha">
          <p className="suave pequeno">Totaliza as faturas de todos os cartões por mês. Defina um limite para comparar seus gastos com a meta mensal.</p>
          <div className="acoes cartoes-limite">
            <label className="campo"><span>Limite mensal (R$)</span><input inputMode="decimal" aria-label="Limite mensal de gastos nos cartões" placeholder="Ex.: 3.000,00" value={limiteTexto} onChange={(ev) => setLimiteTexto(ev.target.value)} /></label>
            <button type="button" className="btn btn-mini" onClick={() => void salvarLimite()} disabled={limiteSalvando || limiteCarregando}>{limiteSalvando ? 'Salvando…' : 'Salvar limite'}</button>
            {!!limiteTexto && <button type="button" className="btn btn-sec btn-mini" onClick={() => void removerLimite()} disabled={limiteSalvando}>Remover</button>}
          </div>
          {erroLimite && <p className="aviso aviso-erro" role="alert">{erroLimite}</p>}
          {faturasCol.carregando || limiteCarregando ? <p className="suave">Carregando faturas…</p> : mesesFaturas.length ? (
            <>
              {limiteValido && <p className="pequeno" style={{ color: 'var(--dn-tx)' }}>Limite mensal: {brl(limite)} por mês.</p>}
              <GraficoBarras titulo="Total das faturas de todos os cartões por mês" rotulos={mesesFaturas.map(([ym]) => rotuloCurto(ym))}
                barras={[{ nome: 'Faturas', cor: 'var(--ch-cartoes)', valores: mesesFaturas.map(([, valor]) => valor) }]}
                limite={limiteValido ? limite : undefined} />
            </>
          ) : <p className="suave">As faturas aparecerão agrupadas aqui quando houver lançamentos mensais.</p>}
        </div>
      </div>

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
