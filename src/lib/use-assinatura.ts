'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';

type StatusAssinatura = { tier: 'free' | 'premium'; status: string; plan: 'mensal' | 'anual' | null };

export function useAssinatura() {
  const { user } = useAuth();
  const [assinatura, setAssinatura] = useState<StatusAssinatura>({ tier: 'free', status: 'free', plan: null });
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const atualizar = useCallback(async () => {
    if (!user) {
      setAssinatura({ tier: 'free', status: 'free', plan: null });
      setCarregando(false);
      return;
    }
    setCarregando(true);
    setErro('');
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/billing/status', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (!response.ok) throw new Error('Não foi possível validar sua assinatura. O acesso Premium permanece bloqueado até a confirmação.');
      const data = await response.json() as StatusAssinatura;
      setAssinatura(data);
    } catch (e) {
      setAssinatura({ tier: 'free', status: 'unavailable', plan: null });
      setErro(e instanceof Error ? e.message : 'Não foi possível consultar a assinatura.');
    } finally {
      setCarregando(false);
    }
  }, [user]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void atualizar(); }, 0);
    return () => window.clearTimeout(timer);
  }, [atualizar]);
  return { ...assinatura, premium: assinatura.tier === 'premium', carregando, erro, atualizar };
}
