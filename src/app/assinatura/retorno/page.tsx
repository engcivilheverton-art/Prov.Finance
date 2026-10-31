'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';

type Assinatura = { status?: string; plano?: string };

export default function RetornoAssinaturaPage() {
  const { user, loading } = useAuth();
  const [assinatura, setAssinatura] = useState<Assinatura | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      doc(db, 'users', user.uid, 'assinatura', 'status'),
      (snapshot) => { setAssinatura(snapshot.exists() ? snapshot.data() as Assinatura : null); setErro(false); },
      () => setErro(true),
    );
  }, [user]);

  if (loading) return <main className="login-pagina"><p>Carregando…</p></main>;
  if (!user) return <main className="login-pagina"><section className="card login-card"><h1>Entre na sua conta</h1><p>Faça login para consultar sua assinatura.</p><Link className="btn" href="/login">Ir para o login</Link></section></main>;

  const ativa = assinatura?.status === 'authorized';
  const titulo = ativa ? 'Assinatura confirmada' : assinatura?.status === 'paused' || assinatura?.status === 'cancelled'
    ? 'Assinatura não está ativa' : 'Aguardando confirmação do pagamento';

  return (
    <main className="login-pagina">
      <section className="card login-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="login-logo" src="/logo-prov.png" alt="PROV" />
        <h1 style={{ textAlign: 'center' }}>{titulo}</h1>
        {ativa ? (
          <><p style={{ textAlign: 'center' }}>Seu plano {assinatura?.plano ?? ''} foi autorizado pelo Mercado Pago.</p><Link className="btn" href="/dashboard">Abrir o PROV</Link></>
        ) : (
          <>
            <p style={{ textAlign: 'center' }}>O Mercado Pago pode levar alguns instantes para confirmar. Esta página atualiza automaticamente.</p>
            {erro && <div className="aviso aviso-erro">Não foi possível consultar o status agora. Atualize a página em instantes.</div>}
            <Link className="btn" href={`/login?plano=${assinatura?.plano === 'anual' ? 'anual' : 'mensal'}&modo=criar`}>Voltar ao checkout</Link>
            <Link className="btn-link" href="/dashboard">Continuar para o app</Link>
          </>
        )}
      </section>
    </main>
  );
}
