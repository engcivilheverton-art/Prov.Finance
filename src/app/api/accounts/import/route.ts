import { NextResponse } from 'next/server';
import { confirmarAcessoPremium, getFirestoreDocument, listFirestoreCollection, commitFirestoreDocuments, verifyFirebaseIdToken } from '@/lib/server-billing';
import { canUseFeature } from '@/lib/planos';

type ItemImportado = {
  id: string; chaveDuplicidade: string; data: string; descricao: string; valor: number;
  tipo: 'entrada' | 'saida' | 'transferencia' | 'pagamento_fatura';
  direcao?: 'entrada' | 'saida'; categoriaId?: string; ignorada?: boolean;
};
const TIPOS = new Set(['entrada', 'saida', 'transferencia', 'pagamento_fatura']);

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization') ?? '';
  const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!idToken) return NextResponse.json({ code: 'UNAUTHENTICATED', error: 'Faça login para continuar.' }, { status: 401 });
  let user;
  try { user = await verifyFirebaseIdToken(idToken); }
  catch { return NextResponse.json({ code: 'UNAUTHENTICATED', error: 'Sua sessão expirou. Entre novamente.' }, { status: 401 }); }

  try {
    let premium = false;
    try { premium = await confirmarAcessoPremium(user.uid, undefined, user); }
    catch (error) { console.warn('Premium validation unavailable for account import:', error instanceof Error ? error.message : 'unknown'); }
    if (!canUseFeature('csvImport', premium)) return NextResponse.json({ code: 'PREMIUM_REQUIRED', error: 'Importar extratos é exclusivo do plano Premium.' }, { status: 403 });

    const body = await request.json().catch(() => null) as { accountId?: unknown; importId?: unknown; format?: unknown; items?: unknown } | null;
    if (!body || typeof body.accountId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(body.accountId)
      || typeof body.importId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(body.importId)
      || (body.format !== 'csv' && body.format !== 'ofx')
      || !Array.isArray(body.items) || !body.items.length || body.items.length > 2000
      || JSON.stringify(body).length > 1_000_000) {
      return NextResponse.json({ code: 'INVALID_IMPORT', error: 'Os dados do extrato são inválidos ou excedem o limite de linhas.' }, { status: 400 });
    }
    const accountPath = 'users/' + user.uid + '/contas/' + body.accountId;
    if (!await getFirestoreDocument(accountPath)) return NextResponse.json({ code: 'ACCOUNT_NOT_FOUND', error: 'Conta não encontrada.' }, { status: 404 });

    const items: ItemImportado[] = [];
    for (const raw of body.items) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return NextResponse.json({ code: 'INVALID_ROW', error: 'Uma linha do extrato está inválida.' }, { status: 400 });
      const row = raw as Record<string, unknown>;
      if (typeof row.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(row.id)
        || typeof row.chaveDuplicidade !== 'string' || row.chaveDuplicidade.length > 128
        || typeof row.data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.data)
        || typeof row.descricao !== 'string' || !row.descricao.trim() || row.descricao.length > 300
        || typeof row.valor !== 'number' || !Number.isFinite(row.valor) || row.valor <= 0 || row.valor > 1_000_000_000
        || typeof row.tipo !== 'string' || !TIPOS.has(row.tipo)
        || (row.direcao !== undefined && row.direcao !== 'entrada' && row.direcao !== 'saida')
        || (row.categoriaId !== undefined && (typeof row.categoriaId !== 'string' || row.categoriaId.length > 64))
        || (row.ignorada !== undefined && typeof row.ignorada !== 'boolean')) {
        return NextResponse.json({ code: 'INVALID_ROW', error: 'Uma ou mais linhas têm dados inválidos.' }, { status: 400 });
      }
      items.push({
        id: row.id, chaveDuplicidade: row.chaveDuplicidade, data: row.data, descricao: row.descricao.trim(), valor: row.valor,
        tipo: row.tipo as ItemImportado['tipo'],
        ...(row.direcao ? { direcao: row.direcao as 'entrada' | 'saida' } : {}),
        ...(row.categoriaId ? { categoriaId: row.categoriaId as string } : {}),
        ...(row.ignorada ? { ignorada: true } : {}),
      });
    }
    const movementPath = accountPath + '/movimentacoes';
    const existing = await listFirestoreCollection(movementPath);
    const existingIds = new Set(existing.map((document) => document.id));
    const existingKeys = new Set(existing.flatMap((document) => typeof document.fields.chaveDuplicidade === 'string' ? [document.fields.chaveDuplicidade] : []));
    const knownIds = new Set<string>();
    const knownKeys = new Set<string>();
    const fresh = items.filter((item) => {
      if (existingIds.has(item.id) || existingKeys.has(item.chaveDuplicidade) || knownIds.has(item.id) || knownKeys.has(item.chaveDuplicidade)) return false;
      knownIds.add(item.id); knownKeys.add(item.chaveDuplicidade); return true;
    });
    await commitFirestoreDocuments(fresh.map((item) => ({
      path: movementPath + '/' + item.id,
      fields: { ...item, origem: body.format, importacaoId: body.importId },
      createOnly: true,
    })));
    return NextResponse.json({ importados: fresh.length, ignorados: items.length - fresh.length });
  } catch (error) {
    console.error('Bank statement import failed:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ code: 'IMPORT_FAILED', error: 'Não foi possível concluir a importação. Tente novamente.' }, { status: 503 });
  }
}
