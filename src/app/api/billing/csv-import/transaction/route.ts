import { NextResponse } from 'next/server';
import { aplicarAcaoLancamentoCsv, CsvTransactionActionError, verifyFirebaseIdToken } from '@/lib/server-billing';

const ACTIONS = new Set(['ignorar', 'pagamento', 'despesa']);

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization') ?? '';
  const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!idToken) return NextResponse.json({ error: 'Faça login para continuar.' }, { status: 401 });
  let user;
  try { user = await verifyFirebaseIdToken(idToken); }
  catch { return NextResponse.json({ error: 'Sua sessão expirou. Entre novamente.' }, { status: 401 }); }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (typeof body.cartaoId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(body.cartaoId)
    || typeof body.ym !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(body.ym)
    || typeof body.itemId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(body.itemId)
    || typeof body.acao !== 'string' || !ACTIONS.has(body.acao)) {
    return NextResponse.json({ error: 'Dados inválidos para editar o lançamento.' }, { status: 400 });
  }
  try {
    const result = await aplicarAcaoLancamentoCsv(user.uid, body.cartaoId, body.ym, body.itemId, body.acao as 'ignorar' | 'pagamento' | 'despesa');
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CsvTransactionActionError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('CSV transaction action failed', { uid: user.uid, errorName: error instanceof Error ? error.name : 'unknown' });
    return NextResponse.json({ error: 'Não foi possível atualizar o lançamento.' }, { status: 503 });
  }
}
