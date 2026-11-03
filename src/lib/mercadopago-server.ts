import 'server-only';
export { matchesPlan } from '@/lib/planos';
export { hasConfirmedLatestInvoice } from '@/lib/subscription-entitlement';

export type Preapproval = {
  id?: string;
  status?: string;
  external_reference?: string;
  init_point?: string;
  version?: number;
  auto_recurring?: {
    frequency?: number;
    frequency_type?: string;
    transaction_amount?: number;
    currency_id?: string;
  };
};

export type AuthorizedInvoice = {
  id?: number | string;
  preapproval_id?: string;
  date_created?: string;
  last_modified?: string;
  summarized?: string;
  payment?: { status?: string; status_detail?: string };
};

export function mercadoPagoAccessToken(): string {
  const token = (process.env.MERCADOPAGO_ACCESS_TOKEN ?? '').trim();
  if (!token) throw new Error('MERCADOPAGO_ACCESS_TOKEN não configurado.');
  return token;
}

export function appBaseUrl(): string {
  const value = (process.env.NEXT_PUBLIC_APP_URL ?? '').trim();
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('NEXT_PUBLIC_APP_URL deve ser uma URL HTTPS válida.'); }
  const local = ['localhost', '127.0.0.1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) throw new Error('NEXT_PUBLIC_APP_URL deve usar HTTPS fora do ambiente local.');
  if (url.pathname !== '/' || url.search || url.hash) throw new Error('NEXT_PUBLIC_APP_URL deve conter apenas a origem do aplicativo.');
  return url.origin;
}

export async function getPreapproval(id: string): Promise<Preapproval> {
  const response = await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(id)}`, {
    headers: { authorization: `Bearer ${mercadoPagoAccessToken()}` },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Falha ao consultar assinatura Mercado Pago (${response.status}).`);
  return await response.json() as Preapproval;
}

/** Fetch the provider's latest recurring invoice; subscription authorization alone
 * does not prove that the most recent charge succeeded. */
export async function getLatestAuthorizedInvoice(preapprovalId: string): Promise<AuthorizedInvoice | null> {
  // The API's default page size is 20. Asking for 100 can be rejected with
  // HTTP 400, which prevented the app from validating otherwise-authorized
  // subscriptions.
  const query = new URLSearchParams({ preapproval_id: preapprovalId, limit: '20', offset: '0' });
  const response = await fetch(`https://api.mercadopago.com/authorized_payments/search?${query}`, {
    headers: { authorization: `Bearer ${mercadoPagoAccessToken()}` }, cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Falha ao consultar as faturas da assinatura (${response.status}).`);
  const data = await response.json() as { results?: AuthorizedInvoice[] };
  const invoices = Array.isArray(data.results) ? data.results.filter((invoice) => invoice.preapproval_id === preapprovalId) : [];
  invoices.sort((a, b) => Date.parse(b.last_modified ?? b.date_created ?? '') - Date.parse(a.last_modified ?? a.date_created ?? ''));
  return invoices[0] ?? null;
}



