export enum TenderStatus {
  DRAFT = 'DRAFT',
  RECEIVED = 'RECEIVED',
  IN_PROGRESS = 'IN_PROGRESS',
  SUBMITTED = 'SUBMITTED',
  UNDER_EVALUATION = 'UNDER_EVALUATION',
  WON = 'WON',
  LOST = 'LOST',
  CANCELLED = 'CANCELLED',
}

export const TENDER_TRANSITIONS: Record<string, string[]> = {
  [TenderStatus.DRAFT]: [
    TenderStatus.RECEIVED,
    TenderStatus.IN_PROGRESS,
    TenderStatus.SUBMITTED,
    TenderStatus.LOST,
    TenderStatus.CANCELLED,
  ],
  [TenderStatus.RECEIVED]: [
    TenderStatus.IN_PROGRESS,
    TenderStatus.SUBMITTED,
    TenderStatus.LOST,
    TenderStatus.CANCELLED,
  ],
  [TenderStatus.IN_PROGRESS]: [
    TenderStatus.SUBMITTED,
    TenderStatus.LOST,
    TenderStatus.CANCELLED,
  ],
  [TenderStatus.SUBMITTED]: [
    TenderStatus.UNDER_EVALUATION,
    TenderStatus.WON,
    TenderStatus.LOST,
    TenderStatus.CANCELLED,
  ],
  [TenderStatus.UNDER_EVALUATION]: [TenderStatus.WON, TenderStatus.LOST],
};
