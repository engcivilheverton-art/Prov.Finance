'use client';

import { useState } from 'react';
import { diasNoMes, resumoCalendario, type Compra } from '@/lib/analises';
import { MESES } from '@/lib/datas';
import { abreviar } from '@/lib/escala';
import { brl } from '@/lib/formato';

const SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const SEMANA_LONGA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

type Props = { ym: string; compras: Compra[]; hojeYm: string; hojeDia: number };

/** Calendário do mês com o total gasto em cada dia (pela data real da compra). Use `key={ym}` para reiniciar a seleção ao trocar de mês. */
export function CalendarioGastos({ ym, compras, hojeYm, hojeDia }: Props) {
  const [sel, setSel] = useState<number | null>(null);
  const resumo = resumoCalendario(compras, ym, hojeYm, hojeDia);
  const [ano, mes] = ym.split('-').map(Number);
  const primeiro = new Date(ano, mes - 1, 1).getDay();
  const dias = diasNoMes(ym);
  const maximo = Math.max(0, ...Object.values(resumo.porDia).map((d) => d.total));
  const detalhe = sel ? resumo.porDia[sel] : undefined;
  const nomeMes = MESES[mes - 1].toLowerCase();

  return (
    <div>
      <div className="kpis" style={{ marginBottom: '1rem' }}>
        <div className="k"><small>Gasto no mês</small><b>{brl(resumo.total)}</b></div>
        <div className="k"><small>Média por dia{ym === hojeYm ? ' (até hoje)' : ''}</small><b>{brl(resumo.mediaPorDia)}</b></div>
        <div className="k"><small>Dia mais caro</small><b>{resumo.maior ? `${resumo.maior.dia} · ${brl(resumo.maior.total)}` : '—'}</b></div>
      </div>

      <div className="cal-grade" role="group" aria-label={`Gastos por dia em ${nomeMes} de ${ano}`}>
        {SEMANA.map((d, i) => <div key={i} className="cal-sem" aria-hidden title={SEMANA_LONGA[i]}>{d}</div>)}
        {Array.from({ length: primeiro }, (_, i) => <div key={`v${i}`} className="cal-vazio" aria-hidden />)}
        {Array.from({ length: dias }, (_, i) => {
          const dia = i + 1;
          const info = resumo.porDia[dia];
          const peso = info && maximo > 0 ? 12 + 48 * (info.total / maximo) : 0;
          const rotulo = info
            ? `${dia} de ${nomeMes}: ${brl(info.total)} em ${info.compras.length} lançamento${info.compras.length > 1 ? 's' : ''}`
            : `${dia} de ${nomeMes}: sem gastos`;
          return (
            <button key={dia} type="button" aria-label={rotulo} aria-pressed={sel === dia}
              className={`cal-dia${ym === hojeYm && dia === hojeDia ? ' hoje' : ''}${sel === dia ? ' sel' : ''}`}
              style={peso ? { background: `color-mix(in srgb, var(--ch-cartoes) ${peso}%, var(--card))` } : undefined}
              onClick={() => setSel(sel === dia ? null : dia)}>
              <span className="cal-n">{dia}</span>
              {info && <span className="cal-v">{abreviar(info.total)}</span>}
            </button>
          );
        })}
      </div>
      <p className="suave pequeno" style={{ marginTop: '.6rem' }}>Quanto mais escuro o dia, maior o gasto. Valores em reais, arredondados. Toque em um dia para ver os lançamentos.</p>

      {detalhe && (
        <div className="card card-corpo" style={{ marginTop: '1rem' }} role="status">
          <h2 style={{ marginBottom: '.5rem' }}>{sel} de {nomeMes} · {brl(detalhe.total)}</h2>
          <div className="lista">
            {detalhe.compras.map((c) => (
              <div key={c.id} className="linha">
                <div className="grow">
                  <div className="titulo">{c.descricao}{c.parcela && <span className="selo selo-azul" style={{ marginLeft: '.4rem' }}>{c.parcela}</span>}</div>
                  <div className="pequeno suave">{c.cartaoNome}</div>
                </div>
                <span className="num">{brl(c.valor)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {sel && !detalhe && <p className="suave" style={{ marginTop: '1rem' }} role="status">Sem gastos em {sel} de {nomeMes}.</p>}
      {resumo.diasComGasto === 0 && <p className="aviso aviso-info" style={{ marginTop: '1rem' }}>Nenhum lançamento com data neste mês. O calendário usa os lançamentos importados por CSV.</p>}
    </div>
  );
}
