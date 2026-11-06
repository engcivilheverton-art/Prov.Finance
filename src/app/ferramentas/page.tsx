import type { Metadata } from 'next';
import Link from 'next/link';
import { ferramentas } from '@/lib/calculadoras';
import styles from './ferramentas.module.css';

export const metadata: Metadata = {
  title: 'Calculadoras financeiras | PROV.',
  description: 'Use calculadoras financeiras gratuitas para estimar horas extras, férias, 13º salário, rescisão, INSS e IRRF.',
  alternates: { canonical: '/ferramentas' },
};

export default function FerramentasPage() {
  return (
    <main className={styles.wrap}>
      <div className="pagina-cab"><div><div className="sub">PROV. · Ferramentas gratuitas</div><h1>Calculadoras financeiras</h1><p className="suave">Estimativas para ajudar você a entender seus direitos e organizar suas finanças.</p></div></div>
      <div className={styles.cards}>
        {ferramentas.map((tool) => <Link className={`${styles.tool} card`} href={`/ferramentas/${tool.slug}`} key={tool.slug}><span aria-hidden="true">{tool.slug === 'inss' ? '▣' : tool.slug === 'irrf' ? '▤' : tool.slug === 'ferias' ? '☀' : tool.slug === 'decimo-terceiro' ? '✦' : tool.slug === 'rescisao' ? '⇆' : tool.slug === 'banco-de-horas' ? '◷' : tool.slug === 'conversor-de-horas' ? '↻' : '◷'}</span><h2>{tool.title}</h2><p>{tool.hub}</p><b>Calcular →</b></Link>)}
      </div>
      <p className={styles.disclaimer}>Os resultados são estimativas educativas e não substituem orientação profissional ou consulta à legislação aplicável.</p>
    </main>
  );
}
