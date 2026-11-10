import { NextResponse } from 'next/server';
import { confirmarAcessoPremium, createLimitedResource, FreePlanLimitError, verifyFirebaseIdToken } from '@/lib/server-billing';

const FIELDS = {
  cards: new Set(['nome', 'bandeira', 'diaVencimento', 'limite', 'corBase']),
  debts: new Set(['nome', 'credor', 'categoria', 'parcela', 'inicio', 'diaVencimento', 'parcelas']),
  bankAccounts: new Set(['nome', 'categoria', 'valor', 'dia']),
} as const;

function validFields(resource: keyof typeof FIELDS, value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const fields = value as Record<string, unknown>;
  const allowed = FIELDS[resource];
  return Object.keys(fields).length > 0 && Object.keys(fields).every((key) => allowed.has(key))
    && Object.values(fields).every((field) => field === null || ['string', 'number', 'boolean', 'object'].includes(typeof field));
}

export async function POST(request: Request, context: { params: Promise<{ resource: string }> }) {
  const authorization = request.headers.get('authorization') ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return NextResponse.json({ code: 'UNAUTHENTICATED', error: 'Faça login para continuar.' }, { status: 401 });

  let user;
  try { user = await verifyFirebaseIdToken(token); }
  catch { return NextResponse.json({ code: 'UNAUTHENTICATED', error: 'Sua sessão expirou. Entre novamente.' }, { status: 401 }); }

  const { resource } = await context.params;
  if (!Object.hasOwn(FIELDS, resource)) return NextResponse.json({ code: 'INVALID_RESOURCE', error: 'Recurso inválido.' }, { status: 400 });
  const key = resource as keyof typeof FIELDS;
  const body = await request.json().catch(() => null) as { fields?: unknown } | null;
  if (!validFields(key, body?.fields) || JSON.stringify(body.fields).length > 30_000) {
    return NextResponse.json({ code: 'INVALID_FIELDS', error: 'Os dados enviados são inválidos.' }, { status: 400 });
  }

  try {
    // If Mercado Pago is unavailable, treat the request conservatively as Free:
    // the server still enforces the Free quota and never grants Premium access.
    let premium = false;
    try {
      premium = await confirmarAcessoPremium(user.uid, undefined, user);
    } catch (error) {
      console.warn('Premium validation unavailable; applying Free limits:', error instanceof Error ? error.message : 'unknown');
    }
    const id = await createLimitedResource(user.uid, key, body.fields, premium);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    if (error instanceof FreePlanLimitError) {
      return NextResponse.json({ code: error.code, error: error.message }, { status: 403 });
    }
    console.error('Limited resource creation failed:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ code: 'PLAN_CHECK_UNAVAILABLE', error: 'Não foi possível confirmar o plano e salvar. Tente novamente.' }, { status: 503 });
  }
}
