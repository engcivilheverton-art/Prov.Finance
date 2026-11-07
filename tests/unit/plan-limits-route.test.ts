import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class FreePlanLimitError extends Error {
    readonly code = 'FREE_PLAN_LIMIT_REACHED';
    constructor() { super('Limite do plano Free atingido.'); }
  }
  return {
    FreePlanLimitError,
    confirmarAcessoPremium: vi.fn(),
    createLimitedResource: vi.fn(),
    verifyFirebaseIdToken: vi.fn(),
  };
});

vi.mock('@/lib/server-billing', () => ({
  FreePlanLimitError: mocks.FreePlanLimitError,
  confirmarAcessoPremium: mocks.confirmarAcessoPremium,
  createLimitedResource: mocks.createLimitedResource,
  verifyFirebaseIdToken: mocks.verifyFirebaseIdToken,
}));

import { POST } from '@/app/api/plan-limits/[resource]/route';

function request(fields: unknown, token = 'firebase-token') {
  return new Request('https://prov.test/api/plan-limits/cards', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}`, 'content-type': 'application/json' } : { 'content-type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
}

const context = { params: Promise.resolve({ resource: 'cards' }) };

describe('POST /api/plan-limits/[resource]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyFirebaseIdToken.mockResolvedValue({ uid: 'user-1' });
    mocks.confirmarAcessoPremium.mockResolvedValue(false);
    mocks.createLimitedResource.mockResolvedValue('card-1');
  });

  it('exige autenticação Firebase', async () => {
    const response = await POST(request({ nome: 'Cartão' }, ''), context);
    expect(response.status).toBe(401);
    expect(mocks.createLimitedResource).not.toHaveBeenCalled();
  });

  it('retorna 403 e código claro quando o backend detecta o limite Free', async () => {
    mocks.createLimitedResource.mockRejectedValue(new mocks.FreePlanLimitError());
    const response = await POST(request({ nome: 'Cartão' }), context);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 'FREE_PLAN_LIMIT_REACHED', error: 'Limite do plano Free atingido.' });
    expect(mocks.createLimitedResource).toHaveBeenCalledWith('user-1', 'cards', { nome: 'Cartão' }, false);
  });

  it('confirma Premium no servidor e encaminha a criação segura', async () => {
    mocks.confirmarAcessoPremium.mockResolvedValue(true);
    const response = await POST(request({ nome: 'Cartão' }), context);
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ id: 'card-1' });
    expect(mocks.createLimitedResource).toHaveBeenCalledWith('user-1', 'cards', { nome: 'Cartão' }, true);
  });

  it('rejeita recursos e campos desconhecidos', async () => {
    const invalidFields = await POST(request({ admin: true }), context);
    expect(invalidFields.status).toBe(400);
    expect(mocks.createLimitedResource).not.toHaveBeenCalled();
    const invalidResource = await POST(request({ nome: 'Cartão' }), { params: Promise.resolve({ resource: 'rendas' }) });
    expect(invalidResource.status).toBe(400);
  });
});
