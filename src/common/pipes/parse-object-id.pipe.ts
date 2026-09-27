import { HttpStatus, Injectable, PipeTransform } from '@nestjs/common';
import { ErrorCodes } from '../constants/error-codes';
import { AppException } from '../exceptions/app.exception';
import { isObjectId } from '../utils/object-id.util';

@Injectable()
export class ParseObjectIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!isObjectId(value)) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Invalid identifier',
        ErrorCodes.VALIDATION_ERROR,
      );
    }
    return value;
  }
}
