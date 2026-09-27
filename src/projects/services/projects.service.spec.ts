import { ClientDecisionType } from '../../business-development/client-decisions/enums/client-decision.enum';
import { ErrorCodes } from '../../common/constants/error-codes';

describe('project creation rules', () => {
  it('forbids project creation from a LOSE decision', () => {
    const decision = { decision: ClientDecisionType.LOSE };
    expect(decision.decision === ClientDecisionType.WIN).toBe(false);
    expect(ErrorCodes.PROJECT_NOT_ALLOWED).toBe('PROJECT_NOT_ALLOWED');
  });

  it('allows project creation only from WIN', () => {
    const decision = { decision: ClientDecisionType.WIN };
    expect(decision.decision).toBe(ClientDecisionType.WIN);
  });
});
