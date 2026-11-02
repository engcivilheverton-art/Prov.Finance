'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useAssinatura } from '@/lib/use-assinatura';

export default function RetornoAssinaturaPage() {
  const { user, loading } = useAuth();
  const assinatura = useAssinatura();
  const atualizarAssinatura = assinatura.atualizar;
  const [checando, setChecando] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => { setChecando(false); void atualizarAssinatura(); }, 1800);
    return () => window.clearTimeout(timer);
  }, [atualizarAssinatura]);

  if (loading || assinatura.carregando || checando) return <main className="login-pagina"><div className="card login-card"><h1>Conferindo sua assinatura</h1><p>Estamos consultando o status confirmado pelo Mercado Pago. Não feche esta página.</p></div></main>;
  return <main className="login-pagina"><div className="card login-card"><h1>{assinatura.premium ? 'Premium confirmado!' : 'Estamos processando sua assinatura'}</h1><p>{assinatura.premium ? 'Seu acesso Premium está ativo.' : 'O pagamento ainda não foi confirmado. Seu acesso continua no plano gratuito; você pode voltar ao painel e consultar novamente em instantes.'}</p>{assinatura.erro && <div className="aviso aviso-alerta">{assinatura.erro}</div>}<div className="pilha"><Link className="btn" href={user ? '/dashboard' : '/login'}>Ir para o PROV.</Link><button className="btn btn-sec" type="button" onClick={() => void assinatura.atualizar()}>Consultar novamente</button></div></div></main>;
}
