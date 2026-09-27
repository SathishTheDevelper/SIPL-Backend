import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode, ErrorCodes } from '../constants/error-codes';

export class AppException extends HttpException {
  readonly errorCode: ErrorCode;
  readonly details?: Record<string, unknown> | Array<Record<string, unknown>>;

  constructor(
    status: HttpStatus,
    message: string,
    errorCode: ErrorCode = ErrorCodes.INTERNAL_ERROR,
    details?: Record<string, unknown> | Array<Record<string, unknown>>,
  ) {
    super({ message, errorCode, details }, status);
    this.errorCode = errorCode;
    this.details = details;
  }
}
