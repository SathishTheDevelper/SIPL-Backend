import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { MongoServerError } from 'mongodb';
import { Error as MongooseError } from 'mongoose';
import { ErrorCodes } from '../constants/error-codes';
import { AppException } from '../exceptions/app.exception';

interface ErrorBody {
  success: false;
  statusCode: number;
  message: string;
  errorCode: string;
  timestamp: string;
  path: string;
  errors?: unknown;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const body = this.toBody(exception, request);
    if (body.statusCode >= 500) {
      this.logger.error(
        {
          path: request.url,
          method: request.method,
          statusCode: body.statusCode,
          errorCode: body.errorCode,
        },
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown, request: Request): ErrorBody {
    const timestamp = new Date().toISOString();
    const path = request.url;

    if (exception instanceof AppException) {
      const payload = exception.getResponse() as {
        message: string;
        errorCode: string;
        details?: unknown;
      };
      return {
        success: false,
        statusCode: exception.getStatus(),
        message: payload.message,
        errorCode: payload.errorCode,
        timestamp,
        path,
        errors: payload.details,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      if (this.isValidationPayload(payload)) {
        return {
          success: false,
          statusCode: status,
          message: 'Validation failed',
          errorCode: ErrorCodes.VALIDATION_ERROR,
          timestamp,
          path,
          errors: payload.message,
        };
      }

      const message =
        typeof payload === 'string'
          ? payload
          : ((payload as { message?: string }).message ?? exception.message);

      return {
        success: false,
        statusCode: status,
        message,
        errorCode: this.mapHttpCode(status),
        timestamp,
        path,
      };
    }

    if (exception instanceof MongoServerError && exception.code === 11000) {
      return {
        success: false,
        statusCode: HttpStatus.CONFLICT,
        message: 'Duplicate record',
        errorCode: ErrorCodes.CONFLICT,
        timestamp,
        path,
      };
    }

    if (exception instanceof MongooseError.ValidationError) {
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Validation failed',
        errorCode: ErrorCodes.VALIDATION_ERROR,
        timestamp,
        path,
        errors: Object.values(exception.errors).map((error) => error.message),
      };
    }

    const exposeStack = process.env.NODE_ENV !== 'production';
    return {
      success: false,
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message:
        exposeStack && exception instanceof Error
          ? exception.message
          : 'An unexpected error occurred',
      errorCode: ErrorCodes.INTERNAL_ERROR,
      timestamp,
      path,
    };
  }

  private isValidationPayload(
    payload: string | object,
  ): payload is { message: string[] } {
    return (
      typeof payload === 'object' &&
      payload !== null &&
      Array.isArray((payload as { message?: unknown }).message)
    );
  }

  private mapHttpCode(status: number): string {
    if (status === 401) return ErrorCodes.UNAUTHORIZED;
    if (status === 403) return ErrorCodes.FORBIDDEN;
    if (status === 404) return ErrorCodes.NOT_FOUND;
    if (status === 409) return ErrorCodes.CONFLICT;
    if (status === 429) return ErrorCodes.RATE_LIMITED;
    if (status === 400) return ErrorCodes.VALIDATION_ERROR;
    return ErrorCodes.INTERNAL_ERROR;
  }
}
