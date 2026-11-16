import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const userRef = { path: 'users/user-1' };
  const recursiveDelete = vi.fn().mockResolvedValue(undefined);
  const deleteUser = vi.fn().mockResolvedValue(undefined);
  const doc = vi.fn(() => userRef);
  return {
    adminAuth: vi.fn(() => ({ deleteUser })),
    adminDb: vi.fn(() => ({ doc, recursiveDelete })),
    deleteUser,
    exportarDadosDoUsuario: vi.fn(),
    getPreapproval: vi.fn(),
    matchesPlan: vi.fn(),
    mercadoPagoAccessToken: vi.fn(() => 'private-test-token'),
    readSubscription: vi.fn(),
    recursiveDelete,
    verifyFirebaseIdToken: vi.fn(),
    userRef,
  };
});

vi.mock('@/lib/firebase-admin', () => ({ adminAuth: mocks.adminAuth, adminDb: mocks.adminDb }));
vi.mock('@/lib/mercadopago-server', () => ({
  getPreapproval: mocks.getPreapproval,
  matchesPlan: mocks.matchesPlan,
  mercadoPagoAccessToken: mocks.mercadoPagoAccessToken,
}));
vi.mock('@/lib/server-billing', () => ({ readSubscription: mocks.readSubscription, verifyFirebaseIdToken: mocks.verifyFirebaseIdToken }));
vi.mock('@/lib/privacy-server', () => ({ exportarDadosDoUsuario: mocks.exportarDadosDoUsuario }));

import { POST as excluirConta } from '@/app/api/privacy/delete-account/route';
import { GET as exportarDados } from '@/app/api/privacy/export/route';

function requestExcluir(email = 'ana@example.com', token = 'firebase-token') {
  return new Request('https://prov.test/api/privacy/delete-account', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}`, 'content-type': 'application/json' } : { 'content-type': 'application/json' },
    body: JSON.stringify({ confirmEmail: email }),
  });
}

describe('rotas de privacidade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyFirebaseIdToken.mockResolvedValue({ uid: 'user-1', email: 'ana@example.com', authTime: Math.floor(Date.now() / 1000) });
    mocks.readSubscription.mockResolvedValue(null);
    mocks.exportarDadosDoUsuario.mockResolvedValue({ id: 'user-1', data: {}, colecoes: {} });
    mocks.getPreapproval.mockResolvedValue({ id: 'preapproval-1', external_reference: 'user-1', status: 'authorized' });
    mocks.matchesPlan.mockReturnValue(true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
  });

  afterEach(() => vi.unstubAllGlobals());

  it('não exporta dados sem autenticação e impede cache na cópia exportada', async () => {
    const semLogin = await exportarDados(new Request('https://prov.test/api/privacy/export'));
    expect(semLogin.status).toBe(401);
    expect(mocks.exportarDadosDoUsuario).not.toHaveBeenCalled();

    const response = await exportarDados(new Request('https://prov.test/api/privacy/export', { headers: { authorization: 'Bearer firebase-token' } }));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    await expect(response.json()).resolves.toMatchObject({ conta: { uid: 'user-1', email: 'ana@example.com' } });
    expect(mocks.exportarDadosDoUsuario).toHaveBeenCalledWith('user-1');
  });

  it('exige reautenticação recente e confirmação do e-mail antes de apagar', async () => {
    mocks.verifyFirebaseIdToken.mockResolvedValueOnce({ uid: 'user-1', email: 'ana@example.com', authTime: Math.floor(Date.now() / 1000) - 11 * 60 });
    const sessãoAntiga = await excluirConta(requestExcluir());
    expect(sessãoAntiga.status).toBe(401);
    await expect(sessãoAntiga.json()).resolves.toMatchObject({ code: 'RECENT_LOGIN_REQUIRED' });
    expect(mocks.readSubscription).not.toHaveBeenCalled();

    const emailDiferente = await excluirConta(requestExcluir('outra@example.com'));
    expect(emailDiferente.status).toBe(400);
    expect(mocks.adminDb).not.toHaveBeenCalled();
  });

  it('cancela e confirma a assinatura antes de excluir Firestore e Auth', async () => {
    mocks.readSubscription.mockResolvedValue({ preapprovalId: 'preapproval-1', plan: 'mensal' });
    mocks.getPreapproval.mockResolvedValueOnce({ id: 'preapproval-1', external_reference: 'user-1', status: 'authorized' })
      .mockResolvedValueOnce({ id: 'preapproval-1', external_reference: 'user-1', status: 'canceled' });

    const response = await excluirConta(requestExcluir());
    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith('https://api.mercadopago.com/preapproval/preapproval-1', expect.objectContaining({ method: 'PUT' }));
    expect(mocks.recursiveDelete).toHaveBeenCalledWith(mocks.userRef);
    expect(mocks.deleteUser).toHaveBeenCalledWith('user-1');
  });

  it('preserva os dados se o cancelamento da assinatura falhar', async () => {
    mocks.readSubscription.mockResolvedValue({ preapprovalId: 'preapproval-1', plan: 'mensal' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 502 })));

    const response = await excluirConta(requestExcluir());
    expect(response.status).toBe(502);
    expect(mocks.adminDb).not.toHaveBeenCalled();
    expect(mocks.adminAuth).not.toHaveBeenCalled();
  });
});
