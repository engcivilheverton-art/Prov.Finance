import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const batchCommit = vi.fn();
  const batchCreate = vi.fn();
  const batchSet = vi.fn();
  const docGet = vi.fn();
  const doc = vi.fn((path: string) => ({ path, get: () => docGet(path) }));
  const batch = vi.fn(() => ({ create: batchCreate, set: batchSet, commit: batchCommit }));
  const txGet = vi.fn();
  const txSet = vi.fn();
  const txCreate = vi.fn();
  const runTransaction = vi.fn((callback: (transaction: { get: typeof txGet; set: typeof txSet; create: typeof txCreate }) => unknown) => callback({ get: txGet, set: txSet, create: txCreate }));
  const resourceCreate = vi.fn();
  const resourceRef = { id: 'created-resource', create: resourceCreate };
  const collection = vi.fn((path: string) => ({ path, doc: () => resourceRef }));
  return { batchCommit, batchCreate, batchSet, doc, docGet, batch, txGet, txSet, txCreate, runTransaction, resourceCreate, resourceRef, collection };
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase-admin', () => ({
  adminAuth: vi.fn(),
  adminDb: () => ({ batch: mocks.batch, doc: mocks.doc, collection: mocks.collection, runTransaction: mocks.runTransaction }),
  FieldValue: { delete: vi.fn(), serverTimestamp: vi.fn() },
}));
vi.mock('@/lib/mercadopago-server', () => ({
  getLatestAuthorizedInvoice: vi.fn(), getPreapproval: vi.fn(), hasConfirmedLatestInvoice: vi.fn(), matchesPlan: vi.fn(),
}));

import { commitFirestoreDocuments, createLimitedResource, FreePlanLimitError } from '@/lib/server-billing';

describe('commitFirestoreDocuments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.batchCommit.mockResolvedValue(undefined);
    mocks.docGet.mockResolvedValue({ exists: false });
    mocks.resourceCreate.mockResolvedValue(undefined);
    mocks.txGet.mockImplementation(async (ref: { path: string }) => ref.path.includes('/planLocks/')
      ? { get: () => 0 }
      : { size: 0 });
  });

  it('grava documentos em batches abaixo do limite do Firestore', async () => {
    const writes = Array.from({ length: 401 }, (_, index) => ({
      path: `users/u/invoices/items/${index}`,
      fields: { valor: index },
      createOnly: true,
    }));

    await commitFirestoreDocuments(writes);

    expect(mocks.batch).toHaveBeenCalledTimes(2);
    expect(mocks.batchCreate).toHaveBeenCalledTimes(401);
    expect(mocks.batchCommit).toHaveBeenCalledTimes(2);
  });

  it('ignora de forma idempotente documentos criados por uma importação concorrente', async () => {
    mocks.batchCommit.mockRejectedValueOnce({ code: 6 }).mockResolvedValueOnce(undefined);
    mocks.docGet.mockImplementation(async (path: string) => ({ exists: path.endsWith('/exists') }));

    await commitFirestoreDocuments([
      { path: 'users/u/items/exists', fields: { valor: 1 }, createOnly: true },
      { path: 'users/u/items/new', fields: { valor: 2 }, createOnly: true },
    ]);

    expect(mocks.batchCommit).toHaveBeenCalledTimes(2);
    expect(mocks.batchCreate).toHaveBeenCalledTimes(3);
  });

  it('conta registros existentes na transação e serializa a criação Free', async () => {
    await createLimitedResource('ana', 'cards', { nome: 'Cartão' }, false);
    expect(mocks.collection).toHaveBeenCalledWith('users/ana/cartoes');
    expect(mocks.txSet).toHaveBeenCalledWith(expect.objectContaining({ path: 'users/ana/planLocks/cards' }), expect.objectContaining({ revision: 1 }));
    expect(mocks.txCreate).toHaveBeenCalledWith(mocks.resourceRef, { nome: 'Cartão' });
  });

  it('bloqueia Free ao encontrar dois cartões e deixa Premium sem limite Free', async () => {
    mocks.txGet.mockImplementation(async (ref: { path: string }) => ref.path.includes('/planLocks/')
      ? { get: () => 1 }
      : { size: 2 });
    await expect(createLimitedResource('ana', 'cards', { nome: 'Outro' }, false)).rejects.toBeInstanceOf(FreePlanLimitError);
    expect(mocks.txCreate).not.toHaveBeenCalled();

    await expect(createLimitedResource('ana', 'cards', { nome: 'Premium' }, true)).resolves.toBe('created-resource');
    expect(mocks.resourceCreate).toHaveBeenCalledWith({ nome: 'Premium' });
  });
});
