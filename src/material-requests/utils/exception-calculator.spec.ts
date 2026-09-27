import { calculateBoqIncrease } from './exception-calculator';

describe('30% cumulative exception', () => {
  it('BOQ 100, approved 20, current 15 is 35% EXCEPTION', () => {
    const result = calculateBoqIncrease(100, 20, 15);
    expect(result.cumulativeQuantity).toBe(35);
    expect(result.increasePercentage).toBe(35);
    expect(result.exceptionStatus).toBe('EXCEPTION');
  });

  it('BOQ 100, approved 20, current 10 is 30% NORMAL', () => {
    const result = calculateBoqIncrease(100, 20, 10);
    expect(result.increasePercentage).toBe(30);
    expect(result.exceptionStatus).toBe('NORMAL');
  });

  it('BOQ 100, approved 0, current 20 is 20% NORMAL', () => {
    const result = calculateBoqIncrease(100, 0, 20);
    expect(result.increasePercentage).toBe(20);
    expect(result.exceptionStatus).toBe('NORMAL');
  });

  it('BOQ 100, approved 30, current 1 is 31% EXCEPTION', () => {
    const result = calculateBoqIncrease(100, 30, 1);
    expect(result.increasePercentage).toBe(31);
    expect(result.exceptionStatus).toBe('EXCEPTION');
  });

  it('sums prior approved requests before the current request', () => {
    const previouslyApproved = 20 + 10;
    const result = calculateBoqIncrease(100, previouslyApproved, 5);
    expect(result.increasePercentage).toBe(35);
    expect(result.exceptionStatus).toBe('EXCEPTION');
  });
});
