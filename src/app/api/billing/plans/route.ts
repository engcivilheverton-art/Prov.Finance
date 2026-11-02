import { NextResponse } from 'next/server';
import { PLANOS, RECURSOS } from '@/lib/planos';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    plans: {
      mensal: { ...PLANOS.mensal, monthlyPrice: PLANOS.mensal.valor, chargedTotal: PLANOS.mensal.valor },
      anual: { ...PLANOS.anual, monthlyPrice: Math.round((PLANOS.anual.valor / 12) * 100) / 100, chargedTotal: PLANOS.anual.valor },
    },
    features: RECURSOS,
  }, { headers: { 'cache-control': 'no-store' } });
}
