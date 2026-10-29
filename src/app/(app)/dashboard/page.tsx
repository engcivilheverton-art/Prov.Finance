'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { carregarPerfil, MESES, mesesNoPeriodo } from '@/lib/perfil';
import type { Perfil } from '@/types/finance';

export default function DashboardPage() {
  const { user } = useAuth();
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
      <div className="rotulo">Visão geral</div>
      <h1 className="titulo">{nome ? `Olá, ${nome.split(' ')[0]}` : 'Painel financeiro'}</h1>

      {pronto && !perfil && (
        <div className="aviso aviso-info" style={{ marginBottom: '1rem' }}>
          Complete seu <Link href="/perfil">perfil</Link> para definir o período dos gráficos.
        </div>
      )}

      <div className="card">
        <div className="card-cab">Período dos gráficos</div>
        <div className="card-corpo">
          {perfil ? (
            <p>
              {MESES[perfil.mesIni - 1]}/{perfil.anoIni} a {MESES[perfil.mesFim - 1]}/{perfil.anoFim} ·{' '}
              {mesesNoPeriodo(perfil)} meses
            </p>
          ) : (
            <p style={{ color: 'var(--texto-suave)' }}>Ainda não definido.</p>
          )}
        </div>
      </div>

      <p style={{ marginTop: '1rem', color: 'var(--texto-suave)' }}>
        Cartões, dívidas, rendas, contas fixas, investimentos e os gráficos entram nas próximas etapas.
      </p>
    </>
  );
}
