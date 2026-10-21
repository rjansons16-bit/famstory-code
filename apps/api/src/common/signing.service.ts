import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Addresses that are their own permission: a calendar feed, a guest link.
 *
 * Whoever holds one can use it without signing in, so the address has to be
 * impossible to guess or to alter - an HMAC over what it names, with the
 * server's secret. Each use names its `purpose`, so a signature made for one
 * kind of address is worthless as another (a calendar signature is not a
 * guest-link signature for the same id).
 *
 * The secret is the one the photograph links use (storage.service.ts): a
 * deployment that has MEDIA_SIGNING_SECRET or JWT_SECRET has both. Without
 * either, a random one per boot - links stop working after a restart, which
 * is the right failure for an address that is also a key.
 */
@Injectable()
export class SigningService {
  constructor(private readonly config: ConfigService) {}

  private bootSecret: string | null = null;

  private get secret(): string {
    const configured =
      this.config.get<string>('MEDIA_SIGNING_SECRET') ?? this.config.get<string>('JWT_SECRET');
    if (configured) return configured;
    this.bootSecret ??= randomBytes(32).toString('hex');
    return this.bootSecret;
  }

  sign(purpose: string, payload: string): string {
    return createHmac('sha256', this.secret).update(`${purpose}:${payload}`).digest('hex');
  }

  /** Constant time, and false rather than a throw for a signature of the wrong length. */
  verify(purpose: string, payload: string, signature: string | undefined): boolean {
    if (!signature) return false;
    const expected = Buffer.from(this.sign(purpose, payload), 'utf8');
    const given = Buffer.from(signature, 'utf8');
    return expected.length === given.length && timingSafeEqual(expected, given);
  }
}
