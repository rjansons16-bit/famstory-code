import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthProvider } from '@prisma/client';

import { AuditService } from '../../common/audit.service';
import { withinGrace } from '../../common/deletion';
import { LIMITS } from '../../common/input';
import { PrismaService } from '../../common/prisma.service';
import { LOGIN_ROUTE } from '../../common/rate-limit.guard';
import { accountKey, RateLimitStore } from '../../common/rate-limit.store';
import { PasswordService } from './password.service';
import { TokenService, type TokenPair } from './token.service';

export interface AuthContext {
  userAgent?: string;
  ipHash?: string;
}

export interface AuthResult extends TokenPair {
  user: { id: string; email: string; displayName: string; locale: string };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly rateLimits: RateLimitStore,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // Email
  // -------------------------------------------------------------------------

  async register(
    input: { email: string; password: string; displayName: string; locale?: string; acceptedTerms?: unknown },
    ctx: AuthContext = {},
  ): Promise<AuthResult> {
    const email = normalizeEmail(input.email);
    assertRegistrable(email, input.password, input.displayName);

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException({ code: 'email_taken', message: 'Email already registered.' });
    }

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash: await this.passwords.hash(input.password),
        displayName: input.displayName.trim(),
        locale: input.locale ?? 'en',
        ...termsAccepted(input.acceptedTerms),
        identities: { create: { provider: AuthProvider.email, providerUserId: email } },
      },
      select: { id: true, email: true, displayName: true, locale: true },
    });

    return { ...(await this.tokens.issue(user, ctx)), user };
  }

  async login(
    input: { email: string; password: string },
    ctx: AuthContext = {},
  ): Promise<AuthResult> {
    const email = normalizeEmail(input.email);
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        displayName: true,
        locale: true,
        passwordHash: true,
        deletedAt: true,
      },
    });

    // The same answer for an unknown email and for a wrong password — otherwise
    // the endpoint becomes an account-existence oracle.
    const invalid = new UnauthorizedException({
      code: 'invalid_credentials',
      message: 'Incorrect email or password.',
    });

    // A deleted account is not refused outright: inside the 30-day grace
    // period, signing in is how a person takes the deletion back. Past it the
    // row is only still here because the sweep has not run yet, and that is
    // not an account any more.
    const erased = user?.deletedAt ? !withinGrace(user.deletedAt) : false;

    if (!user || erased || !user.passwordHash) {
      // Compare even when there is no user, so the response time does not differ.
      await this.passwords.verify(input.password, DUMMY_HASH);
      throw invalid;
    }

    const ok = await this.passwords.verify(input.password, user.passwordHash);
    if (!ok) throw invalid;

    // Only now - a wrong password must never bring an account back.
    if (user.deletedAt) await this.restore(user.id, ctx);

    // Strengthening the parameters happens silently, while the password is in hand.
    if (this.passwords.needsRehash(user.passwordHash)) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await this.passwords.hash(input.password) },
      });
    }

    // It was them. Three wrong guesses followed by the right one must not
    // leave the account three attempts from a lockout for the next quarter of
    // an hour - that would punish exactly the person the limit is protecting.
    // The address's own count stands: it is there to cap the work, not to
    // judge who asked.
    this.rateLimits.forgive(accountKey(LOGIN_ROUTE, email));

    const publicUser = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      locale: user.locale,
    };
    return { ...(await this.tokens.issue(publicUser, ctx)), user: publicUser };
  }

  // -------------------------------------------------------------------------
  // OAuth
  // -------------------------------------------------------------------------

  /**
   * Google/Apple sign-in from an ALREADY VERIFIED profile.
   *
   * The ID token signature is checked outside this method (see OauthVerifier).
   * An unverified profile must never reach here — that would be authentication
   * performed by the client instead of the server.
   */
  async loginWithProvider(
    provider: AuthProvider,
    profile: { providerUserId: string; email: string; displayName?: string },
    ctx: AuthContext = {},
    acceptedTerms?: unknown,
  ): Promise<AuthResult> {
    const email = normalizeEmail(profile.email);

    const identity = await this.prisma.authIdentity.findUnique({
      where: { provider_providerUserId: { provider, providerUserId: profile.providerUserId } },
      include: {
        user: { select: { id: true, email: true, displayName: true, locale: true, deletedAt: true } },
      },
    });

    if (identity) {
      const { deletedAt, ...user } = identity.user;
      // The provider has just proved who this is, which is the same proof the
      // password path asks for before it restores anything.
      if (!deletedAt || (withinGrace(deletedAt) && (await this.restore(user.id, ctx)))) {
        return { ...(await this.tokens.issue(user, ctx)), user };
      }
      throw new UnauthorizedException({
        code: 'account_deleted',
        message: 'This account has been deleted.',
      });
    }

    // An email that is already registered, but a different sign-in method — add
    // the identity to the existing account instead of creating a duplicate.
    const byEmail = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, displayName: true, locale: true, deletedAt: true },
    });

    if (byEmail) {
      const { deletedAt, ...user } = byEmail;
      if (deletedAt && !withinGrace(deletedAt)) {
        // The address is taken by a row that is on its way out. Creating a
        // second user with it would fail on the unique index - a 500 where a
        // sentence belongs.
        throw new UnauthorizedException({
          code: 'account_deleted',
          message: 'This account has been deleted.',
        });
      }
      if (deletedAt) await this.restore(user.id, ctx);

      await this.prisma.authIdentity.create({
        data: { userId: user.id, provider, providerUserId: profile.providerUserId },
      });
      return { ...(await this.tokens.issue(user, ctx)), user };
    }

    const created = await this.prisma.user.create({
      data: {
        email,
        displayName: profile.displayName?.trim() || email.split('@')[0],
        // An OAuth email comes from a verified provider.
        emailVerifiedAt: new Date(),
        ...termsAccepted(acceptedTerms),
        identities: { create: { provider, providerUserId: profile.providerUserId } },
      },
      select: { id: true, email: true, displayName: true, locale: true },
    });

    return { ...(await this.tokens.issue(created, ctx)), user: created };
  }

  // -------------------------------------------------------------------------

  /**
   * Bring back an account that was deleted less than 30 days ago.
   *
   * The only recovery route a person can find on their own: there is no
   * support desk behind this product, and the family's photographs are on the
   * other side of it. Always returns true, so it reads as a guard in the
   * expression that calls it.
   */
  private async restore(userId: string, ctx: AuthContext): Promise<boolean> {
    await this.prisma.user.update({ where: { id: userId }, data: { deletedAt: null } });

    await this.audit.record({
      userId,
      action: 'account.restored',
      entityType: 'user',
      entityId: userId,
      userAgent: ctx.userAgent,
    });

    return true;
  }

  refresh(refreshToken: string, ctx: AuthContext = {}): Promise<TokenPair> {
    return this.tokens.rotate(refreshToken, ctx);
  }

  logout(refreshToken: string): Promise<void> {
    return this.tokens.revoke(refreshToken);
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * The floor under registration.
 *
 * The DTOs carry no class-validator decorators yet, and a plain TypeScript
 * interface is nothing at runtime — so without this, `POST /auth/email/register`
 * with an empty body would happily create a user whose email is the empty
 * string, and the second one would collide with it. That is a row nobody can
 * sign in as and nobody can delete by address.
 *
 * Deliberately loose on the address: anything stricter than "one @ with
 * something either side" rejects real addresses. The password floor matches the
 * client's own check so the two do not disagree about what is allowed.
 */
const MIN_PASSWORD_LENGTH = 8;

/**
 * The version of the terms and the privacy policy somebody accepted - "1.0",
 * from docs/legal/facts.json through the app. Recorded at sign-up (docs/legal/
 * README.md, "a consent step at registration that records which version was
 * accepted"). Anything that is not a version is not recorded: the app asks
 * again after sign-in, which is better than a made-up record.
 */
export function acceptedVersion(value: unknown): string | null {
  return typeof value === 'string' && /^\d{1,3}(\.\d{1,3}){0,2}$/.test(value) ? value : null;
}

export function termsAccepted(value: unknown, now: Date = new Date()) {
  const version = acceptedVersion(value);
  return version ? { termsVersion: version, termsAcceptedAt: now } : {};
}

function assertRegistrable(email: string, password: string, displayName: string): void {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new BadRequestException({
      code: 'invalid_email',
      message: 'That does not look like an email address.',
    });
  }

  if ((password ?? '').length < MIN_PASSWORD_LENGTH) {
    throw new BadRequestException({
      code: 'weak_password',
      message: `A password needs at least ${MIN_PASSWORD_LENGTH} characters.`,
    });
  }

  if (typeof displayName !== 'string' || !displayName.trim()) {
    throw new BadRequestException({
      code: 'missing_name',
      message: 'A name is required.',
    });
  }
  // About you's two fields are 40 each; this is room for both and more.
  if (displayName.trim().length > LIMITS.personName) {
    throw new BadRequestException({
      code: 'invalid_display_name',
      message: `A name is at most ${LIMITS.personName} characters.`,
    });
  }
}

/**
 * A fixed hash that keeps the response time equal when there is no user.
 *
 * Without it `login` would answer an unknown email immediately, but a known one
 * after ~100 ms of scrypt work. That difference turns the endpoint into an
 * account-existence oracle.
 *
 * The sizes are built from buffers rather than written by hand: the hash has to
 * be exactly as long as a real one (64 bytes), otherwise even the dummy check
 * would take a different amount of time. No password opens it — those are just
 * zeroes.
 */
const DUMMY_HASH = [
  'scrypt',
  2 ** 17,
  8,
  1,
  Buffer.alloc(16).toString('base64'),
  Buffer.alloc(64).toString('base64'),
].join('$');
