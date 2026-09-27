export enum LeadStatus {
  NEW = 'NEW',
  CONTACTED = 'CONTACTED',
  QUALIFIED = 'QUALIFIED',
  DISQUALIFIED = 'DISQUALIFIED',
  CONVERTED = 'CONVERTED',
  CLOSED = 'CLOSED',
}

export const LEAD_TRANSITIONS: Record<string, string[]> = {
  [LeadStatus.NEW]: [
    LeadStatus.CONTACTED,
    LeadStatus.QUALIFIED,
    LeadStatus.DISQUALIFIED,
    LeadStatus.CLOSED,
  ],
  [LeadStatus.CONTACTED]: [
    LeadStatus.QUALIFIED,
    LeadStatus.DISQUALIFIED,
    LeadStatus.CLOSED,
  ],
  [LeadStatus.QUALIFIED]: [
    LeadStatus.CONVERTED,
    LeadStatus.DISQUALIFIED,
    LeadStatus.CLOSED,
  ],
};
