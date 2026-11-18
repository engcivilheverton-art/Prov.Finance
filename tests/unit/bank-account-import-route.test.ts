import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifyFirebaseIdToken: vi.fn(),
  confirmarAcessoPremium: vi.fn(),
  getFirestoreDocument: vi.fn(),
  listFirestoreCollection: vi.fn(),
  commitFirestoreDocuments: vi.fn(),
}));

vi.mock('@/lib/server-billing', () => mocks);
import { POST } from '@/app/api/accounts/import/route';

function request(body: unknown) {
  return new Request('https://prov.test/api/accounts/import', {
    method: 'POST',
    headers: { authorization: 'Bearer valid', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const body = {
  accountId: 'account-1',
  importId: 'import-1',
  format: 'csv',
  items: [{
    id: 'f01a01', chaveDuplicidade: 'f01a01', tipo: 'saida',
    valor: 42.9, data: '2026-11-05', descricao: 'Farmácia',
  }],
};

describe('POST /api/accounts/import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyFirebaseIdToken.mockResolvedValue({ uid: 'user-1', email: 'user@example.com', emailVerified: true });
    mocks.confirmarAcessoPremium.mockResolvedValue(true);
    mocks.getFirestoreDocument.mockResolvedValue({ nome: 'Conta principal' });
    mocks.listFirestoreCollection.mockResolvedValue([]);
    mocks.commitFirestoreDocuments.mockResolvedValue(undefined);
  });

  it('exige Premium também no servidor', async () => {
    mocks.confirmarAcessoPremium.mockResolvedValue(false);
    const response = await POST(request(body));
    expect(response.status).toBe(403);
    expect(mocks.getFirestoreDocument).not.toHaveBeenCalled();
    expect(mocks.commitFirestoreDocuments).not.toHaveBeenCalled();
  });

  it('confirma conta e grava os lançamentos com Admin SDK', async () => {
    const response = await POST(request(body));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ importados: 1, ignorados: 0 });
    expect(mocks.getFirestoreDocument).toHaveBeenCalledWith('users/user-1/contas/account-1');
    expect(mocks.commitFirestoreDocuments).toHaveBeenCalledWith([expect.objectContaining({
      path: 'users/user-1/contas/account-1/movimentacoes/f01a01',
      createOnly: true,
      fields: expect.objectContaining({ tipo: 'saida', origem: 'csv', importacaoId: 'import-1' }),
    })]);
  });

  it('retorna 404 para conta inexistente e não grava dados', async () => {
    mocks.getFirestoreDocument.mockResolvedValue(null);
    const response = await POST(request(body));
    expect(response.status).toBe(404);
    expect(mocks.commitFirestoreDocuments).not.toHaveBeenCalled();
  });

  it('ignora duplicidades já persistidas no servidor', async () => {
    mocks.listFirestoreCollection.mockResolvedValue([{ id: 'f01a01', fields: { chaveDuplicidade: 'f01a01' } }]);
    const response = await POST(request(body));
    expect(await response.json()).toMatchObject({ importados: 0, ignorados: 1 });
    expect(mocks.commitFirestoreDocuments).toHaveBeenCalledWith([]);
  });

  it('confere e grava o vínculo opcional de pagamento com cartão e fatura', async () => {
    const paymentBody = { ...body, items: [{ ...body.items[0], tipo: 'pagamento_fatura', cartaoId: 'card-1', ymFatura: '2026-11' }] };
    const response = await POST(request(paymentBody));
    expect(response.status).toBe(200);
    expect(mocks.getFirestoreDocument).toHaveBeenCalledWith('users/user-1/cartoes/card-1');
    expect(mocks.commitFirestoreDocuments).toHaveBeenCalledWith([expect.objectContaining({
      fields: expect.objectContaining({ tipo: 'pagamento_fatura', cartaoId: 'card-1', ymFatura: '2026-11' }),
    })]);
  });

  it('rejeita valores e IDs inválidos antes de gravar', async () => {
    const invalid = { ...body, items: [{ ...body.items[0], valor: -1 }] };
    const response = await POST(request(invalid));
    expect(response.status).toBe(400);
    expect(mocks.commitFirestoreDocuments).not.toHaveBeenCalled();
  });
});
