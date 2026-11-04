'use client';

import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Modal } from '@/components/Modal';
import { useAuth } from '@/lib/auth-context';
import { useAssinatura } from '@/lib/use-assinatura';
import { resumoCartao } from '@/lib/cartoes';
import { excluirFatura, FaturaPagaError, PremiumRequiredError, importarItens } from '@/lib/cartoes-db';
import { useColecao } from '@/lib/colecao';
import { decodificar, lerCsv, NOMES_BANCO, sugerirMesFatura, totalGastos, type ResultadoCsv } from '@/lib/csv';
import { MESES, montarYm, rotuloYm, ymAtual } from '@/lib/datas';
import { brl } from '@/lib/formato';
import type { Cartao, Com, Fatura, ItemFatura } from '@/types/finance';

type Aviso = { tipo: 'ok' | 'erro'; texto: string };

function Lancamentos({ uid, cartaoId, ym }: { uid: string; cartaoId: string; ym: string }) {
  const { itens, carregando } = useColecao<ItemFatura>(['users', uid, 'cartoes', cartaoId, 'faturas', ym, 'itens']);
  if (carregando) return <p className="suave pequeno">Carregando lançamentos…</p>;
  if (!itens.length) return <p className="suave pequeno">Nenhum lançamento importado para esta fatura.</p>;

  const ordenar = (a: ItemFatura, b: ItemFatura) => b.data.split('/').reverse().join('').localeCompare(a.data.split('/').reverse().join(''));
  const grupos = [
    { titulo: 'Gastos', lista: itens.filter((i) => !i.programado && i.valor > 0).sort(ordenar) },
    { titulo: 'Pagamentos e estornos', lista: itens.filter((i) => !i.programado && i.valor < 0).sort(ordenar) },
    { titulo: 'Parcelamentos futuros (não entram no total)', lista: itens.filter((i) => i.programado).sort(ordenar) },
  ].filter((g) => g.lista.length);

  return (
    <div>
      {grupos.map((g) => (
        <div key={g.titulo}>
          <div className="grupo-titulo">{g.titulo} · {g.lista.length}</div>
          <table className="tabela-itens"><tbody>
            {g.lista.map((i) => (
              <tr key={i.id}>
                <td>{i.data}</td>
                <td>{i.descricao}{i.parcela && <span className="selo selo-azul" style={{ marginLeft: '.4rem' }}>{i.parcela}</span>}</td>
                <td className={`num ${i.valor < 0 ? 'pos' : ''}`}>{brl(Math.abs(i.valor))}</td>
              </tr>
            ))}
          </tbody></table>
        </div>
      ))}
    </div>
  );
}

function FormFatura({ inicial, onSalvar, onCancelar }: { inicial: Com<Fatura> | null; onSalvar: (ym: string, f: Fatura) => Promise<void>; onCancelar: () => void }) {
  const base = inicial?.id ?? ymAtual();
  const [mes, setMes] = useState(Number(base.split('-')[1]));
  const [ano, setAno] = useState(Number(base.split('-')[0]));
  const [valor, setValor] = useState(inicial ? String(inicial.valor) : '');
  const [status, setStatus] = useState<Fatura['status']>(inicial?.status ?? 'Pendente');
  const [erro, setErro] = useState('');

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    const v = Number(valor.replace(',', '.'));
    if (!valor || Number.isNaN(v) || v < 0) return setErro('Informe o valor da fatura.');
    if (ano < 2020 || ano > 2040) return setErro('Ano inválido.');
    try {
      await onSalvar(montarYm(ano, mes), { valor: v, status, origem: inicial?.origem ?? 'manual', atualizadaEm: new Date().toISOString() });
    } catch (e) {
      setErro(e instanceof Error && e.message === 'duplicada' ? 'Já existe uma fatura neste mês. Edite a existente.' : 'Não foi possível salvar.');
    }
  }

  return (
    <form onSubmit={enviar} className="pilha">
      <div className="grade-2">
        <div className="campo"><label htmlFor="f-mes">Mês da fatura</label><select id="f-mes" value={mes} disabled={!!inicial} onChange={(e) => setMes(Number(e.target.value))}>{MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></div>
        <div className="campo"><label htmlFor="f-ano">Ano</label><input id="f-ano" type="number" value={ano} disabled={!!inicial} onChange={(e) => setAno(Number(e.target.value))} /></div>
        <div className="campo"><label htmlFor="f-val">Valor (R$)</label><input id="f-val" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" autoFocus /></div>
        <div className="campo"><label htmlFor="f-st">Situação</label><select id="f-st" value={status} onChange={(e) => setStatus(e.target.value as Fatura['status'])}><option>Pendente</option><option>Pago</option></select></div>
      </div>
      {inicial?.origem === 'csv' && <div className="aviso aviso-alerta">Esta fatura veio de um CSV. Se importar outro arquivo, o valor volta a ser a soma dos lançamentos.</div>}
      {erro && <div className="aviso aviso-erro" role="alert">{erro}</div>}
      <div className="acoes" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-sec" onClick={onCancelar}>Cancelar</button>
        <button type="submit" className="btn">Salvar</button>
      </div>
    </form>
  );
}

function ImportarCsv({ uid, cartaoId, res, faturas, onFim }: { uid: string; cartaoId: string; res: ResultadoCsv; faturas: Com<Fatura>[]; onFim: (a: Aviso | null) => void }) {
  const sugerido = sugerirMesFatura(res);
  const [mes, setMes] = useState(Number(sugerido.split('-')[1]));
  const [ano, setAno] = useState(Number(sugerido.split('-')[0]));
  const [importando, setImportando] = useState(false);
  const ym = montarYm(ano, mes);
  const existente = faturas.find((f) => f.id === ym);
  const bloqueada = existente?.status === 'Pago';
  const gastos = res.itens.filter((i) => !i.programado && i.valor > 0);

  async function confirmar() {
    setImportando(true);
    try {
      const r = await importarItens(uid, cartaoId, ym, res.itens);
      onFim({ tipo: 'ok', texto: `${rotuloYm(ym)}: ${r.novos} lançamento(s) novo(s), ${r.ignorados} já existente(s). Total da fatura: ${brl(r.total)}.` });
    } catch (e) {
      const texto = e instanceof FaturaPagaError
        ? `A fatura de ${rotuloYm(ym)} já está paga.`
        : e instanceof PremiumRequiredError
          ? 'A assinatura Premium não está ativa. Confira seu plano antes de importar.'
          : e instanceof Error
            ? e.message
            : 'Não foi possível importar. Tente novamente.';
      onFim({ tipo: 'erro', texto });
    } finally {
      setImportando(false);
    }
  }

  return (
    <div className="pilha">
      <div className="aviso aviso-info">
        <b>{NOMES_BANCO[res.banco]}</b> · {res.itens.length} lançamento(s) lido(s) · gastos {brl(totalGastos(res.itens))} ({gastos.length})
        {res.itens.some((i) => i.programado) && ` · ${res.itens.filter((i) => i.programado).length} parcelamento(s) futuro(s)`}
      </div>
      {res.banco !== 'bradesco' && <div className="aviso aviso-alerta">Leitor automático para {NOMES_BANCO[res.banco]}: confira se o total acima bate com a sua fatura antes de confirmar.</div>}
      <p className="suave pequeno">Escolha a fatura em que estes lançamentos serão cobrados. Compras de outubro normalmente entram na fatura paga em novembro.</p>
      <div className="grade-2">
        <div className="campo"><label htmlFor="i-mes">Mês da fatura</label><select id="i-mes" value={mes} onChange={(e) => setMes(Number(e.target.value))}>{MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></div>
        <div className="campo"><label htmlFor="i-ano">Ano</label><input id="i-ano" type="number" value={ano} onChange={(e) => setAno(Number(e.target.value))} /></div>
      </div>
      {bloqueada
        ? <div className="aviso aviso-erro">A fatura de {rotuloYm(ym)} já está paga. Desfaça o pagamento para importar nela.</div>
        : <div className="aviso aviso-ok">{existente ? `A fatura de ${rotuloYm(ym)} será atualizada; lançamentos já importados não são duplicados.` : `Será criada a fatura de ${rotuloYm(ym)}.`}</div>}
      <div className="acoes" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-sec" onClick={() => onFim(null)}>Cancelar</button>
        <button type="button" className="btn" disabled={bloqueada || importando} onClick={() => void confirmar()}>{importando ? 'Importando…' : 'Importar'}</button>
      </div>
    </div>
  );
}

export default function CartaoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const assinatura = useAssinatura();
  const uid = user?.uid;
  const cartoes = useColecao<Cartao>(uid ? ['users', uid, 'cartoes'] : null);
  const faturasCol = useColecao<Fatura>(uid ? ['users', uid, 'cartoes', id, 'faturas'] : null);
  const cartao = cartoes.itens.find((c) => c.id === id);
  const faturas = [...faturasCol.itens].sort((a, b) => b.id.localeCompare(a.id));
  const resumo = resumoCartao(faturas, cartao?.limite);

  const inputArquivo = useRef<HTMLInputElement>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [edicao, setEdicao] = useState<Com<Fatura> | 'nova' | null>(null);
  const [importacao, setImportacao] = useState<ResultadoCsv | null>(null);
  const [abertas, setAbertas] = useState<Record<string, boolean>>({});

  async function lerArquivo(arquivo: File | undefined) {
    if (!arquivo) return;
    setAviso(null);
    try {
      const res = lerCsv(decodificar(await arquivo.arrayBuffer()));
      if (!res.itens.length) setAviso({ tipo: 'erro', texto: 'Não encontrei lançamentos neste arquivo. Ele precisa ser o CSV da fatura do cartão.' });
      else setImportacao(res);
    } catch {
      setAviso({ tipo: 'erro', texto: 'Não foi possível ler o arquivo.' });
    }
    if (inputArquivo.current) inputArquivo.current.value = '';
  }

  if (cartoes.carregando) return <p className="suave">Carregando…</p>;
  if (!cartao || !uid) return <><p>Cartão não encontrado.</p><Link href="/cartoes">← Voltar</Link></>;

  return (
    <>
      <Link href="/cartoes" className="pequeno">← Cartões</Link>
      <div className="pagina-cab" style={{ marginTop: '.6rem' }}>
        <div>
          <div className="sub">{cartao.bandeira}{cartao.diaVencimento ? ` · vence dia ${cartao.diaVencimento}` : ''}</div>
          <h1>{cartao.nome}</h1>
        </div>
        <div className="acoes">
          <input ref={inputArquivo} type="file" accept=".csv,.txt,text/csv" hidden onChange={(e) => void lerArquivo(e.target.files?.[0])} />
          {assinatura.premium ? (
            <button type="button" className="btn btn-sec" onClick={() => inputArquivo.current?.click()}>Importar CSV</button>
          ) : (
            <Link className="btn btn-sec" href="/planos" style={{ textDecoration: 'none' }}>Importar CSV · Premium</Link>
          )}
          <button type="button" className="btn" onClick={() => setEdicao('nova')}>Nova fatura</button>
        </div>
      </div>

      <div className="kpis">
        <div className="k m"><small>Em aberto</small><b>{brl(resumo.emAberto)}</b></div>
        <div className="k"><small>Limite disponível</small><b>{resumo.disponivel === null ? '—' : brl(resumo.disponivel)}</b></div>
      </div>

      {!assinatura.premium && <div className="aviso aviso-info" style={{ marginBottom: '1rem' }}>A importação de faturas por CSV é um recurso Premium. Você continua podendo cadastrar e editar faturas manualmente. <Link href="/planos">Conheça os planos</Link>.</div>}
      {assinatura.erro && <div className="aviso aviso-alerta" role="status" style={{ marginBottom: '1rem' }}>{assinatura.erro}</div>}
      {aviso && <div className={`aviso ${aviso.tipo === 'ok' ? 'aviso-ok' : 'aviso-erro'}`} role="status" style={{ marginBottom: '1rem' }}>{aviso.texto}</div>}

      <div className="card">
        <div className="card-cab"><h2>Faturas</h2></div>
        <div className="card-corpo">
          {faturasCol.carregando ? <p className="suave">Carregando…</p> : !faturas.length ? (
            <div className="vazio">Nenhuma fatura ainda. Importe o CSV do banco ou cadastre uma fatura manualmente.</div>
          ) : (
            <div className="lista">
              {faturas.map((f) => {
                const atrasada = f.status === 'Pendente' && f.id < ymAtual();
                return (
                  <div key={f.id}>
                    <div className="linha">
                      <div className="grow">
                        <div className="titulo">{rotuloYm(f.id)}</div>
                        <div className="pequeno suave">{f.origem === 'csv' ? 'Importada do CSV' : 'Lançada manualmente'}</div>
                      </div>
                      <span className={`selo ${f.status === 'Pago' ? 'selo-verde' : atrasada ? 'selo-verm' : 'selo-ambar'}`}>{f.status === 'Pago' ? 'Paga' : atrasada ? 'Em atraso' : 'Em aberto'}</span>
                      <span className="num">{brl(f.valor)}</span>
                      <div className="acoes">
                        <button type="button" className="btn btn-sec btn-mini" onClick={() => setAbertas((a) => ({ ...a, [f.id]: !a[f.id] }))}>{abertas[f.id] ? 'Ocultar' : 'Lançamentos'}</button>
                        <button type="button" className="btn btn-sec btn-mini" onClick={() => void faturasCol.mesclar(f.id, { status: f.status === 'Pago' ? 'Pendente' : 'Pago' })}>{f.status === 'Pago' ? 'Desfazer' : 'Marcar paga'}</button>
                        <button type="button" className="btn btn-sec btn-mini" onClick={() => setEdicao(f)}>Editar</button>
                        <button type="button" className="btn btn-perigo btn-mini" aria-label={`Excluir fatura de ${rotuloYm(f.id)}`} onClick={() => { if (confirm(`Excluir a fatura de ${rotuloYm(f.id)} e seus lançamentos?`)) void excluirFatura(uid, id, f.id); }}>✕</button>
                      </div>
                    </div>
                    {abertas[f.id] && <div style={{ padding: '0 0 1rem' }}><Lancamentos uid={uid} cartaoId={id} ym={f.id} /></div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Modal aberto={edicao !== null} titulo={edicao === 'nova' ? 'Nova fatura' : 'Editar fatura'} onFechar={() => setEdicao(null)}>
        <FormFatura
          inicial={edicao && edicao !== 'nova' ? edicao : null}
          onCancelar={() => setEdicao(null)}
          onSalvar={async (ym, dados) => {
            if (edicao === 'nova' && faturas.some((f) => f.id === ym)) throw new Error('duplicada');
            await faturasCol.salvar(ym, dados);
            setEdicao(null);
          }}
        />
      </Modal>

      <Modal aberto={importacao !== null} titulo="Importar CSV da fatura" onFechar={() => setImportacao(null)}>
        {importacao && <ImportarCsv uid={uid} cartaoId={id} res={importacao} faturas={faturas} onFim={(a) => { setImportacao(null); if (a) setAviso(a); }} />}
      </Modal>
    </>
  );
}
