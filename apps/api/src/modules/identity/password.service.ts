import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * Password hashing with scrypt.
 *
 * WHY SCRYPT AND NOT BCRYPT/ARGON2:
 * scrypt is in the Node standard library. bcrypt and argon2 need native
 * compilation (node-gyp), which breaks regularly on Windows dev machines and in
 * CI containers. Zero dependencies on the authentication path is also a
 * security gain — less supply-chain surface exactly where a leak costs most.
 *
 * The parameters follow the OWASP 2024 recommendation for scrypt:
 * N = 2^17, r = 8, p = 1.
 */
@Injectable()
export class PasswordService {
  private static readonly N = 2 ** 17;
  private static readonly R = 8;
  private static readonly P = 1;
  private static readonly KEYLEN = 64;
  private static readonly SALT_BYTES = 16;

  /** Format: `scrypt$N$r$p$salt_b64$hash_b64` — the parameters travel with the hash. */
  async hash(password: string): Promise<string> {
    const salt = randomBytes(PasswordService.SALT_BYTES);
    const derived = await this.derive(password, salt);

    return [
      'scrypt',
      PasswordService.N,
      PasswordService.R,
      PasswordService.P,
      salt.toString('base64'),
      derived.toString('base64'),
    ].join('$');
  }

  /**
   * The parameters are read from the hash itself, not from the constants. That
   * means they can be strengthened without breaking existing passwords.
   */
  async verify(password: string, stored: string): Promise<boolean> {
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

    const [, n, r, p, saltB64, hashB64] = parts;

    const N = Number(n);
    const R = Number(r);
    const P = Number(p);
    // Invalid parameters must never reach the scrypt call: Number('abc') is NaN,
    // and NaN parameters make the result unpredictable.
    if (!isPositiveInt(N) || !isPositiveInt(R) || !isPositiveInt(P)) return false;

    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');

    // CRITICAL: Buffer.from with invalid base64 does NOT throw — it silently
    // returns an empty buffer. Without this check a corrupt hash would give
    // scrypt(keylen=0) and timingSafeEqual(empty, empty) === true, meaning ANY
    // password would be accepted. Fail closed: a corrupt hash means "let nobody
    // in", not "let everybody in".
    if (salt.length < PasswordService.SALT_BYTES) return false;
    if (expected.length < 32) return false;

    const derived = await scryptAsync(password, salt, expected.length, {
      N,
      r: R,
      p: P,
      maxmem: 256 * 1024 * 1024,
    });

    // timingSafeEqual throws on differing lengths — check first.
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  }

  /**
   * Does this hash use weaker parameters than we require today?
   * If so, rehash the password silently after a successful sign-in.
   */
  needsRehash(stored: string): boolean {
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return true;
    const n = Number(parts[1]);
    if (!isPositiveInt(n)) return true;
    return n < PasswordService.N;
  }

  private derive(password: string, salt: Buffer): Promise<Buffer> {
    return scryptAsync(password, salt, PasswordService.KEYLEN, {
      N: PasswordService.N,
      r: PasswordService.R,
      p: PasswordService.P,
      // scrypt with N=2^17 needs ~128 MB; the Node default is 32 MB and would refuse.
      maxmem: 256 * 1024 * 1024,
    });
  }
}

/** Only positive integers are accepted — NaN, 0 and fractions are corrupt input. */
function isPositiveInt(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}
