import { Injectable } from '@nestjs/common';

/**
 * ATTEMPT COUNTING, IN MEMORY.
 *
 * Fixed windows in a Map. No Redis, deliberately: this exists to stop password
 * guessing against one process on one machine, and a dependency on a second
 * service to do it would mean the protection is off whenever that service is.
 * When the API runs on more than one node this becomes the one thing that has
 * to move to Redis, and the interface is small enough that moving it is a file.
 *
 * The window is fixed rather than sliding, which lets an attacker have two
 * windows' worth of attempts across a boundary. At these limits that is the
 * difference between 10 guesses and 20 - against scrypt, neither is a threat.
 */

export interface AttemptResult {
  /** Attempts recorded inside the current window, this one included. */
  count: number;
  /** Seconds until the window resets. */
  retryAfter: number;
  /** Has this key used more than it is allowed? */
  blocked: boolean;
}

/** Stop the Map from growing without bound if somebody enumerates addresses. */
const SWEEP_AT_ENTRIES = 5_000;

@Injectable()
export class RateLimitStore {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  /** The clock, so the tests do not have to wait five minutes. */
  now: () => number = () => Date.now();

  /** Record an attempt against a key and say whether it is over the line. */
  hit(key: string, limit: number, windowSec: number): AttemptResult {
    const now = this.now();
    const existing = this.windows.get(key);

    if (this.windows.size >= SWEEP_AT_ENTRIES) this.sweep(now);

    if (!existing || existing.resetAt <= now) {
      const resetAt = now + windowSec * 1000;
      this.windows.set(key, { count: 1, resetAt });
      return { count: 1, retryAfter: windowSec, blocked: 1 > limit };
    }

    existing.count += 1;

    return {
      count: existing.count,
      retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      blocked: existing.count > limit,
    };
  }

  /**
   * Forget a key.
   *
   * Used when the attempt turns out to have been the real person: somebody who
   * mistypes their password three times and then gets it right must not be
   * three attempts closer to a lockout for the rest of the window.
   */
  forgive(key: string): void {
    this.windows.delete(key);
  }

  private sweep(now: number): void {
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key);
    }
  }
}

/** The key an account is counted under, whatever case it was typed in. */
export function accountKey(route: string, value: string): string {
  return `account:${route}:${value.trim().toLowerCase()}`;
}

/** The key an address is counted under. */
export function addressKey(route: string, ip: string): string {
  return `ip:${route}:${ip}`;
}
