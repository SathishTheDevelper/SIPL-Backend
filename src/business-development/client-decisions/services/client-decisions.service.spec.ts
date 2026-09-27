import { ClientDecisionType } from '../enums/client-decision.enum';

describe('client decision rules', () => {
  it('requires a reason for LOSE', () => {
    const dto = { decision: ClientDecisionType.LOSE, reason: undefined };
    expect(
      dto.decision === ClientDecisionType.LOSE && !dto.reason?.trim(),
    ).toBe(true);
  });

  it('allows WIN without a reason', () => {
    const dto = { decision: ClientDecisionType.WIN };
    expect(
      dto.decision === ClientDecisionType.LOSE &&
        !('reason' in dto && dto.reason),
    ).toBe(false);
  });
});
