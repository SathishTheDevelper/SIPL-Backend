export enum QuotationStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  REVISED = 'REVISED',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

export const QUOTATION_TRANSITIONS: Record<string, string[]> = {
  [QuotationStatus.DRAFT]: [
    QuotationStatus.SUBMITTED,
    QuotationStatus.CANCELLED,
  ],
  [QuotationStatus.SUBMITTED]: [
    QuotationStatus.REVISED,
    QuotationStatus.ACCEPTED,
    QuotationStatus.REJECTED,
    QuotationStatus.EXPIRED,
    QuotationStatus.CANCELLED,
  ],
  [QuotationStatus.REVISED]: [
    QuotationStatus.SUBMITTED,
    QuotationStatus.CANCELLED,
  ],
};
