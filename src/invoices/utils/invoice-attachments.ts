import { HttpStatus } from '@nestjs/common';
import { ErrorCodes } from '../../common/constants/error-codes';
import { AppException } from '../../common/exceptions/app.exception';
import { AttachmentMetaDto } from '../../attachments/dto/attachment.dto';
import {
  INVOICE_ATTACHMENT_TYPES,
  MAX_INVOICE_ATTACHMENT_BYTES,
} from '../constants';

export function assertInvoiceAttachments(
  files: AttachmentMetaDto[] | undefined,
  required = false,
): void {
  if (!files?.length) {
    if (required) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'At least one invoice attachment is required',
        ErrorCodes.VALIDATION_ERROR,
      );
    }
    return;
  }
  for (const file of files) {
    const mime = file.mimeType?.toLowerCase().trim();
    const extensions = INVOICE_ATTACHMENT_TYPES[mime];
    if (!extensions) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Invoice attachments must be PDF, PNG, JPG, or JPEG',
        ErrorCodes.VALIDATION_ERROR,
      );
    }
    const extension = file.fileName.split('.').pop()?.toLowerCase() ?? '';
    if (!extensions.includes(extension)) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Invoice attachment extension does not match its MIME type',
        ErrorCodes.VALIDATION_ERROR,
      );
    }
    if (!file.storageKey?.trim() || file.storageKey.includes('..')) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Invoice attachment storage key is invalid',
        ErrorCodes.VALIDATION_ERROR,
      );
    }
    if (file.size <= 0 || file.size > MAX_INVOICE_ATTACHMENT_BYTES) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Invoice attachment exceeds the allowed size',
        ErrorCodes.VALIDATION_ERROR,
      );
    }
  }
}
