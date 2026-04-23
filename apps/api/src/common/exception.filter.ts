import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  NotSupportedInLocalError,
  UnauthorizedError,
  ValidationError,
  createLogger,
  getCorrelationId,
} from '@ckb/shared';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';

const log = createLogger('exception-filter', 'info');

function statusForAppError(err: AppError): number {
  if (err instanceof UnauthorizedError) return 401;
  if (err instanceof ForbiddenError) return 403;
  if (err instanceof NotFoundError) return 404;
  if (err instanceof ConflictError) return 409;
  if (err instanceof ValidationError) return 400;
  if (err instanceof NotSupportedInLocalError) return 501;
  return 500;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const correlationId = getCorrelationId();

    let status = 500;
    let body: Record<string, unknown> = {
      error: { code: 'INTERNAL', message: 'Internal server error' },
      correlationId,
    };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      const payload = typeof res === 'string' ? { message: res } : (res as Record<string, unknown>);
      body = {
        error: {
          code: (payload.error as string | undefined) ?? 'HTTP_ERROR',
          message: (payload.message as string | undefined) ?? exception.message,
        },
        correlationId,
      };
      log.warn('HTTP exception', {
        path: request.path,
        method: request.method,
        status,
        message: exception.message,
      });
    } else if (exception instanceof ZodError) {
      status = 400;
      body = {
        error: {
          code: 'VALIDATION',
          message: 'Request validation failed',
          issues: exception.issues.map((i) => ({ path: i.path, message: i.message })),
        },
        correlationId,
      };
      log.warn('Validation error', { path: request.path, issues: exception.issues.length });
    } else if (exception instanceof AppError) {
      status = statusForAppError(exception);
      body = {
        error: { code: exception.code, message: exception.message, ...exception.details },
        correlationId,
      };
      log.warn('App error', {
        path: request.path,
        code: exception.code,
        message: exception.message,
      });
    } else {
      log.error('Unhandled exception', {
        path: request.path,
        method: request.method,
        message: exception instanceof Error ? exception.message : String(exception),
        stack: exception instanceof Error ? exception.stack : undefined,
      });
    }

    response.status(status).json(body);
  }
}
