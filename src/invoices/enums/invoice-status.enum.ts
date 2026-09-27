export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  ACCOUNTS_REVIEW = 'ACCOUNTS_REVIEW',
  MATCH_PENDING = 'MATCH_PENDING',
  MATCHED = 'MATCHED',
  MISMATCH = 'MISMATCH',
  ON_HOLD = 'ON_HOLD',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

/** Quantities on these invoices consume the remaining PO quantity. */
export const CONSUMED_INVOICE_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.MATCHED,
  InvoiceStatus.APPROVED,
];

export const INVOICE_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  [InvoiceStatus.DRAFT]: [InvoiceStatus.SUBMITTED, InvoiceStatus.CANCELLED],
  [InvoiceStatus.SUBMITTED]: [
    InvoiceStatus.ACCOUNTS_REVIEW,
    InvoiceStatus.CANCELLED,
  ],
  [InvoiceStatus.ACCOUNTS_REVIEW]: [
    InvoiceStatus.MATCH_PENDING,
    InvoiceStatus.ON_HOLD,
    InvoiceStatus.REJECTED,
  ],
  [InvoiceStatus.MATCH_PENDING]: [
    InvoiceStatus.MATCHED,
    InvoiceStatus.MISMATCH,
    InvoiceStatus.ON_HOLD,
  ],
  [InvoiceStatus.MISMATCH]: [
    InvoiceStatus.ACCOUNTS_REVIEW,
    InvoiceStatus.MATCH_PENDING,
    InvoiceStatus.ON_HOLD,
    InvoiceStatus.REJECTED,
  ],
  [InvoiceStatus.ON_HOLD]: [
    InvoiceStatus.ACCOUNTS_REVIEW,
    InvoiceStatus.REJECTED,
  ],
  [InvoiceStatus.MATCHED]: [
    InvoiceStatus.APPROVED,
    InvoiceStatus.REJECTED,
    InvoiceStatus.ACCOUNTS_REVIEW,
  ],
  [InvoiceStatus.APPROVED]: [],
  [InvoiceStatus.REJECTED]: [],
  [InvoiceStatus.CANCELLED]: [],
};

export const MATCHABLE_INVOICE_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.ACCOUNTS_REVIEW,
  InvoiceStatus.MATCH_PENDING,
  InvoiceStatus.MISMATCH,
];

export const EDITABLE_INVOICE_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.DRAFT,
  InvoiceStatus.ACCOUNTS_REVIEW,
];
