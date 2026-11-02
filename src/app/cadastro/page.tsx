import { redirect } from 'next/navigation';

export default async function CadastroPage({ searchParams }: { searchParams: Promise<{ plano?: string }> }) {
  const { plano } = await searchParams;
  const query = new URLSearchParams({ modo: 'cadastro' });
  if (plano === 'mensal' || plano === 'anual') query.set('plano', plano);
  redirect(`/login?${query.toString()}`);
}
