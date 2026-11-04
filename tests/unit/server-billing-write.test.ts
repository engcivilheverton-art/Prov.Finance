import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const batchCommit = vi.fn();
  const batchCreate = vi.fn();
  const batchSet = vi.fn();
  const docGet = vi.fn();
  const doc = vi.fn((path: string) => ({ path, get: () => docGet(path) }));
  const batch = vi.fn(() => ({ create: batchCreate, set: batchSet, commit: batchCommit }));
  return { batchCommit, batchCreate, batchSet, doc, docGet, batch };
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase-admin', () => ({
  adminAuth: vi.fn(),
  adminDb: () => ({ batch: mocks.batch, doc: mocks.doc }),
  FieldValue: { delete: vi.fn(), serverTimestamp: vi.fn() },
}));

import { commitFirestoreDocuments } from '@/lib/server-billing';

describe('commitFirestoreDocuments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.batchCommit.mockResolvedValue(undefined);
    mocks.docGet.mockResolvedValue({ exists: false });
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
});
