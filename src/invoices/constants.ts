export const INVOICE_ACCOUNTS_REVIEW_SLA = 'INVOICE_ACCOUNTS_REVIEW';

export const MAX_INVOICE_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export const INVOICE_ATTACHMENT_TYPES: Record<string, string[]> = {
  'application/pdf': ['pdf'],
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
};

export function matchIdempotencyKey(
  tenantId: string,
  invoiceId: string,
): string {
  return `invoice:${tenantId}:${invoiceId}:three-way-match`;
}

export function poMatchLockKey(
  tenantId: string,
  purchaseOrderId: string,
): string {
  return `invoice:${tenantId}:po:${purchaseOrderId}:match`;
}
