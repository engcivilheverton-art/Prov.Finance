import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class MercadoPagoTimeoutError extends Error {
    constructor(operation: string) { super(operation); this.name = 'MercadoPagoTimeoutError'; }
  }
  return {
    MercadoPagoTimeoutError,
    getLatestAuthorizedInvoice: vi.fn(),
    getPreapproval: vi.fn(),
    hasConfirmedLatestInvoice: vi.fn(),
    matchesPlan: vi.fn(),
    commitFirestoreDocuments: vi.fn(),
    getFirestoreDocument: vi.fn(),
    listFirestoreCollection: vi.fn(),
    readSubscription: vi.fn(),
    verifyFirebaseIdToken: vi.fn(),
    writeSubscription: vi.fn(),
  };
});

vi.mock('@/lib/mercadopago-server', () => ({
  MercadoPagoTimeoutError: mocks.MercadoPagoTimeoutError,
  getLatestAuthorizedInvoice: mocks.getLatestAuthorizedInvoice,
  getPreapproval: mocks.getPreapproval,
  hasConfirmedLatestInvoice: mocks.hasConfirmedLatestInvoice,
  matchesPlan: mocks.matchesPlan,
}));

vi.mock('@/lib/server-billing', () => ({
  commitFirestoreDocuments: mocks.commitFirestoreDocuments,
  getFirestoreDocument: mocks.getFirestoreDocument,
  listFirestoreCollection: mocks.listFirestoreCollection,
  readSubscription: mocks.readSubscription,
  verifyFirebaseIdToken: mocks.verifyFirebaseIdToken,
  writeSubscription: mocks.writeSubscription,
}));

import { POST } from '@/app/api/billing/csv-import/route';

const request = () => new Request('https://prov.test/api/billing/csv-import', {
  method: 'POST',
  headers: { authorization: 'Bearer firebase-test-token', 'content-type': 'application/json' },
  body: JSON.stringify({ cartaoId: 'card-1', ym: '2026-11', items: [{ data: '01/11', descricao: 'COMPRA', valor: 25 }] }),
});

describe('POST /api/billing/csv-import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.verifyFirebaseIdToken.mockResolvedValue({ uid: 'user-1' });
    mocks.readSubscription.mockResolvedValue({ status: 'authorized', plan: 'mensal', preapprovalId: 'preapproval-1' });
    mocks.getPreapproval.mockResolvedValue({ id: 'preapproval-1', external_reference: 'user-1', status: 'authorized' });
    mocks.matchesPlan.mockReturnValue(true);
    mocks.getLatestAuthorizedInvoice.mockResolvedValue({ id: 'invoice-1' });
    mocks.hasConfirmedLatestInvoice.mockReturnValue(true);
    mocks.getFirestoreDocument.mockResolvedValueOnce({ nome: 'Cartão' }).mockResolvedValueOnce(null);
    mocks.listFirestoreCollection.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { id: 'item-1', fields: { valor: 25, programado: false } },
    ]);
    mocks.commitFirestoreDocuments.mockResolvedValue(undefined);
    mocks.writeSubscription.mockResolvedValue(undefined);
  });

  it('grava os lançamentos e devolve o total', async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ novos: 1, ignorados: 0, total: 25 });
    expect(mocks.commitFirestoreDocuments).toHaveBeenCalledTimes(2);
  });

  it('responde 504 quando o Mercado Pago excede o limite e não deixa a requisição sem resposta', async () => {
    mocks.getPreapproval.mockRejectedValue(new mocks.MercadoPagoTimeoutError('preapproval'));

    const response = await POST(request());

    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining('Mercado Pago demorou') });
    expect(mocks.getFirestoreDocument).not.toHaveBeenCalled();
  });
});
