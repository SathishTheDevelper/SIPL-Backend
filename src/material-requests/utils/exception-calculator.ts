export const EXCEPTION_THRESHOLD_PERCENT = 30;

export type ExceptionStatus = 'NORMAL' | 'EXCEPTION';

export interface BoqIncreaseResult {
  cumulativeQuantity: number;
  increasePercentage: number;
  exceptionStatus: ExceptionStatus;
}

export function calculateBoqIncrease(
  boqQuantity: number,
  previouslyApprovedQuantity: number,
  currentRequestQuantity: number,
): BoqIncreaseResult {
  const cumulativeQuantity =
    previouslyApprovedQuantity + currentRequestQuantity;
  const increasePercentage =
    boqQuantity === 0
      ? Number.POSITIVE_INFINITY
      : (cumulativeQuantity / boqQuantity) * 100;
  return {
    cumulativeQuantity,
    increasePercentage,
    exceptionStatus:
      increasePercentage > EXCEPTION_THRESHOLD_PERCENT ? 'EXCEPTION' : 'NORMAL',
  };
}
