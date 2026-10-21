import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';

import { LOGIN_ROUTE, RateLimitGuard, type RateLimitRule } from './rate-limit.guard';
import { accountKey, RateLimitStore } from './rate-limit.store';

/**
 * The limit that stands between a password and somebody guessing it.
 *
 * Worth pinning in tests rather than trusting to reading: every case here is
 * one where being wrong looks like working software. A counter that never
 * resets locks a family out of their own account; one that resets on every
 * request protects nothing; and a key that does not match the one the service
 * forgives would quietly make the forgiveness a no-op.
 */

const LOGIN_RULE: RateLimitRule = {
  ip: { limit: 3, windowSec: 300 },
  account: { field: 'email', limit: 2, windowSec: 900 },
};

describe('RateLimitStore', () => {
  it('allows the limit and blocks what comes after it', () => {
    const store = new RateLimitStore();

    expect(store.hit('k', 2, 60).blocked).toBe(false);
    expect(store.hit('k', 2, 60).blocked).toBe(false);
    expect(store.hit('k', 2, 60).blocked).toBe(true);
  });

  it('starts again once the window has passed', () => {
    const store = new RateLimitStore();
    let clock = 1_000_000;
    store.now = () => clock;

    store.hit('k', 1, 60);
    expect(store.hit('k', 1, 60).blocked).toBe(true);

    clock += 60_000;
    expect(store.hit('k', 1, 60).blocked).toBe(false);
  });

  it('says how long is left, in whole seconds', () => {
    const store = new RateLimitStore();
    let clock = 0;
    store.now = () => clock;

    store.hit('k', 1, 300);
    clock += 100_000;

    expect(store.hit('k', 1, 300).retryAfter).toBe(200);
  });

  it('forgets a key on request', () => {
    const store = new RateLimitStore();

    store.hit('k', 1, 60);
    store.forgive('k');

    expect(store.hit('k', 1, 60).blocked).toBe(false);
  });

  it('counts two keys apart', () => {
    const store = new RateLimitStore();

    store.hit('a', 1, 60);

    expect(store.hit('b', 1, 60).blocked).toBe(false);
  });
});

describe('RateLimitGuard', () => {
  function build(rule: RateLimitRule | undefined) {
    const store = new RateLimitStore();
    const reflector = { getAllAndOverride: () => rule } as unknown as Reflector;
    const headers: Record<string, string> = {};

    const guard = new RateLimitGuard(reflector, store);

    function attempt(ip: string, body: unknown, handler = 'login'): void {
      const context = {
        getHandler: () => ({ name: handler }),
        getClass: () => ({ name: 'AuthController' }),
        switchToHttp: () => ({
          getRequest: () => ({ ip, body, socket: { remoteAddress: ip } }),
          getResponse: () => ({
            setHeader: (name: string, value: string) => {
              headers[name] = value;
            },
          }),
        }),
      } as unknown as ExecutionContext;

      guard.canActivate(context);
    }

    return { store, attempt, headers };
  }

  const from = (ip: string, email: string) => [ip, { email, password: 'x' }] as const;

  it('lets an unmarked route through', () => {
    const { attempt } = build(undefined);

    for (let i = 0; i < 50; i += 1) attempt(...from('1.1.1.1', 'anna@example.com'));
  });

  it('stops one address after its limit', () => {
    const { attempt } = build(LOGIN_RULE);

    // Three different accounts, so it can only be the address that trips.
    attempt(...from('1.1.1.1', 'a@example.com'));
    attempt(...from('1.1.1.1', 'b@example.com'));
    attempt(...from('1.1.1.1', 'c@example.com'));

    expect(() => attempt(...from('1.1.1.1', 'd@example.com'))).toThrow(
      /Too many attempts/,
    );
  });

  it('stops one account however many addresses it is tried from', () => {
    const { attempt } = build(LOGIN_RULE);

    attempt(...from('1.1.1.1', 'anna@example.com'));
    attempt(...from('2.2.2.2', 'anna@example.com'));

    expect(() => attempt(...from('3.3.3.3', 'anna@example.com'))).toThrow();
  });

  it('reads the account whatever case it was typed in', () => {
    const { attempt } = build(LOGIN_RULE);

    attempt(...from('1.1.1.1', 'Anna@Example.com'));
    attempt(...from('2.2.2.2', ' anna@example.com '));

    expect(() => attempt(...from('3.3.3.3', 'anna@example.com'))).toThrow();
  });

  it('counts the key the service forgives', () => {
    const { store, attempt } = build(LOGIN_RULE);

    attempt(...from('1.1.1.1', 'anna@example.com'));
    attempt(...from('2.2.2.2', 'anna@example.com'));

    // The service clears exactly this key after a correct password.
    store.forgive(accountKey(LOGIN_ROUTE, 'anna@example.com'));

    expect(() => attempt(...from('3.3.3.3', 'anna@example.com'))).not.toThrow();
  });

  it('tells the caller how long to wait', () => {
    const { attempt, headers } = build(LOGIN_RULE);

    for (const ip of ['1.1.1.1', '1.1.1.1']) attempt(...from(ip, 'a@example.com'));
    try {
      attempt(...from('1.1.1.1', 'a@example.com'));
    } catch {
      // expected
    }

    expect(Number(headers['Retry-After'])).toBeGreaterThan(0);
  });

  it('keeps the count for one route away from another', () => {
    const { attempt } = build(LOGIN_RULE);

    attempt(...from('1.1.1.1', 'a@example.com'));
    attempt(...from('1.1.1.1', 'b@example.com'));
    attempt(...from('1.1.1.1', 'c@example.com'));

    expect(() => attempt('1.1.1.1', { email: 'd@example.com' }, 'refresh')).not.toThrow();
  });
});
