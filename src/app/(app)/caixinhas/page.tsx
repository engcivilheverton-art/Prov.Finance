'use client';

import { useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import Link from 'next/link';
import { Modal } from '@/components/Modal';
import { GraficoRosca } from '@/components/graficos';
import { faturasPorMes, totaisDoMes } from '@/lib/analises';
import { useAuth } from '@/lib/auth-context';
import { resumoCaixinhas, somaPercentuais, validarPercentuais } from '@/lib/caixinhas';
import { useConfigCaixinhas, useGastosManuais } from '@/lib/caixinhas-db';
import { useColecao } from '@/lib/colecao';
import { chaveDe, useColecoes } from '@/lib/colecoes';
import { MESES, rotuloCurto, rotuloYm, somarMeses, ymAtual } from '@/lib/datas';
import { arredondar, brl, lerDecimal } from '@/lib/formato';
import { CAIXINHAS, type ChaveCaixinha } from '@/types/caixinhas';
import type { Cartao, Com, ContaFixa, Divida, Fatura, Renda } from '@/types/finance';
import estilos from './caixinhas.module.css';

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

function FormPercentuais({ inicial, onSalvar, onCancelar }: {
  inicial: Record<ChaveCaixinha, number>;
  onSalvar: (valores: Record<ChaveCaixinha, number>) => Promise<void>;
  onCancelar: () => void;
}) {
  const [texto, setTexto] = useState(() => Object.fromEntries(CAIXINHAS.map((c) => [c.chave, String(inicial[c.chave])])) as Record<ChaveCaixinha, string>);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const parcial = Object.fromEntries(CAIXINHAS.map((c) => [c.chave, lerDecimal(texto[c.chave] || '0')])) as Record<ChaveCaixinha, number>;
  const soma = somaPercentuais(parcial);
  const fecha = soma === 100;

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    const r = validarPercentuais(texto);
    if (!r.ok) return setErro(r.erro);
    setSalvando(true);
    try {
      await onSalvar(r.valores);
    } catch {
      setErro('Não foi possível salvar. Tente novamente.');
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="pilha">
      <p className="pequeno suave">Defina quanto (%) da renda do mês vai para cada caixinha. O ideal é que a soma feche em <strong>100%</strong>.</p>
      <div className="grade-2">
        {CAIXINHAS.map((c) => (
          <div className="campo" key={c.chave}>
            <label htmlFor={`cx-${c.chave}`}>{c.icone} {c.nome} (%)</label>
            <input id={`cx-${c.chave}`} inputMode="decimal" value={texto[c.chave]} onChange={(e) => setTexto((t) => ({ ...t, [c.chave]: e.target.value }))} />
          </div>
        ))}
      </div>
      <div className={`aviso ${fecha ? 'aviso-ok' : 'aviso-alerta'}`} role="status">
        {fecha ? `Soma: ${soma}% — fecha 100% da renda.` : Number.isFinite(soma) ? `Soma: ${soma}% — o ideal é fechar em 100%.` : 'Confira os valores digitados.'}
      </div>
      {erro && <div className="aviso aviso-erro" role="alert">{erro}</div>}
      <div className="acoes" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-sec" onClick={onCancelar}>Cancelar</button>
        <button type="submit" className="btn" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
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
    try {
      await acao();
    } catch {
      setErro('Não foi possível salvar. Tente novamente.');
      setOcupado(false);
    }
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
      <div className="campo">
        <label htmlFor="cg-valor">Valor gasto (R$)</label>
        <input id="cg-valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} autoFocus placeholder="0,00" />
      </div>
      <p className="pequeno suave">
        {automatica
          ? `Valor automático desta caixinha: ${brl(gastoAuto)} (soma dos lançamentos cadastrados no app).`
          : 'Esta caixinha não tem cálculo automático: informe o valor gasto no mês.'}
      </p>
      {erro && <div className="aviso aviso-erro" role="alert">{erro}</div>}
      <div className="acoes" style={{ justifyContent: 'flex-end' }}>
        {editado && (
          <button type="button" className="btn btn-sec" style={{ marginRight: 'auto' }} disabled={ocupado} onClick={() => void executar(onLimpar)}>
            {automatica ? 'Restaurar valor automático' : 'Limpar lançamento'}
          </button>
        )}
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
  const [editandoPct, setEditandoPct] = useState(false);
  const [editandoGasto, setEditandoGasto] = useState<ChaveCaixinha | null>(null);

  const config = useConfigCaixinhas(uid);
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

  const carregando = config.carregando || manuais.carregando || cartoes.carregando || dividas.carregando || rendas.carregando || fixas.carregando || faturasCol.carregando;
  const erro = config.erro ?? manuais.erro ?? cartoes.erro ?? dividas.erro ?? rendas.erro ?? fixas.erro ?? faturasCol.erro;

  const totais = useMemo(
    () => totaisDoMes(ym, { faturas: faturasPorMes(faturasPorCartao), dividas: dividas.itens, fixas: fixas.itens, rendas: rendas.itens }),
    [ym, faturasPorCartao, dividas.itens, fixas.itens, rendas.itens],
  );
  const resumo = useMemo(
    () => resumoCaixinhas({ renda: totais.renda, pct: config.pct, totais, manuais: manuais.valores }),
    [totais, config.pct, manuais.valores],
  );
  const fatias = resumo.caixinhas.filter((c) => c.planejado > 0).map((c) => ({ nome: c.nome, valor: c.planejado, cor: c.cor }));
  const aberta = editandoGasto ? resumo.caixinhas.find((c) => c.chave === editandoGasto) : undefined;

  return (
    <>
      <div className="pagina-cab">
        <div><div className="sub">Orçamento</div><h1>Caixinhas</h1></div>
        <div className="acoes">
          <SeletorMes ym={ym} onChange={setYm} />
          <button type="button" className="btn" onClick={() => setEditandoPct(true)}>Editar percentuais</button>
        </div>
      </div>

      {erro && <div className="aviso aviso-erro" role="alert" style={{ marginBottom: '1rem' }}>{erro}</div>}
      {!carregando && !(totais.renda > 0) && (
        <div className="aviso aviso-info" style={{ marginBottom: '1rem' }}>
          Não há renda em {rotuloYm(ym)}. Cadastre uma em <Link href="/rendas">Rendas</Link> para calcular o valor planejado de cada caixinha.
        </div>
      )}

      <div className="kpis" aria-busy={carregando}>
        <div className="k m"><small>Renda em {rotuloCurto(ym)}</small><b>{carregando ? '—' : brl(totais.renda)}</b></div>
        <div className="k"><small>Planejado ({carregando ? '—' : `${resumo.somaPct}%`} da renda)</small><b>{carregando ? '—' : brl(resumo.totalPlanejado)}</b></div>
        <div className="k"><small>Gasto nas caixinhas</small><b>{carregando ? '—' : brl(resumo.totalGasto)}</b></div>
        <div className="k"><small>Sem caixinha</small><b className={!carregando && resumo.naoAlocado < 0 ? 'neg' : undefined}>{carregando ? '—' : brl(resumo.naoAlocado)}</b></div>
      </div>

      {carregando ? <p className="suave" style={{ marginTop: '1rem' }}>Carregando…</p> : (
        <>
          {resumo.somaPct !== 100 && (
            <div className={`aviso aviso-alerta ${estilos.soma}`}>
              Os percentuais somam {resumo.somaPct}%. O ideal é fechar em 100% — ajuste em “Editar percentuais”.
            </div>
          )}

          <div className={estilos.grade}>
            {resumo.caixinhas.map((c) => (
              <section key={c.chave} className={`card ${estilos.caixa}`} style={{ '--cor': c.cor } as CSSProperties} aria-label={c.nome}>
                <div className={estilos.topo} />
                <div className={estilos.cab}>
                  <span className={estilos.icone} aria-hidden="true">{c.icone}</span>
                  <b className={estilos.nome}>{c.nome}</b>
                  <span className="selo">{c.pct}%</span>
                </div>
                <div className={estilos.linha}><span>Planejado</span><b>{brl(c.planejado)}</b></div>
                <div className={estilos.linha}><span>Gasto{c.editado ? ' · editado' : ''}</span><b className={estilos[c.situacao]}>{brl(c.gasto)}</b></div>
                <div className={estilos.uso}>
                  <div className="barra" role="progressbar" aria-label={`Uso de ${c.nome}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, c.usoPct)}>
                    <span className={estilos[`preench-${c.situacao}`]} style={{ width: `${Math.min(100, c.usoPct)}%` }} />
                  </div>
                  <div className="pequeno suave" style={{ marginTop: '.35rem' }}>
                    {c.usoPct}% da caixinha usado{!c.automatica && !c.editado ? ' · nenhum gasto lançado' : ''}
                  </div>
                </div>
                <div className={estilos.rodape}>
                  <button type="button" className="btn btn-sec btn-mini" onClick={() => setEditandoGasto(c.chave)}>Editar gasto</button>
                </div>
              </section>
            ))}
          </div>

          <div className={`card card-corpo ${estilos['rosca-bloco']}`}>
            <div className="grupo-titulo">Repartição planejada da renda</div>
            {fatias.length > 0
              ? <GraficoRosca titulo={`Repartição planejada da renda de ${rotuloYm(ym)}`} fatias={fatias} />
              : <div className="grafico-vazio" style={{ height: 120 }}>Sem renda no mês para repartir.</div>}
          </div>
        </>
      )}

      <Modal aberto={editandoPct} titulo="Editar percentuais das caixinhas" onFechar={() => setEditandoPct(false)}>
        <FormPercentuais
          inicial={config.pct}
          onCancelar={() => setEditandoPct(false)}
          onSalvar={async (valores) => { await config.salvar(valores); setEditandoPct(false); }}
        />
      </Modal>

      <Modal aberto={aberta !== undefined} titulo={aberta ? `Gasto · ${aberta.nome}` : 'Gasto'} onFechar={() => setEditandoGasto(null)}>
        {aberta && (
          <FormGasto
            key={`${aberta.chave}-${ym}`}
            nome={aberta.nome}
            rotuloMes={rotuloYm(ym)}
            automatica={aberta.automatica}
            gastoAuto={aberta.gastoAuto}
            valorInicial={aberta.editado ? aberta.gasto : null}
            editado={aberta.editado}
            onCancelar={() => setEditandoGasto(null)}
            onSalvar={async (valor) => { await manuais.definir(aberta.chave, valor); setEditandoGasto(null); }}
            onLimpar={async () => { await manuais.limpar(aberta.chave); setEditandoGasto(null); }}
          />
        )}
      </Modal>
    </>
  );
}
