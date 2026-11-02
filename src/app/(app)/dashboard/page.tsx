'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useAssinatura } from '@/lib/use-assinatura';
import { carregarPerfil, MESES, mesesNoPeriodo } from '@/lib/perfil';
import type { Perfil } from '@/types/finance';

export default function DashboardPage() {
  const { user } = useAuth();
  const assinatura = useAssinatura();
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    if (!user) return;
    carregarPerfil(user.uid)
      .then(setPerfil)
      .finally(() => setPronto(true));
  }, [user]);

  const nome = perfil?.nome || user?.displayName || '';

  return (
    <>
      <div className="pagina-cab">
        <div><div className="sub">Visão geral</div><h1>{nome ? `Olá, ${nome.split(' ')[0]}` : 'Painel financeiro'}</h1></div>
      </div>

      {pronto && !perfil && (
        <div className="aviso aviso-info" style={{ marginBottom: '1rem' }}>
          Complete seu <Link href="/perfil">perfil</Link> para definir o período dos gráficos.
        </div>
      )}

      <div className="card">
        <div className="card-cab"><h2>Período dos gráficos</h2></div>
        <div className="card-corpo">
          {perfil ? (
            <p>
              {MESES[perfil.mesIni - 1]}/{perfil.anoIni} a {MESES[perfil.mesFim - 1]}/{perfil.anoFim} ·{' '}
              {mesesNoPeriodo(perfil)} meses
            </p>
          ) : (
            <p style={{ color: 'var(--suave)' }}>Ainda não definido.</p>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <div className="card-cab"><h2>{assinatura.premium ? 'Seu plano Premium' : 'Conheça o PROV. Premium'}</h2></div>
        <div className="card-corpo">
          {assinatura.premium ? (
            <><p>Seu Premium está ativo. A importação de faturas por CSV está disponível.</p><p className="suave pequeno">Os gráficos e as análises completas fazem parte do escopo Premium e ainda estão em desenvolvimento neste projeto.</p></>
          ) : (
            <><p>Continue usando cartões, faturas, rendas, dívidas e contas fixas gratuitamente.</p><ul><li>Importação de faturas por CSV</li><li>Gráficos e análises financeiras completas, quando disponibilizados</li></ul><Link className="btn" href="/planos" style={{ display: 'inline-flex', textDecoration: 'none', marginTop: '.5rem' }}>Ver planos Premium</Link></>
          )}
          {assinatura.erro && <p className="aviso aviso-alerta" role="status">{assinatura.erro}</p>}
        </div>
      </div>
    </>
  );
}
