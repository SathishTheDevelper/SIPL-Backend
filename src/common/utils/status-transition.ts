import { HttpStatus } from '@nestjs/common';
import { ErrorCodes } from '../constants/error-codes';
import { AppException } from '../exceptions/app.exception';

export function assertTransition(
  current: string,
  next: string,
  allowed: Record<string, string[]>,
  message = 'Invalid status transition',
): void {
  const options = allowed[current] ?? [];
  if (!options.includes(next)) {
    throw new AppException(
      HttpStatus.BAD_REQUEST,
      `${message}: ${current} → ${next}`,
      ErrorCodes.INVALID_TRANSITION,
    );
  }
}

export function assertEquals(
  actual: string,
  expected: string | string[],
  message: string,
): void {
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (!allowed.includes(actual)) {
    throw new AppException(
      HttpStatus.BAD_REQUEST,
      message,
      ErrorCodes.INVALID_STATUS,
    );
  }
}
