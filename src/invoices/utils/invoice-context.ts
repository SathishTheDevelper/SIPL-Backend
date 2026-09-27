import { HttpStatus } from '@nestjs/common';
import { Types } from 'mongoose';
import { ErrorCodes } from '../../common/constants/error-codes';
import { TenantContext } from '../../common/context/tenant.context';
import { AppException } from '../../common/exceptions/app.exception';

export function tenantObjectId(): Types.ObjectId {
  return new Types.ObjectId(TenantContext.requireTenantId());
}

export function objectId(id: string): Types.ObjectId {
  return new Types.ObjectId(id);
}

export function invoiceNotFound(): never {
  throw new AppException(
    HttpStatus.NOT_FOUND,
    'Invoice not found',
    ErrorCodes.INVOICE_NOT_FOUND,
  );
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
