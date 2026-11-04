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

export class MercadoPagoTimeoutError extends Error {
  constructor(operation: string) {
    super(`Mercado Pago request timed out: ${operation}`);
    this.name = 'MercadoPagoTimeoutError';
  }
}

const MERCADO_PAGO_TIMEOUT_MS = 12_000;

async function fetchMercadoPago(url: string, operation: string): Promise<Response> {
  try {
    return await fetch(url, {
      headers: { authorization: `Bearer ${mercadoPagoAccessToken()}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(MERCADO_PAGO_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new MercadoPagoTimeoutError(operation);
    }
    throw error;
  }
}

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
  const response = await fetchMercadoPago(
    `https://api.mercadopago.com/preapproval/${encodeURIComponent(id)}`,
    'preapproval',
  );
  if (!response.ok) throw new Error(`Falha ao consultar assinatura Mercado Pago (${response.status}).`);
  return await response.json() as Preapproval;
}

/** Fetch the provider's latest recurring invoice; subscription authorization alone
 * does not prove that the most recent charge succeeded. */
export async function getLatestAuthorizedInvoice(preapprovalId: string): Promise<AuthorizedInvoice | null> {
  // Let Mercado Pago apply its default pagination. Its API reference documents
  // filtering this search by preapproval_id and shows the default page size.
  const query = new URLSearchParams({ preapproval_id: preapprovalId });
  const response = await fetchMercadoPago(
    `https://api.mercadopago.com/authorized_payments/search?${query}`,
    'authorized_payment_search',
  );
  if (!response.ok) {
    const providerError = await response.json().catch(() => ({})) as { error?: unknown; message?: unknown };
    const diagnostic = [providerError.error, providerError.message]
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.replace(/[\r\n]/g, ' ').slice(0, 160))
      .join(': ');
    console.error('Mercado Pago invoice search failed:', response.status, diagnostic || 'no provider message');
    throw new Error(`Falha ao consultar as faturas da assinatura (${response.status}).`);
  }
  const data = await response.json() as { results?: AuthorizedInvoice[] };
  const invoices = Array.isArray(data.results) ? data.results.filter((invoice) => invoice.preapproval_id === preapprovalId) : [];
  invoices.sort((a, b) => Date.parse(b.last_modified ?? b.date_created ?? '') - Date.parse(a.last_modified ?? a.date_created ?? ''));
  return invoices[0] ?? null;
}



