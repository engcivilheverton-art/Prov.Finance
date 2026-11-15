'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { abreviar, escalaBonita } from '@/lib/escala';
import { brl } from '@/lib/formato';

export type Serie = { nome: string; cor: string; valores: number[] };

function useLargura() {
  const ref = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new ResizeObserver(([e]) => setLargura(Math.floor(e.contentRect.width)));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return [ref, largura] as const;
}

const ML = 46, MR = 8, MT = 10, MB = 28;

type PropsBarras = {
  titulo: string;
  rotulos: string[];
  /** Mais de uma série = barras empilhadas. Com uma só, valores negativos usam `corNegativa`. */
  barras: Serie[];
  linha?: Serie;
  limite?: number;
  corNegativa?: string;
  altura?: number;
};

export type AtivoGraficoBarras =
  | { tipo: 'segmento'; mes: number; serie: number }
  | { tipo: 'renda'; mes: number }
  | { tipo: 'teclado'; mes: number }
  | { tipo: 'coluna'; mes: number }
  | null;

type LinhaDica = { nome: string; cor: string; valor: number; percentual?: number };
export type DicaGraficoBarras = { rotulo: string; linhas: LinhaDica[] };

/** Monta a caixa de valores para uma série apontada, um ponto de renda ou navegação por teclado. */
export function montarDicaBarras(
  ativo: AtivoGraficoBarras,
  rotulos: string[],
  barras: Serie[],
  linha?: Serie,
): DicaGraficoBarras | null {
  if (!ativo || ativo.tipo === 'coluna' || !rotulos[ativo.mes]) return null;
  if (ativo.tipo === 'renda') {
    if (!linha) return null;
    return { rotulo: rotulos[ativo.mes], linhas: [{ nome: 'Renda', cor: linha.cor, valor: linha.valores[ativo.mes] ?? 0 }] };
  }
  if (ativo.tipo === 'segmento') {
    const serie = barras[ativo.serie];
    if (!serie) return null;
    const valor = serie.valores[ativo.mes] ?? 0;
    const totalDespesas = barras.reduce((total, item) => total + Math.max(0, item.valores[ativo.mes] ?? 0), 0);
    const percentual = valor > 0 && totalDespesas > 0
      ? Math.round(valor / totalDespesas * 100)
      : undefined;
    return { rotulo: rotulos[ativo.mes], linhas: [{ nome: serie.nome, cor: serie.cor, valor, ...(percentual !== undefined ? { percentual } : {}) }] };
  }
  return {
    rotulo: rotulos[ativo.mes],
    linhas: [...barras.map((serie) => ({ nome: serie.nome, cor: serie.cor, valor: serie.valores[ativo.mes] ?? 0 })),
      ...(linha ? [{ nome: linha.nome, cor: linha.cor, valor: linha.valores[ativo.mes] ?? 0 }] : [])],
  };
}

export function DicaBarras({ dica, left, alinhamento }: { dica: DicaGraficoBarras; left: number; alinhamento: string }) {
  return (
    <div className="grafico-dica" style={{ left, transform: `translateX(${alinhamento})` }} role="status">
      <b>{dica.rotulo}</b>
      {dica.linhas.map((item) => (
        <div key={item.nome}><i style={{ background: item.cor }} />{item.nome}<span>{brl(item.valor)}{item.percentual !== undefined && <> <small>{item.percentual}% das despesas</small></>}</span></div>
      ))}
    </div>
  );
}

export function GraficoBarras(props: PropsBarras) {
  const [ref, largura] = useLargura();
  return <div className="grafico" ref={ref}>{largura > 0 && <CorpoBarras {...props} largura={largura} />}</div>;
}

/** Desenho do gráfico para uma largura já conhecida (separado para poder ser testado sem navegador). */
export function CorpoBarras({ titulo, rotulos, barras, linha, limite, corNegativa = 'var(--ch-neg)', altura = 260, largura }: PropsBarras & { largura: number }) {
  const [ativo, setAtivo] = useState<AtivoGraficoBarras>(null);
  const n = rotulos.length;
  const pw = Math.max(largura - ML - MR, 10);
  const ph = altura - MT - MB;
  const unica = barras.length === 1;

  const topos = rotulos.map((_, i) => barras.reduce((a, b) => a + Math.max(b.valores[i] ?? 0, 0), 0));
  const fundos = rotulos.map((_, i) => barras.reduce((a, b) => a + Math.min(b.valores[i] ?? 0, 0), 0));
  const vLinha = linha?.valores ?? [];
  const maxDados = Math.max(0, ...topos, ...vLinha);
  const min = Math.min(0, ...fundos, ...vLinha);
  const max = Math.max(maxDados, limite ?? 0);
  const escala = escalaBonita(min, max);
  const y = (v: number) => MT + ph * (1 - (v - escala.min) / (escala.max - escala.min));
  const passo = pw / Math.max(n, 1);
  const larguraBarra = Math.min(30, passo * 0.64);
  const cx = (i: number) => ML + passo * (i + 0.5);
  const cadaN = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(pw / 46))));
  const vazio = maxDados === 0 && min === 0;

  function mesmoAtivo(a: AtivoGraficoBarras, b: AtivoGraficoBarras) {
    if (!a || !b) return a === b;
    return a.tipo === b.tipo && a.mes === b.mes
      && (a.tipo !== 'segmento' || (b.tipo === 'segmento' && a.serie === b.serie));
  }

  function mover(e: PointerEvent<SVGRectElement>) {
    if (n === 0) return;
    const caixa = e.currentTarget.getBoundingClientRect();
    const proporcaoX = caixa.width > 0 ? (e.clientX - caixa.left) / caixa.width : 0;
    const proporcaoY = caixa.height > 0 ? (e.clientY - caixa.top) / caixa.height : 0;
    const i = Math.min(Math.max(Math.floor(proporcaoX * n), 0), n - 1);
    const xPonteiro = ML + proporcaoX * pw;
    const yPonteiro = MT + proporcaoY * ph;
    let proximo: AtivoGraficoBarras = { tipo: 'coluna', mes: i };

    // A linha usa pontos visíveis nos gráficos com até 36 meses; só esses pontos exibem tooltip.
    if (linha && n <= 36) {
      const ponto = linha.valores.findIndex((valor, mes) => Math.hypot(xPonteiro - cx(mes), yPonteiro - y(valor)) <= 8);
      if (ponto >= 0) proximo = { tipo: 'renda', mes: ponto };
    }

    if (proximo.tipo === 'coluna') {
      let positivo = 0, negativo = 0;
      for (let serie = 0; serie < barras.length; serie++) {
        const valor = barras[serie].valores[i] ?? 0;
        if (valor === 0) continue;
        const de = valor > 0 ? positivo : negativo;
        const ate = de + valor;
        if (valor > 0) positivo = ate; else negativo = ate;
        const topo = Math.min(y(de), y(ate));
        const base = Math.max(y(de), y(ate));
        if (yPonteiro >= topo && yPonteiro <= base) {
          proximo = { tipo: 'segmento', mes: i, serie };
          break;
        }
      }
    }

    setAtivo((atual) => mesmoAtivo(atual, proximo) ? atual : proximo);
  }
  function teclado(e: KeyboardEvent<SVGSVGElement>) {
    if (e.key === 'ArrowRight') setAtivo((a) => ({ tipo: 'teclado', mes: Math.min((a?.mes ?? -1) + 1, n - 1) }));
    else if (e.key === 'ArrowLeft') setAtivo((a) => ({ tipo: 'teclado', mes: Math.max((a?.mes ?? n) - 1, 0) }));
    else if (e.key === 'Escape') setAtivo(null);
  }

  const legenda = [...barras.map((b) => ({ nome: b.nome, cor: b.cor })), ...(linha ? [{ nome: linha.nome, cor: linha.cor }] : [])];
  const dica = montarDicaBarras(ativo, rotulos, barras, linha);
  const mesAtivo = ativo?.mes ?? null;
  const alinhamento = mesAtivo === null ? '0%' : cx(mesAtivo) > largura - 120 ? '-100%' : cx(mesAtivo) < 120 ? '0%' : '-50%';

  return (
    <>
      {vazio ? (
            <div className="grafico-vazio" style={{ height: altura }}>Sem valores no período.</div>
          ) : (
            <svg width={largura} height={altura} role="img" aria-label={titulo} tabIndex={0} onKeyDown={teclado} onBlur={() => setAtivo(null)}>
              {escala.ticks.map((t) => (
                <g key={t}>
                  <line x1={ML} x2={largura - MR} y1={y(t)} y2={y(t)} className={t === 0 ? 'eixo-zero' : 'eixo-grade'} />
                  <text x={ML - 8} y={y(t)} dy="0.32em" textAnchor="end" className="eixo-texto">{abreviar(t)}</text>
                </g>
              ))}
              {mesAtivo !== null && <rect x={ML + passo * mesAtivo} y={MT} width={passo} height={ph} className="coluna-ativa" />}
              {rotulos.map((r, i) => {
                let pos = 0, neg = 0;
                return (
                  <g key={r}>
                    {barras.map((b, serie) => {
                      const v = b.valores[i] ?? 0;
                      if (v === 0) return null;
                      const de = v > 0 ? pos : neg;
                      const ate = de + v;
                      if (v > 0) pos = ate; else neg = ate;
                      const topo = Math.min(y(de), y(ate));
                      const ativoEsteSegmento = ativo?.tipo === 'segmento' && ativo.mes === i && ativo.serie === serie;
                      const reduzirDemais = ativo?.tipo === 'segmento';
                      return <rect key={b.nome} x={cx(i) - larguraBarra / 2} y={topo} width={larguraBarra} height={Math.max(Math.abs(y(de) - y(ate)), 1)} style={{ fill: unica && v < 0 ? corNegativa : b.cor, ...(reduzirDemais ? { opacity: ativoEsteSegmento ? 1 : 0.38 } : {}) }} />;
                    })}
                    {i % cadaN === 0 && <text x={cx(i)} y={altura - 8} textAnchor="middle" className="eixo-texto">{r}</text>}
                  </g>
                );
              })}
              {linha && (
                <>
                  <polyline fill="none" strokeWidth={2.5} strokeLinejoin="round" style={{ stroke: linha.cor }} points={linha.valores.map((v, i) => `${cx(i)},${y(v)}`).join(' ')} />
                  {n <= 36 && linha.valores.map((v, i) => <circle key={rotulos[i]} cx={cx(i)} cy={y(v)} r={3.2} style={{ fill: linha.cor }} className="ponto" />)}
                </>
              )}
              {limite !== undefined && limite > 0 && (
                <g aria-hidden="true" pointerEvents="none">
                  <line x1={ML} x2={largura - MR} y1={y(limite)} y2={y(limite)} stroke="var(--dn)" strokeWidth={1.5} strokeDasharray="7 5" />
                  <text x={largura - MR} y={y(limite) - 5} textAnchor="end" className="eixo-texto" style={{ fill: 'var(--dn)' }}>Limite · {brl(limite)}</text>
                </g>
              )}
              <rect x={ML} y={MT} width={pw} height={ph} fill="transparent" onPointerMove={mover} onPointerDown={mover} onPointerLeave={() => setAtivo(null)} />
            </svg>
          )}
          {dica && <DicaBarras dica={dica} left={cx(mesAtivo ?? 0)} alinhamento={alinhamento} />}
          <ul className="legenda">
            {legenda.map((l) => <li key={l.nome}><i style={{ background: l.cor }} />{l.nome}</li>)}
          </ul>
          <table className="sr-only">
            <caption>{titulo}</caption>
            <thead><tr><th>Período</th>{legenda.map((l) => <th key={l.nome}>{l.nome}</th>)}</tr></thead>
            <tbody>
              {rotulos.map((r, i) => (
                <tr key={r}><th>{r}</th>{[...barras, ...(linha ? [linha] : [])].map((s) => <td key={s.nome}>{brl(s.valores[i] ?? 0)}</td>)}</tr>
              ))}
            </tbody>
          </table>
    </>
  );
}

export type FatiaRosca = { nome: string; valor: number; cor: string };

export function GraficoRosca({ titulo, fatias }: { titulo: string; fatias: FatiaRosca[] }) {
  const [fatiaAtiva, setFatiaAtiva] = useState<number | null>(null);
  const total = fatias.reduce((a, f) => a + f.valor, 0);
  if (!(total > 0)) return <div className="grafico-vazio" style={{ height: 180 }}>Sem gastos neste mês.</div>;

  const tamanho = 190, r = 70, espessura = 28, C = 2 * Math.PI * r, meio = tamanho / 2;
  const comprimentos = fatias.map((f) => (f.valor / total) * C);
  const inicios = comprimentos.map((_, i) => comprimentos.slice(0, i).reduce((a, b) => a + b, 0));
  const fatia = fatiaAtiva === null ? null : fatias[fatiaAtiva];

  return (
    <div className="rosca rosca-interativa">
      <svg width={tamanho} height={tamanho} role="img" aria-label={titulo} viewBox={`0 0 ${tamanho} ${tamanho}`}>
        {fatias.map((f, i) => (
          <circle key={f.nome} cx={meio} cy={meio} r={r} fill="none" transform={`rotate(-90 ${meio} ${meio})`}
            strokeDasharray={`${Math.max(comprimentos[i] - 1.5, 0.5)} ${C}`} strokeDashoffset={-inicios[i]}
            strokeWidth={fatiaAtiva === i ? espessura + 6 : espessura}
            opacity={fatiaAtiva !== null && fatiaAtiva !== i ? 0.35 : 1}
            tabIndex={0} role="img" aria-label={`${f.nome}: ${brl(f.valor)}, ${Math.round((f.valor / total) * 100)}% do total`}
            className="rosca-segmento" style={{ stroke: f.cor }}
            onPointerEnter={(event) => { if (event.pointerType === 'mouse') setFatiaAtiva(i); }}
            onPointerMove={(event) => { if (event.pointerType === 'mouse') setFatiaAtiva(i); }}
            onPointerDown={() => setFatiaAtiva(i)}
            onPointerLeave={(event) => { if (event.pointerType === 'mouse') setFatiaAtiva(null); }}
            onFocus={() => setFatiaAtiva(i)}
            onBlur={() => setFatiaAtiva(null)}
            onKeyDown={(event) => { if (event.key === 'Escape') setFatiaAtiva(null); }} />
        ))}
        <text x={meio} y={meio - 4} textAnchor="middle" className="rosca-rotulo">Total</text>
        <text x={meio} y={meio + 16} textAnchor="middle" className="rosca-total">{brl(total)}</text>
      </svg>
      <ul className="rosca-lista">
        {fatias.map((f) => (
          <li key={f.nome}>
            <i style={{ background: f.cor }} />
            <span className="grow">{f.nome}</span>
            <span className="suave pequeno">{Math.round((f.valor / total) * 100)}%</span>
            <span className="num">{brl(f.valor)}</span>
          </li>
        ))}
      </ul>
      {fatia && (
        <div className="grafico-dica rosca-dica" role="status">
          <b>{fatia.nome}</b>
          <div><i style={{ background: fatia.cor }} />{Math.round((fatia.valor / total) * 100)}% do total<span>{brl(fatia.valor)}</span></div>
        </div>
      )}
    </div>
  );
}
