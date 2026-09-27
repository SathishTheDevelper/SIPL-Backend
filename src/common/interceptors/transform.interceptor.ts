import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { PaginatedResult, paginationMeta } from '../utils/pagination.util';

export interface SuccessResponse<T> {
  success: true;
  data: T;
  message: string;
  pagination?: ReturnType<typeof paginationMeta>;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  SuccessResponse<unknown>
> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<SuccessResponse<unknown>> {
    return next.handle().pipe(
      map((payload) => {
        if (this.isAlreadyWrapped(payload)) {
          return payload;
        }

        if (this.isPaginated(payload)) {
          return {
            success: true as const,
            data: payload.items,
            message: 'Success',
            pagination: paginationMeta(
              payload.total,
              payload.page,
              payload.limit,
            ),
          };
        }

        return {
          success: true as const,
          data: payload ?? null,
          message: 'Success',
        };
      }),
    );
  }

  private isAlreadyWrapped(
    payload: unknown,
  ): payload is SuccessResponse<unknown> {
    return (
      typeof payload === 'object' &&
      payload !== null &&
      'success' in payload &&
      payload.success === true &&
      'data' in payload
    );
  }

  private isPaginated(payload: unknown): payload is PaginatedResult<unknown> {
    return (
      typeof payload === 'object' &&
      payload !== null &&
      Array.isArray((payload as PaginatedResult<unknown>).items) &&
      typeof (payload as PaginatedResult<unknown>).total === 'number' &&
      typeof (payload as PaginatedResult<unknown>).page === 'number' &&
      typeof (payload as PaginatedResult<unknown>).limit === 'number'
    );
  }
}
