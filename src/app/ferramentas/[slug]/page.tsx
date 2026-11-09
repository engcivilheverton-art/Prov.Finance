import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Calculadora from '@/components/calculadoras/Calculadora';
import { anoTabelas, ferramentas, obterFerramenta } from '@/lib/calculadoras';
import styles from './page.module.css';

const siteUrl = 'https://prov-financeiro.vercel.app';

export function generateStaticParams() {
  return ferramentas.map((tool) => ({ slug: tool.slug }));
}

export async function generateMetadata({ params }: PageProps<'/ferramentas/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  const tool = obterFerramenta(slug);
  if (!tool) return {};
  return {
    title: tool.metaTitle,
    description: tool.metaDescription,
    keywords: tool.keywords.split(',').map((keyword) => keyword.trim()),
    alternates: { canonical: `/ferramentas/${tool.slug}` },
    openGraph: { title: tool.metaTitle, description: tool.metaDescription, url: `${siteUrl}/ferramentas/${tool.slug}`, type: 'article', siteName: 'PROV.' },
  };
}

export default async function FerramentaPage({ params }: PageProps<'/ferramentas/[slug]'>) {
  const { slug } = await params;
  const tool = obterFerramenta(slug);
  if (!tool) notFound();
  const articlePath = path.join(process.cwd(), 'src', 'content', 'calculadoras', `${tool.slug}.html`);
  const article = await readFile(articlePath, 'utf8');
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'WebApplication', name: tool.h1, applicationCategory: 'FinanceApplication', operatingSystem: 'Any', isAccessibleForFree: true,
    description: tool.metaDescription, url: `${siteUrl}/ferramentas/${tool.slug}`,
  };

  return (
    <main className={styles.wrap}>
      <nav className={styles.breadcrumb} aria-label="Navegação estrutural"><Link href="/ferramentas">Ferramentas</Link><span aria-hidden="true">/</span><span>{tool.title}</span></nav>
      <header className="pagina-cab"><div><div className="sub">Calculadora gratuita · {anoTabelas}</div><h1>{tool.h1}</h1><p className="suave">{tool.subtitle}</p></div></header>
      <Calculadora ferramenta={tool} />
      <p className={styles.disclaimer}>Estimativa educativa com base nas regras e tabelas disponíveis para {anoTabelas}. O resultado não substitui orientação profissional, análise de convenção coletiva ou conferência com seu empregador.</p>
      <article className={styles.article} dangerouslySetInnerHTML={{ __html: article }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
    </main>
  );
}
