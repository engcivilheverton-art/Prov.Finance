export type InvoicePaymentState = { payment?: { status?: string }; summarized?: string } | null;

/** A valid recurring contract is not enough: the latest charge must be confirmed. */
export function hasConfirmedLatestInvoice(invoice: InvoicePaymentState): boolean {
  return invoice?.payment?.status === 'approved';
}
