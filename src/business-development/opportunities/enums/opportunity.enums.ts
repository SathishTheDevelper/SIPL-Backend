export enum OpportunityStage {
  IDENTIFIED = 'IDENTIFIED',
  QUALIFICATION = 'QUALIFICATION',
  PROPOSAL = 'PROPOSAL',
  NEGOTIATION = 'NEGOTIATION',
  DECISION = 'DECISION',
}

export enum OpportunityStatus {
  OPEN = 'OPEN',
  WON = 'WON',
  LOST = 'LOST',
  CLOSED = 'CLOSED',
}

export const OPPORTUNITY_STAGE_TRANSITIONS: Record<string, string[]> = {
  [OpportunityStage.IDENTIFIED]: [OpportunityStage.QUALIFICATION],
  [OpportunityStage.QUALIFICATION]: [OpportunityStage.PROPOSAL],
  [OpportunityStage.PROPOSAL]: [OpportunityStage.NEGOTIATION],
  [OpportunityStage.NEGOTIATION]: [OpportunityStage.DECISION],
  [OpportunityStage.DECISION]: [],
};
