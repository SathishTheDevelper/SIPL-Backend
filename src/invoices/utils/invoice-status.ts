import { HttpStatus } from '@nestjs/common';
import { ErrorCodes } from '../../common/constants/error-codes';
import { AppException } from '../../common/exceptions/app.exception';
import {
  EDITABLE_INVOICE_STATUSES,
  INVOICE_TRANSITIONS,
  InvoiceStatus,
  MATCHABLE_INVOICE_STATUSES,
} from '../enums/invoice-status.enum';

export function assertInvoiceTransition(
  current: InvoiceStatus,
  next: InvoiceStatus,
): void {
  const options = INVOICE_TRANSITIONS[current] ?? [];
  if (!options.includes(next)) {
    throw new AppException(
      HttpStatus.BAD_REQUEST,
      `Invalid invoice status transition: ${current} → ${next}`,
      ErrorCodes.INVALID_INVOICE_STATUS,
    );
  }
}

export function assertMatchable(status: InvoiceStatus): void {
  if (!MATCHABLE_INVOICE_STATUSES.includes(status)) {
    throw new AppException(
      HttpStatus.BAD_REQUEST,
      `Invoice cannot be matched from status ${status}`,
      ErrorCodes.INVALID_INVOICE_STATUS,
    );
  }
}

export function assertInvoiceEditable(
  status: InvoiceStatus,
  correctionOpen: boolean,
): void {
  if (status === InvoiceStatus.MATCHED) {
    throw new AppException(
      HttpStatus.CONFLICT,
      'A matched invoice cannot be edited',
      ErrorCodes.INVOICE_ALREADY_MATCHED,
    );
  }
  if (status === InvoiceStatus.APPROVED) {
    throw new AppException(
      HttpStatus.CONFLICT,
      'An approved invoice cannot be edited',
      ErrorCodes.INVOICE_ALREADY_APPROVED,
    );
  }
  if (!EDITABLE_INVOICE_STATUSES.includes(status)) {
    throw new AppException(
      HttpStatus.BAD_REQUEST,
      `Invoice cannot be edited from status ${status}`,
      ErrorCodes.INVALID_INVOICE_STATUS,
    );
  }
  if (status === InvoiceStatus.ACCOUNTS_REVIEW && !correctionOpen) {
    throw new AppException(
      HttpStatus.BAD_REQUEST,
      'Submitted invoices can be corrected only after accounts sends them back',
      ErrorCodes.INVALID_INVOICE_STATUS,
    );
  }
}
