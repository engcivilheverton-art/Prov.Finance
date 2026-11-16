import { NextResponse } from 'next/server';
import { exportarDadosDoUsuario } from '@/lib/privacy-server';
import { verifyFirebaseIdToken } from '@/lib/server-billing';

export const maxDuration = 60;

export async function GET(request: Request) {
  const authorization = request.headers.get('authorization') ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return NextResponse.json({ error: 'Entre na sua conta para baixar os dados.' }, { status: 401 });

  let user;
  try { user = await verifyFirebaseIdToken(token); }
  catch { return NextResponse.json({ error: 'Sua sessão expirou. Entre novamente.' }, { status: 401 }); }

  try {
    const dados = await exportarDadosDoUsuario(user.uid);
    const arquivo = JSON.stringify({
      exportadoEm: new Date().toISOString(),
      conta: { uid: user.uid, email: user.email ?? null, nome: user.name ?? null },
      dadosDoAplicativo: dados,
    }, null, 2);
    const hoje = new Date().toISOString().slice(0, 10);
    return new Response(arquivo, {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="prov-dados-${hoje}.json"`,
        'cache-control': 'private, no-store, max-age=0',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Privacy data export failed', { errorName: error instanceof Error ? error.name : 'unknown' });
    return NextResponse.json({ error: 'Não foi possível preparar o arquivo agora. Tente novamente.' }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
}
