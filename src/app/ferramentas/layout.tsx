import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';

export default function FerramentasLayout({ children }: { children: ReactNode }) {
  return <AppShell requireAuth={false}>{children}</AppShell>;
}
