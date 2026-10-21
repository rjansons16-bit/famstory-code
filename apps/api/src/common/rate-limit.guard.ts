import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';

import { accountKey, addressKey, RateLimitStore } from './rate-limit.store';

/**
 * HOW OFTEN A STRANGER MAY TRY.
 *
 * Without this, POST /v1/auth/email/login accepts guesses as fast as they
 * arrive, forever. Two things follow, and the second is the one that is easy
 * to miss:
 *
 *   1. A password can be guessed. Long odds per guess are only long while the
 *      number of guesses is limited.
 *   2. Every guess costs the SERVER about 100ms of scrypt - the cost that
 *      makes the hashing safe (identity/password.service.ts). A few hundred
 *      requests a second is therefore a way to take the machine down, and on
 *      this deployment the machine is somebody's laptop.
 *
 * Counted per address AND per account. Per address alone leaves one account
 * open to a botnet; per account alone lets one address spray a whole family's
 * worth of addresses. Neither dimension is optional.
 *
 * Attempts are counted whether they succeed or fail, because reason 2 does not
 * care about the outcome - but a successful sign-in forgives the account's
 * window (AuthService), so honest typing never accumulates towards a lockout.
 */

export interface RateLimitRule {
  /** Everything arriving from one address. */
  ip: { limit: number; windowSec: number };
  /**
   * Attempts against one named account. `field` is the body field that names
   * it - the email being signed in as.
   */
  account?: { field: string; limit: number; windowSec: number };
}

export const RATE_LIMIT = 'famstory:rate_limit';

/**
 * The key the login limiter counts an account under.
 *
 * Exported because a SUCCESSFUL sign-in has to forgive it, and the only place
 * that knows an attempt succeeded is the service. It matches `routeOf` below;
 * the guard's spec pins the two together.
 */
export const LOGIN_ROUTE = 'AuthController.login';

/** Ask for this route to be counted. Routes with no rule are not limited. */
export const RateLimit = (rule: RateLimitRule) => SetMetadata(RATE_LIMIT, rule);

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly store: RateLimitStore,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const rule = this.reflector.getAllAndOverride<RateLimitRule | undefined>(RATE_LIMIT, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!rule) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const route = routeOf(context);

    // Both dimensions are recorded before either is judged: a blocked address
    // must not hide the fact that an account is also under attack.
    const results = [
      this.store.hit(
        addressKey(route, clientIp(request)),
        rule.ip.limit,
        rule.ip.windowSec,
      ),
    ];

    const account = rule.account ? readField(request, rule.account.field) : null;
    if (rule.account && account) {
      results.push(
        this.store.hit(
          accountKey(route, account),
          rule.account.limit,
          rule.account.windowSec,
        ),
      );
    }

    const blocked = results.filter((r) => r.blocked);
    if (blocked.length === 0) return true;

    const retryAfter = Math.max(...blocked.map((r) => r.retryAfter));
    context.switchToHttp().getResponse<Response>().setHeader('Retry-After', String(retryAfter));

    throw new HttpException(
      {
        code: 'too_many_attempts',
        // No hint about which dimension tripped: an attacker learning that an
        // account - rather than their address - is the limited one has learned
        // that the account exists.
        message: 'Too many attempts. Please wait and try again.',
        retryAfter,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/** One counter per route, so a slow login does not spend the refresh budget. */
function routeOf(context: ExecutionContext): string {
  return `${context.getClass().name}.${context.getHandler().name}`;
}

/**
 * Who is asking.
 *
 * `req.ip` is the far end of the socket unless Express is told otherwise, and
 * on this deployment every request arrives through the static server on the
 * same machine - so main.ts trusts a forwarded address from loopback ONLY.
 * Trusting it from anywhere would let a caller pick their own identity and
 * with it their own fresh allowance.
 */
function clientIp(request: Request): string {
  return request.ip ?? request.socket.remoteAddress ?? 'unknown';
}

function readField(request: Request, field: string): string | null {
  const body: unknown = request.body;
  if (typeof body !== 'object' || body === null) return null;

  const value = (body as Record<string, unknown>)[field];
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}
