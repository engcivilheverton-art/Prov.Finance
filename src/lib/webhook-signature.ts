import { createHmac, timingSafeEqual } from 'node:crypto';

export function hasValidWebhookSignature(input: { signature: string; requestId: string; dataId: string; secret: string }): boolean {
  const parts = Object.fromEntries(input.signature.split(',').map((part) => {
    const [key, ...rest] = part.trim().split('=');
    return [key, rest.join('=')];
  }));
  const { ts, v1 } = parts;
  if (!ts || !v1 || !/^[a-f\d]{64}$/i.test(v1) || !input.requestId || !input.dataId || !input.secret) return false;
  const manifest = `id:${input.dataId.toLowerCase()};request-id:${input.requestId};ts:${ts};`;
  const expected = createHmac('sha256', input.secret).update(manifest).digest();
  const received = Buffer.from(v1, 'hex');
  return received.length === expected.length && timingSafeEqual(received, expected);
}
