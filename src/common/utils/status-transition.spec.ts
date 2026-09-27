import { assertTransition } from './status-transition';

describe('assertTransition', () => {
  const lead = {
    NEW: ['CONTACTED', 'QUALIFIED', 'DISQUALIFIED'],
    QUALIFIED: ['CONVERTED'],
  };

  it('allows a configured transition', () => {
    expect(() => assertTransition('NEW', 'QUALIFIED', lead)).not.toThrow();
  });

  it('rejects an invalid transition', () => {
    expect(() => assertTransition('NEW', 'CONVERTED', lead)).toThrow();
  });
});
