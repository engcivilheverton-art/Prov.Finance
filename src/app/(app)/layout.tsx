import { Suspense, type ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<p style={{ padding: '2rem', color: 'var(--suave)' }}>Carregando…</p>}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
