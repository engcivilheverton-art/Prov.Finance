'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { PLANOS, RECURSOS } from '@/lib/planos';
import { useAssinatura } from '@/lib/use-assinatura';
import estilos from './planos.module.css';

const moeda = (valor: number) => valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function PlanosPage() {
  const assinatura = useAssinatura();
  const { user } = useAuth();
  const [cancelando, setCancelando] = useState(false);
  const [erro, setErro] = useState('');

  async function cancelar() {
    if (!user || !window.confirm('Confirma o cancelamento da assinatura no Mercado Pago?')) return;
    setCancelando(true);
    setErro('');
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/billing/cancel', {
        method: 'POST', headers: { authorization: `Bearer ${token}` },
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Não foi possível cancelar a assinatura.');
      await assinatura.atualizar();
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível cancelar a assinatura.');
    } finally {
      setCancelando(false);
    }
  }

  const podeCancelar = !assinatura.carregando && ['pending', 'authorized', 'paused'].includes(assinatura.status);
  return (
    <>
      <div className="pagina-cab"><div><div className="sub">Planos PROV.</div><h1>Escolha seu plano</h1></div></div>
      {assinatura.carregando ? <div className="aviso aviso-info" role="status" aria-busy="true" style={{ marginBottom: '1rem' }}>Verificando sua assinatura…</div> : assinatura.premium ? <div className="aviso aviso-ok" style={{ marginBottom: '1rem' }}>{assinatura.accessType === 'complimentary' ? 'Sua conta tem acesso Premium concedido gratuitamente.' : `Sua assinatura Premium está ativa (${assinatura.plan === 'anual' ? 'anual' : 'mensal'}).`}</div> : <div className="aviso aviso-info" style={{ marginBottom: '1rem' }}>Você está no plano gratuito. O Premium só é ativado após a confirmação da assinatura pelo Mercado Pago.</div>}
      <div className="grade-2">
        {Object.values(PLANOS).map((plano) => (
          <section className="card" key={plano.id}>
            <div className="card-cab"><h2>{plano.nome}</h2></div>
            <div className="card-corpo">
              <p style={{ fontSize: '1.8rem', fontWeight: 700, margin: '0 0 .3rem' }}>{moeda(plano.valor)}<span className="pequeno suave">/{plano.id === 'mensal' ? 'mês' : 'ano'}</span></p>
              <p className="suave">{plano.id === 'mensal' ? 'Cobrança recorrente mensal.' : 'Cobrança recorrente a cada 12 meses.'}</p>
              <ul className={estilos.recursos}>{RECURSOS.premium.map((recurso) => <li key={recurso}>{recurso}</li>)}</ul>
              {!assinatura.carregando && !assinatura.premium && <Link className="btn" href={`/cadastro?plano=${plano.id}`} style={{ display: 'inline-flex', textDecoration: 'none', marginTop: '.5rem' }}>Contratar {plano.nome}</Link>}
            </div>
          </section>
        ))}
      </div>
      {podeCancelar && <div className="card" style={{ marginTop: '1rem' }}><div className="card-corpo"><h2>Gerenciar assinatura</h2><p>O cancelamento será solicitado ao Mercado Pago e confirmado antes de remover o acesso Premium.</p><button className="btn btn-sec" type="button" onClick={() => void cancelar()} disabled={cancelando}>{cancelando ? 'Cancelando…' : 'Cancelar assinatura'}</button></div></div>}
      {erro && <p className="aviso aviso-erro" role="alert" style={{ marginTop: '1rem' }}>{erro}</p>}
      {assinatura.erro && <p className="aviso aviso-alerta" role="status" style={{ marginTop: '1rem' }}>{assinatura.erro}</p>}
    </>
  );
}
