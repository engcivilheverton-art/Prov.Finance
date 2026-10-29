'use client';

import { useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

const ITENS = [
  { href: '/perfil', rotulo: 'Meu Perfil', icone: '👤' },
  { href: '/dashboard', rotulo: 'Dashboard', icone: '⊞' },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, loading, sair } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading || !user) {
    return <p style={{ padding: '2rem', color: 'var(--texto-suave)' }}>Carregando…</p>;
  }

  return (
    <div className="app">
      <nav className="menu" aria-label="Principal">
        <div className="menu-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-prov.png" alt="PROV" />
          <small>PLANEJADOR FINANCEIRO</small>
        </div>
        <div className="menu-itens">
          {ITENS.map((i) => (
            <Link key={i.href} href={i.href} className="menu-item" aria-current={pathname === i.href ? 'page' : undefined}>
              <span aria-hidden>{i.icone}</span>
              {i.rotulo}
            </Link>
          ))}
        </div>
        <div className="menu-rodape">
          {user.displayName || user.email}
          <button type="button" className="btn" onClick={() => void sair()}>Sair</button>
        </div>
      </nav>

      <main className="conteudo">
        <div className="topo-mobile">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-prov.png" alt="PROV" />
          <button type="button" onClick={() => void sair()}>Sair</button>
        </div>
        {children}
      </main>
    </div>
  );
}
