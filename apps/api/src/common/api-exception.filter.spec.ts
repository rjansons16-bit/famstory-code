import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { toApiError } from './api-exception.filter';

/**
 * The error contract, as the client reads it.
 *
 * The client's HttpClient looks for `body.error.code`. For as long as the server
 * sent Nest's flat default instead, every refusal arrived at the app as a bare
 * status and the reason was lost — which is how signing in without an account
 * came to look like a button that did nothing. These tests hold the shape.
 */

const REQ = 'req_test';

describe('An error the server meant to send', () => {
  it('is wrapped in `error`, with the code the client branches on', () => {
    const { status, body } = toApiError(
      new UnauthorizedException({ code: 'invalid_credentials', message: 'Incorrect email or password.' }),
      REQ,
    );

    expect(status).toBe(401);
    expect(body).toEqual({
      error: { code: 'invalid_credentials', message: 'Incorrect email or password.', requestId: REQ },
    });
  });

  it('keeps extra fields, because the paywall reads them', () => {
    const { body } = toApiError(
      new ForbiddenException({ code: 'plan_limit_reached', message: 'Limit.', limit: 50 }),
      REQ,
    );
    expect(body.error).toMatchObject({ code: 'plan_limit_reached', limit: 50 });
  });

  it('cannot have its code or request id overwritten by an extra field', () => {
    const { body } = toApiError(
      new ForbiddenException({ code: 'visibility_denied', message: 'No.', requestId: 'spoofed' }),
      REQ,
    );
    expect(body.error.requestId).toBe(REQ);
    expect(body.error.code).toBe('visibility_denied');
  });
});

describe("Nest's own errors", () => {
  it('get a code the client can branch on instead of none', () => {
    const { status, body } = toApiError(new NotFoundException('Cannot GET /v1/nowhere'), REQ);
    expect(status).toBe(404);
    expect(body.error).toMatchObject({ code: 'not_found', message: 'Cannot GET /v1/nowhere' });
  });

  it("join the ValidationPipe's list of messages into one line", () => {
    const { body } = toApiError(
      new BadRequestException({ statusCode: 400, message: ['email must be an email', 'password too short'], error: 'Bad Request' }),
      REQ,
    );
    expect(body.error).toMatchObject({
      code: 'bad_request',
      message: 'email must be an email; password too short',
    });
  });
});

describe('A bug', () => {
  it('leaves as a plain 500 and never carries its own message out', () => {
    const { status, body } = toApiError(
      new Error('column "passwordHash" of relation "User" does not exist'),
      REQ,
    );
    expect(status).toBe(500);
    expect(body.error).toEqual({ code: 'internal_error', message: 'Something went wrong.', requestId: REQ });
    expect(JSON.stringify(body)).not.toContain('passwordHash');
  });
});
