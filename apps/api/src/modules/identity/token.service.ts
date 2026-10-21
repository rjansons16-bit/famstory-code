import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';

import { PrismaService } from '../../common/prisma.service';

export interface AccessTokenPayload {
  sub: string;
  email: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Token issuing and rotation.
 *
 * The access token is short (15 min) and stateless. The refresh token is long
 * (30 days), stored in the database as a hash, and ROTATED on every use.
 *
 * Rotation gives theft detection: if someone uses an already-exchanged token,
 * they are holding an old copy — the real user has swapped it since. In that
 * case the user's whole chain is revoked, not just that one token.
 */
@Injectable()
export class TokenService {
  private static readonly ACCESS_TTL_SEC = 15 * 60;
  private static readonly REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async issue(
    user: { id: string; email: string },
    context?: { userAgent?: string; ipHash?: string },
  ): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email } satisfies AccessTokenPayload,
      {
        secret: this.secret(),
        expiresIn: TokenService.ACCESS_TTL_SEC,
      },
    );

    const refreshToken = randomBytes(48).toString('base64url');

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + TokenService.REFRESH_TTL_MS),
        userAgent: context?.userAgent?.slice(0, 255),
        ipHash: context?.ipHash,
      },
    });

    return { accessToken, refreshToken, expiresIn: TokenService.ACCESS_TTL_SEC };
  }

  async verifyAccess(token: string): Promise<AccessTokenPayload> {
    try {
      return await this.jwt.verifyAsync<AccessTokenPayload>(token, { secret: this.secret() });
    } catch {
      throw new UnauthorizedException({ code: 'invalid_token', message: 'Invalid access token.' });
    }
  }

  /** Exchanges a refresh token for a new pair. */
  async rotate(
    refreshToken: string,
    context?: { userAgent?: string; ipHash?: string },
  ): Promise<TokenPair> {
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      include: { user: { select: { id: true, email: true, deletedAt: true } } },
    });

    if (!existing || existing.user.deletedAt) {
      throw new UnauthorizedException({ code: 'invalid_token', message: 'Unknown refresh token.' });
    }

    // Reuse: this token has already been exchanged or revoked. The only sensible
    // explanation is a copy in someone else's hands.
    if (existing.revokedAt || existing.replacedById) {
      await this.revokeAllForUser(existing.userId);
      throw new UnauthorizedException({
        code: 'token_reuse_detected',
        message: 'Session revoked. Please sign in again.',
      });
    }

    if (existing.expiresAt < new Date()) {
      throw new UnauthorizedException({ code: 'token_expired', message: 'Refresh token expired.' });
    }

    const pair = await this.issue(existing.user, context);

    const created = await this.prisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash: hashToken(pair.refreshToken) },
      select: { id: true },
    });

    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { replacedById: created.id, revokedAt: new Date() },
    });

    return pair;
  }

  async revoke(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Signs the user out on every device. */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private secret(): string {
    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret || secret === 'change-me') {
      // A quiet default key in production is worse than a crash at startup.
      throw new Error('JWT_SECRET is not configured.');
    }
    return secret;
  }
}

/** Only the hash is stored — a leaked database yields no usable tokens. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
