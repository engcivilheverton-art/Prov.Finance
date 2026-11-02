import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PLANOS, planoValido } from '@/lib/planos';
import { matchesPlan } from '@/lib/planos';
import { hasValidWebhookSignature } from '@/lib/webhook-signature';
import { hasConfirmedLatestInvoice } from '@/lib/subscription-entitlement';

describe('catálogo de assinaturas', () => {
  it('mantém preço e recorrência definidos no servidor', () => {
    expect(PLANOS.mensal).toMatchObject({ valor: 11.99, frequencia: 1, frequenciaTipo: 'months' });
    expect(PLANOS.anual).toMatchObject({ valor: 119.88, frequencia: 12, frequenciaTipo: 'months' });
    expect(planoValido('mensal')).toBe(true);
    expect(planoValido('anual')).toBe(true);
    expect(planoValido('gratuito')).toBe(false);
  });

  it('só aceita uma recorrência Mercado Pago compatível com o plano', () => {
    expect(matchesPlan({ auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: 11.99, currency_id: 'BRL' } }, 'mensal')).toBe(true);
    expect(matchesPlan({ auto_recurring: { frequency: 12, frequency_type: 'months', transaction_amount: 119.88, currency_id: 'BRL' } }, 'anual')).toBe(true);
    expect(matchesPlan({ auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: 0.01, currency_id: 'BRL' } }, 'mensal')).toBe(false);
    expect(matchesPlan({ auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: 11.99, currency_id: 'USD' } }, 'mensal')).toBe(false);
  });
});

describe('assinatura HMAC dos webhooks Mercado Pago', () => {
  const secret = 'segredo-local-de-teste';
  const requestId = 'req-123';
  const dataId = 'ABC-987';
  const ts = '1730570000';
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const signature = `ts=${ts},v1=${createHmac('sha256', secret).update(manifest).digest('hex')}`;

  it('valida a assinatura e rejeita payload ou segredo alterado', () => {
    expect(hasValidWebhookSignature({ signature, requestId, dataId, secret })).toBe(true);
    expect(hasValidWebhookSignature({ signature, requestId: 'outro', dataId, secret })).toBe(false);
    expect(hasValidWebhookSignature({ signature, requestId, dataId, secret: 'incorreto' })).toBe(false);
    expect(hasValidWebhookSignature({ signature: `${signature},v1=bad`, requestId, dataId, secret })).toBe(false);
  });
});

describe('elegibilidade Premium', () => {
  it('exige confirmação de aprovação da fatura mais recente', () => {
    expect(hasConfirmedLatestInvoice({ payment: { status: 'approved' } })).toBe(true);
    expect(hasConfirmedLatestInvoice({ payment: { status: 'rejected' } })).toBe(false);
    expect(hasConfirmedLatestInvoice({ summarized: 'pending' })).toBe(false);
    expect(hasConfirmedLatestInvoice(null)).toBe(false);
  });
});
