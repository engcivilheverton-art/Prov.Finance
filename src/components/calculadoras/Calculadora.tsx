'use client';

import { useState, type FormEvent } from 'react';
import { calcular, formatarLinha, resultadoEmTexto, type FerramentaCalculadora, type ResultadoCalculadora } from '@/lib/calculadoras';
import styles from './Calculadora.module.css';

type Campo = { name: string; label: string; type?: 'text' | 'number' | 'select' | 'checkbox'; inputMode?: 'text' | 'decimal' | 'numeric'; placeholder?: string; min?: number; max?: number; step?: string; options?: [string, string][] };
const campos: Record<string, Campo[]> = {
  'horas-extras': [
    { name: 'salario', label: 'Salário mensal bruto', type: 'text', inputMode: 'decimal', placeholder: 'Ex.: 3.000,00' },
    { name: 'jornada', label: 'Jornada diária (horas)', type: 'number', min: 1, max: 12 },
    { name: 'qtd', label: 'Quantidade de horas extras', type: 'number', step: '0.01' },
    { name: 'pct', label: 'Adicional', type: 'select', options: [['50', '50%'], ['100', '100%'], ['custom', 'Personalizado']] },
    { name: 'pctCustom', label: 'Percentual personalizado', type: 'number', min: 1, max: 300 },
  ],
  'banco-de-horas': [
    { name: 'trabalhadas', label: 'Horas trabalhadas', placeholder: 'hh:mm (ex.: 10:30)' },
    { name: 'devidas', label: 'Horas devidas', placeholder: 'hh:mm (ex.: 08:00)' },
  ],
  ferias: [
    { name: 'salario', label: 'Salário mensal bruto', type: 'text', inputMode: 'decimal', placeholder: 'Ex.: 3.000,00' },
    { name: 'dias', label: 'Dias de férias', type: 'number', min: 1, max: 30 },
    { name: 'abono', label: 'Vender até 10 dias (abono pecuniário)', type: 'checkbox' },
  ],
  'decimo-terceiro': [
    { name: 'salario', label: 'Salário mensal bruto', type: 'text', inputMode: 'decimal', placeholder: 'Ex.: 3.000,00' },
    { name: 'meses', label: 'Meses trabalhados no ano', type: 'number', min: 1, max: 12 },
  ],
  rescisao: [
    { name: 'salario', label: 'Salário mensal bruto', type: 'text', inputMode: 'decimal', placeholder: 'Ex.: 3.000,00' },
    { name: 'anos', label: 'Anos completos na empresa', type: 'number', min: 0 },
    { name: 'tipo', label: 'Tipo de desligamento', type: 'select', options: [['sem-justa-causa', 'Demissão sem justa causa'], ['pedido', 'Pedido de demissão'], ['justa-causa', 'Demissão por justa causa'], ['acordo', 'Acordo entre as partes']] },
    { name: 'dias', label: 'Dias trabalhados no mês da saída', type: 'number', min: 0, max: 30 },
    { name: 'mesesNoAno', label: 'Meses trabalhados no ano', type: 'number', min: 1, max: 12 },
  ],
  inss: [{ name: 'salario', label: 'Salário mensal bruto', type: 'text', inputMode: 'decimal', placeholder: 'Ex.: 3.000,00' }],
  irrf: [
    { name: 'salario', label: 'Salário mensal bruto', type: 'text', inputMode: 'decimal', placeholder: 'Ex.: 3.000,00' },
    { name: 'dependentes', label: 'Número de dependentes', type: 'number', min: 0 },
  ],
  'conversor-de-horas': [
    { name: 'tipo', label: 'Conversão', type: 'select', options: [['h2m', 'Horas para minutos'], ['m2h', 'Minutos para horas'], ['dec2hm', 'Horas decimais para hh:mm'], ['hm2dec', 'hh:mm para horas decimais']] },
    { name: 'valor', label: 'Valor', placeholder: 'Ex.: 1,5 ou 01:30' },
  ],
};
const valoresIniciais: Record<string, Record<string, string | boolean>> = {
  'horas-extras': { salario: '', jornada: '8', qtd: '10', pct: '50', pctCustom: '50' },
  'banco-de-horas': { trabalhadas: '', devidas: '' },
  ferias: { salario: '', dias: '30', abono: false },
  'decimo-terceiro': { salario: '', meses: '12' },
  rescisao: { salario: '', anos: '1', tipo: 'sem-justa-causa', dias: '30', mesesNoAno: '12' },
  inss: { salario: '' },
  irrf: { salario: '', dependentes: '0' },
  'conversor-de-horas': { tipo: 'h2m', valor: '' },
};

export default function Calculadora({ ferramenta }: { ferramenta: FerramentaCalculadora }) {
  const [values, setValues] = useState<Record<string, string | boolean>>(() => ({ ...valoresIniciais[ferramenta.slug] }));
  const [result, setResult] = useState<ResultadoCalculadora | null>(null);
  const [copiado, setCopiado] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(calcular(ferramenta.slug, values));
  }

  async function copiar() {
    if (!result) return;
    await navigator.clipboard.writeText(resultadoEmTexto(result));
    setCopiado(true);
    window.setTimeout(() => setCopiado(false), 1800);
  }

  return (
    <section className={styles.grid} aria-label={ferramenta.title}>
      <form className={`${styles.card} card`} onSubmit={onSubmit}>
        <div className="card-cab"><h2>Informe os dados</h2></div>
        <div className={`${styles.fields} card-corpo`}>
          {campos[ferramenta.slug].map((field) => (
            <div className={field.type === 'checkbox' ? styles.checkField : 'campo'} key={field.name}>
              {field.type === 'checkbox' ? (
                <label className={styles.checkLabel}><input type="checkbox" checked={Boolean(values[field.name])} onChange={(e) => setValues((old) => ({ ...old, [field.name]: e.target.checked }))} />{field.label}</label>
              ) : <>
                <label htmlFor={`${ferramenta.slug}-${field.name}`}>{field.label}</label>
                {field.type === 'select' ? (
                  <select id={`${ferramenta.slug}-${field.name}`} value={String(values[field.name] ?? '')} onChange={(e) => setValues((old) => ({ ...old, [field.name]: e.target.value }))}>
                    {field.options?.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                ) : (
                  <input id={`${ferramenta.slug}-${field.name}`} type={field.type ?? 'text'} inputMode={field.inputMode ?? (field.type === 'number' ? 'decimal' : 'text')} min={field.type === 'number' ? field.min : undefined} max={field.type === 'number' ? field.max : undefined} step={field.type === 'number' ? field.step : undefined} placeholder={field.placeholder} value={String(values[field.name] ?? '')} required onChange={(e) => setValues((old) => ({ ...old, [field.name]: e.target.value }))} />
                )}
              </>}
            </div>
          ))}
          <button className="btn" type="submit">Calcular</button>
        </div>
      </form>
      <div className={`${styles.card} card`} aria-live="polite">
        <div className="card-cab"><h2>Resultado</h2></div>
        <div className={`${styles.result} card-corpo`}>
          {!result && <p className="suave">Preencha os campos e toque em <strong>Calcular</strong> para ver a estimativa.</p>}
          {result && !result.ok && <div className="aviso aviso-erro" role="alert">{result.error}</div>}
          {result?.ok && <>
            <h3>{result.title}</h3>
            <dl className={styles.rows}>
              {result.rows.map((row) => <div key={row.label}><dt>{row.label}</dt><dd className={row.tone === 'red' ? 'neg' : row.tone === 'green' ? 'pos' : ''}>{formatarLinha(row)}</dd></div>)}
              {result.total && <div className={styles.total}><dt>{result.total.label}</dt><dd>{formatarLinha(result.total)}</dd></div>}
            </dl>
            {result.notes?.length > 0 && <ul className={styles.notes}>{result.notes.map((note) => <li key={note}>{note}</li>)}</ul>}
            <div className={styles.actions}><button className="btn btn-sec btn-mini" type="button" onClick={() => void copiar()}>{copiado ? 'Copiado!' : 'Copiar resultado'}</button></div>
          </>}
        </div>
      </div>
    </section>
  );
}
