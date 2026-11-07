'use client';

import { useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { canAddResource, canUseFeature, FREE_LIMITS, type LimitedResource } from '@/lib/planos';
import { useAssinatura } from '@/lib/use-assinatura';

export class PlanLimitClientError extends Error {
  readonly code: string;
  constructor(message: string, code: string) { super(message); this.name = 'PlanLimitClientError'; this.code = code; }
}

/** One client API for limits; the API route independently repeats every decision. */
export function usePlanLimits() {
  const { user } = useAuth();
  const assinatura = useAssinatura();
  const canAdd = useCallback((resource: LimitedResource, currentCount: number) => (
    !assinatura.carregando && canAddResource(resource, currentCount, assinatura.premium)
  ), [assinatura.carregando, assinatura.premium]);

  const create = useCallback(async <T extends object>(resource: LimitedResource, fields: T) => {
    if (!user) throw new PlanLimitClientError('Faça login para continuar.', 'UNAUTHENTICATED');
    const token = await user.getIdToken();
    const response = await fetch(`/api/plan-limits/${resource}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ fields }),
    });
    const data = await response.json().catch(() => ({})) as { id?: string; code?: string; error?: string };
    if (!response.ok || !data.id) throw new PlanLimitClientError(data.error ?? 'Não foi possível salvar.', data.code ?? 'REQUEST_FAILED');
    return data.id;
  }, [user]);

  const canUseCsvImport = !assinatura.carregando && canUseFeature('csvImport', assinatura.premium);
  return { ...assinatura, canAdd, canUseCsvImport, dashboardChartLimit: FREE_LIMITS.dashboardCharts, create };
}
