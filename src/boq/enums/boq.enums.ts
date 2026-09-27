export enum BoqStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  SUPERSEDED = 'SUPERSEDED',
  CANCELLED = 'CANCELLED',
}

export const BOQ_TRANSITIONS: Record<string, string[]> = {
  [BoqStatus.DRAFT]: [BoqStatus.SUBMITTED, BoqStatus.CANCELLED],
  [BoqStatus.SUBMITTED]: [
    BoqStatus.APPROVED,
    BoqStatus.REJECTED,
    BoqStatus.DRAFT,
  ],
  [BoqStatus.APPROVED]: [BoqStatus.SUPERSEDED],
  [BoqStatus.REJECTED]: [],
  [BoqStatus.SUPERSEDED]: [],
  [BoqStatus.CANCELLED]: [],
};

export enum PlanningStatus {
  PLANNED = 'PLANNED',
  PARTIALLY_REQUESTED = 'PARTIALLY_REQUESTED',
  FULLY_REQUESTED = 'FULLY_REQUESTED',
  CLOSED = 'CLOSED',
}
