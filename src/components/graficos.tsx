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
  corNegativa?: string;
  altura?: number;
};

export function GraficoBarras(props: PropsBarras) {
  const [ref, largura] = useLargura();
  return <div className="grafico" ref={ref}>{largura > 0 && <CorpoBarras {...props} largura={largura} />}</div>;
}

/** Desenho do gráfico para uma largura já conhecida (separado para poder ser testado sem navegador). */
export function CorpoBarras({ titulo, rotulos, barras, linha, corNegativa = 'var(--ch-neg)', altura = 260, largura }: PropsBarras & { largura: number }) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const n = rotulos.length;
  const pw = Math.max(largura - ML - MR, 10);
  const ph = altura - MT - MB;
  const unica = barras.length === 1;

  const topos = rotulos.map((_, i) => barras.reduce((a, b) => a + Math.max(b.valores[i] ?? 0, 0), 0));
  const fundos = rotulos.map((_, i) => barras.reduce((a, b) => a + Math.min(b.valores[i] ?? 0, 0), 0));
  const vLinha = linha?.valores ?? [];
  const max = Math.max(0, ...topos, ...vLinha);
  const min = Math.min(0, ...fundos, ...vLinha);
  const escala = escalaBonita(min, max);
  const y = (v: number) => MT + ph * (1 - (v - escala.min) / (escala.max - escala.min));
  const passo = pw / Math.max(n, 1);
  const larguraBarra = Math.min(30, passo * 0.64);
  const cx = (i: number) => ML + passo * (i + 0.5);
  const cadaN = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(pw / 46))));
  const vazio = max === 0 && min === 0;

  function mover(e: PointerEvent<SVGRectElement>) {
    const caixa = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - caixa.left) / passo);
    setAtivo(Math.min(Math.max(i, 0), n - 1));
  }
  function teclado(e: KeyboardEvent<SVGSVGElement>) {
    if (e.key === 'ArrowRight') setAtivo((a) => Math.min((a ?? -1) + 1, n - 1));
    else if (e.key === 'ArrowLeft') setAtivo((a) => Math.max((a ?? n) - 1, 0));
    else if (e.key === 'Escape') setAtivo(null);
  }

  const legenda = [...barras.map((b) => ({ nome: b.nome, cor: b.cor })), ...(linha ? [{ nome: linha.nome, cor: linha.cor }] : [])];
  const dica = ativo === null ? null : {
    rotulo: rotulos[ativo],
    linhas: [...barras.map((b) => ({ nome: b.nome, cor: b.cor, v: b.valores[ativo] ?? 0 })), ...(linha ? [{ nome: linha.nome, cor: linha.cor, v: linha.valores[ativo] ?? 0 }] : [])],
  };
  const alinhamento = ativo === null ? 0 : cx(ativo) > largura - 120 ? '-100%' : cx(ativo) < 120 ? '0%' : '-50%';

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
              {ativo !== null && <rect x={ML + passo * ativo} y={MT} width={passo} height={ph} className="coluna-ativa" />}
              {rotulos.map((r, i) => {
                let pos = 0, neg = 0;
                return (
                  <g key={r}>
                    {barras.map((b) => {
                      const v = b.valores[i] ?? 0;
                      if (v === 0) return null;
                      const de = v > 0 ? pos : neg;
                      const ate = de + v;
                      if (v > 0) pos = ate; else neg = ate;
                      const topo = Math.min(y(de), y(ate));
                      return <rect key={b.nome} x={cx(i) - larguraBarra / 2} y={topo} width={larguraBarra} height={Math.max(Math.abs(y(de) - y(ate)), 1)} rx={3} style={{ fill: unica && v < 0 ? corNegativa : b.cor }} />;
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
              <rect x={ML} y={MT} width={pw} height={ph} fill="transparent" onPointerMove={mover} onPointerDown={mover} onPointerLeave={() => setAtivo(null)} />
            </svg>
          )}
          {dica && (
            <div className="grafico-dica" style={{ left: cx(ativo ?? 0), transform: `translateX(${alinhamento})` }} role="status">
              <b>{dica.rotulo}</b>
              {dica.linhas.map((l) => (
                <div key={l.nome}><i style={{ background: l.cor }} />{l.nome}<span>{brl(l.v)}</span></div>
              ))}
            </div>
          )}
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
  const total = fatias.reduce((a, f) => a + f.valor, 0);
  if (!(total > 0)) return <div className="grafico-vazio" style={{ height: 180 }}>Sem gastos neste mês.</div>;

  const tamanho = 190, r = 70, espessura = 28, C = 2 * Math.PI * r, meio = tamanho / 2;
  const comprimentos = fatias.map((f) => (f.valor / total) * C);
  const inicios = comprimentos.map((_, i) => comprimentos.slice(0, i).reduce((a, b) => a + b, 0));

  return (
    <div className="rosca">
      <svg width={tamanho} height={tamanho} role="img" aria-label={titulo} viewBox={`0 0 ${tamanho} ${tamanho}`}>
        {fatias.map((f, i) => (
          <circle key={f.nome} cx={meio} cy={meio} r={r} fill="none" strokeWidth={espessura} transform={`rotate(-90 ${meio} ${meio})`}
            strokeDasharray={`${Math.max(comprimentos[i] - 1.5, 0.5)} ${C}`} strokeDashoffset={-inicios[i]} style={{ stroke: f.cor }} />
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
    </div>
  );
}
