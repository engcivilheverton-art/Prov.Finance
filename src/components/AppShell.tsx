'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Icone, type NomeIcone } from '@/components/Icone';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useAuth } from '@/lib/auth-context';

const ITENS: { href: string; rotulo: string; icone: NomeIcone }[] = [
  { href: '/dashboard', rotulo: 'Painel', icone: 'dash' },
  { href: '/cartoes', rotulo: 'Cartões', icone: 'card' },
  { href: '/dividas', rotulo: 'Dívidas', icone: 'cal' },
  { href: '/rendas', rotulo: 'Rendas', icone: 'swap' },
  { href: '/caixinhas', rotulo: 'Caixinhas', icone: 'box' },
  { href: '/fixas', rotulo: 'Fixas', icone: 'rep' },
  { href: '/ferramentas', rotulo: 'Facilities', icone: 'calc' },
  { href: '/relatorios', rotulo: 'Relatórios', icone: 'report' },
  { href: '/suporte', rotulo: 'Suporte', icone: 'help' },
  { href: '/perfil', rotulo: 'Perfil', icone: 'user' },
];

export function AppShell({ children, requireAuth = true }: { children: ReactNode; requireAuth?: boolean }) {
  const { user, loading, sair } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [menuMobileExpandido, setMenuMobileExpandido] = useState(false);

  useEffect(() => {
    if (requireAuth && !loading && !user) router.replace('/login');
  }, [loading, user, router, requireAuth]);

  if (requireAuth && (loading || !user)) {
    return <p style={{ padding: '2rem', color: 'var(--suave)' }}>Carregando…</p>;
  }

  return (
    <div className={`app${menuMobileExpandido ? ' menu-mobile-expandido' : ''}`}>
      <nav className="menu" aria-label="Principal">
        <div className="menu-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="logo" src="/logo-prov.png" alt="PROV" />
          <small>Planejador financeiro</small>
        </div>
        <div className="menu-itens menu-itens-principais">
          {ITENS.map((i) => (
            <Link key={i.href} href={i.href} className="menu-item" title={i.rotulo} aria-label={i.rotulo} aria-current={pathname === i.href || pathname.startsWith(i.href + '/') ? 'page' : undefined} onClick={() => setMenuMobileExpandido(false)}>
              <Icone nome={i.icone} />
              <span className="menu-rotulo">{i.rotulo}</span>
            </Link>
          ))}
        </div>
        <div className="menu-itens menu-itens-planos">
          <Link href="/planos" className="menu-item" title="Planos e assinatura" aria-label="Planos e assinatura" aria-current={pathname === '/planos' ? 'page' : undefined} onClick={() => setMenuMobileExpandido(false)}>
            <span className="menu-icone-plano"><Icone nome="crown" /></span>
            <span className="menu-rotulo">Planos e assinatura</span>
          </Link>
        </div>
        <div className="menu-rodape">
          <ThemeToggle />
          {user ? <>
            {user.displayName || user.email}
            <button type="button" className="btn" onClick={() => void sair()}>Sair</button>
          </> : <Link className="btn" href="/login">Entrar na conta</Link>}
        </div>
      </nav>
      {menuMobileExpandido && <button type="button" className="menu-mobile-fundo" aria-label="Fechar menu" onClick={() => setMenuMobileExpandido(false)} />}

      <main className="conteudo">
        <div className="conteudo-interior">
          <div className="topo-mobile">
            <button type="button" className="menu-mobile-botao btn btn-sec btn-mini" aria-label={menuMobileExpandido ? 'Recolher menu' : 'Expandir menu'} aria-expanded={menuMobileExpandido} onClick={() => setMenuMobileExpandido((atual) => !atual)}>
              <Icone nome="menu" tamanho={20} />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="logo" src="/logo-prov.png" alt="PROV" />
            <div className="topo-mobile-acoes">
              <ThemeToggle />
              {user ? <button type="button" onClick={() => void sair()}>Sair</button> : <Link href="/login">Entrar</Link>}
            </div>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
