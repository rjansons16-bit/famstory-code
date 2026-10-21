import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';

/**
 * Every error leaves the server in the shape docs/05-API.md promises:
 *
 *   { "error": { "code": "visibility_denied", "message": "...", "requestId": "req_..." } }
 *
 * WHY THIS EXISTS. Until it did, Nest sent its own default instead — the object
 * handed to the exception, flat: `{ "code": ..., "message": ... }`. The client was
 * written against the contract and read `body.error`, found nothing, and turned
 * every refusal into `http_401` with a status line. Nobody noticed, because no
 * test on either side sent a real request across the seam. The first person to
 * notice was the first person to sign in without an account: they pressed the
 * button and nothing on screen said why, because the reason had been dropped on
 * the way.
 *
 * WHAT IT NEVER DOES. An error that is not an HttpException is a bug, and its
 * message can carry anything — a SQL fragment, a file path, a row. It is logged
 * here with its stack and leaves as a plain 500 with the request id, which is
 * the one thing somebody needs to find the log line.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ApiError');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();
    const requestId = `req_${randomUUID()}`;

    const { status, body } = toApiError(exception, requestId);

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status} [${requestId}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json(body);
  }
}

export interface ApiErrorBody {
  error: { code: string; message: string; requestId: string; [extra: string]: unknown };
}

/** Exported for the tests: the mapping is the part worth pinning. */
export function toApiError(
  exception: unknown,
  requestId: string,
): { status: number; body: ApiErrorBody } {
  if (!(exception instanceof HttpException)) {
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { error: { code: 'internal_error', message: 'Something went wrong.', requestId } },
    };
  }

  const status = exception.getStatus();
  const payload = exception.getResponse();

  // Our own exceptions: `new ForbiddenException({ code, message, ...extra })`.
  // Extra fields travel with it — the paywall reads `limit` off a plan error.
  if (isObject(payload) && typeof payload.code === 'string') {
    const { code, message, ...extra } = payload;
    return {
      status,
      body: {
        error: {
          ...extra,
          code,
          message: typeof message === 'string' ? message : defaultMessage(status),
          requestId,
        },
      },
    };
  }

  // Nest's own: a thrown string, or `{ statusCode, message, error }` from the
  // router (an unknown route) or the ValidationPipe (a message ARRAY).
  const message = isObject(payload)
    ? Array.isArray(payload.message)
      ? payload.message.join('; ')
      : typeof payload.message === 'string'
        ? payload.message
        : defaultMessage(status)
    : typeof payload === 'string'
      ? payload
      : defaultMessage(status);

  return { status, body: { error: { code: codeFor(status), message, requestId } } };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function codeFor(status: number): string {
  switch (status) {
    case 400: return 'bad_request';
    case 401: return 'unauthorized';
    case 403: return 'forbidden';
    case 404: return 'not_found';
    case 409: return 'conflict';
    case 429: return 'too_many_requests';
    default: return status >= 500 ? 'internal_error' : `http_${status}`;
  }
}

function defaultMessage(status: number): string {
  return status >= 500 ? 'Something went wrong.' : 'The request could not be completed.';
}
