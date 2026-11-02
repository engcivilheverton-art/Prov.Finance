import { Suspense } from 'react';
import LoginForm from './LoginForm';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ modo?: string; plano?: string }> }) {
  const params = await searchParams;
  const initialMode = params.modo === 'cadastro' ? 'criar' : 'entrar';
  return <Suspense fallback={<p style={{ padding: '2rem' }}>Carregando…</p>}><LoginForm initialMode={initialMode} plan={params.plano ?? ''} /></Suspense>;
}
