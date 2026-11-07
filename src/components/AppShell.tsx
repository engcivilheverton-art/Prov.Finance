'use client';

import { useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Icone, type NomeIcone } from '@/components/Icone';
import { useAuth } from '@/lib/auth-context';

const ITENS: { href: string; rotulo: string; icone: NomeIcone }[] = [
  { href: '/dashboard', rotulo: 'Painel', icone: 'dash' },
  { href: '/cartoes', rotulo: 'Cartões', icone: 'card' },
  { href: '/dividas', rotulo: 'Dívidas', icone: 'cal' },
  { href: '/rendas', rotulo: 'Rendas', icone: 'swap' },
  { href: '/caixinhas', rotulo: 'Caixinhas', icone: 'box' },
  { href: '/fixas', rotulo: 'Fixas', icone: 'rep' },
  { href: '/ferramentas', rotulo: 'Facilities', icone: 'calc' },
  { href: '/perfil', rotulo: 'Perfil', icone: 'user' },
];

export function AppShell({ children, requireAuth = true }: { children: ReactNode; requireAuth?: boolean }) {
  const { user, loading, sair } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (requireAuth && !loading && !user) router.replace('/login');
  }, [loading, user, router, requireAuth]);

  if (requireAuth && (loading || !user)) {
    return <p style={{ padding: '2rem', color: 'var(--suave)' }}>Carregando…</p>;
  }

  return (
    <div className="app">
      <nav className="menu" aria-label="Principal">
        <div className="menu-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="logo" src="/logo-prov.png" alt="PROV" />
          <small>Planejador financeiro</small>
        </div>
        <div className="menu-itens">
          {ITENS.map((i) => (
            <Link key={i.href} href={i.href} className="menu-item" aria-current={pathname === i.href || pathname.startsWith(i.href + '/') ? 'page' : undefined}>
              <Icone nome={i.icone} />
              {i.rotulo}
            </Link>
          ))}
        </div>
        <div className="menu-itens"><Link href="/planos" className="menu-item" aria-current={pathname === '/planos' ? 'page' : undefined}>Planos e assinatura</Link></div>
        <div className="menu-rodape">
          {user ? <>
            {user.displayName || user.email}
            <button type="button" className="btn" onClick={() => void sair()}>Sair</button>
          </> : <Link className="btn" href="/login">Entrar na conta</Link>}
        </div>
      </nav>

      <main className="conteudo">
        <div className="conteudo-interior">
          <div className="topo-mobile">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="logo" src="/logo-prov.png" alt="PROV" />
            {user ? <button type="button" onClick={() => void sair()}>Sair</button> : <Link href="/login">Entrar</Link>}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
