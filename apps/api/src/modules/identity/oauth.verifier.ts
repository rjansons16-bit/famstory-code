import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createPublicKey, type JsonWebKey } from 'node:crypto';

export interface OauthProfile {
  providerUserId: string;
  email: string;
  displayName?: string;
}

interface Jwks {
  keys: (JsonWebKey & { kid: string; alg?: string })[];
}

/**
 * Verification of Google and Apple ID tokens.
 *
 * CRITICAL: the signature is checked ON THE SERVER against the provider's public
 * key. Accepting a client-supplied token without checking would mean anyone can
 * sign in as anyone — a self-signed JWT with someone else's email would do.
 *
 * No external libraries: the JWKS is loaded with fetch, and Node's
 * `createPublicKey` accepts a JWK directly. Zero extra dependencies on the
 * authentication path.
 */
@Injectable()
export class OauthVerifier {
  private readonly logger = new Logger(OauthVerifier.name);

  private static readonly GOOGLE_JWKS = 'https://www.googleapis.com/oauth2/v3/certs';
  // Google uses both spellings; the jwt library requires a non-empty tuple.
  private static readonly GOOGLE_ISS: [string, ...string[]] = [
    'https://accounts.google.com',
    'accounts.google.com',
  ];

  private static readonly APPLE_JWKS = 'https://appleid.apple.com/auth/keys';
  private static readonly APPLE_ISS = 'https://appleid.apple.com';

  /** The JWKS cache. Providers rotate their keys rarely, but they do rotate. */
  private cache = new Map<string, { keys: Jwks['keys']; fetchedAt: number }>();
  private static readonly CACHE_TTL_MS = 60 * 60 * 1000;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async verifyGoogle(idToken: string): Promise<OauthProfile> {
    const clientId = this.required('GOOGLE_CLIENT_ID');
    const payload = await this.verify(idToken, OauthVerifier.GOOGLE_JWKS, {
      audience: clientId,
      issuer: OauthVerifier.GOOGLE_ISS,
    });

    if (!payload.email) {
      throw new UnauthorizedException({ code: 'oauth_no_email', message: 'No email in token.' });
    }
    // An unverified email must never become an account identity — otherwise
    // someone could register a Google account with another person's email and
    // take that account over.
    if (payload.email_verified === false) {
      throw new UnauthorizedException({
        code: 'oauth_email_unverified',
        message: 'Provider email is not verified.',
      });
    }

    return {
      providerUserId: payload.sub as string,
      email: payload.email as string,
      displayName: payload.name as string | undefined,
    };
  }

  /**
   * Apple returns the name ONLY on the first authorisation, and not inside the
   * token — the client passes it separately. That is why `displayName` is a
   * parameter here rather than something read from the payload.
   */
  async verifyApple(identityToken: string, displayName?: string): Promise<OauthProfile> {
    const clientId = this.required('APPLE_CLIENT_ID');
    const payload = await this.verify(identityToken, OauthVerifier.APPLE_JWKS, {
      audience: clientId,
      issuer: OauthVerifier.APPLE_ISS,
    });

    if (!payload.email) {
      throw new UnauthorizedException({ code: 'oauth_no_email', message: 'No email in token.' });
    }

    return {
      providerUserId: payload.sub as string,
      email: payload.email as string,
      displayName,
    };
  }

  // -------------------------------------------------------------------------

  private async verify(
    token: string,
    jwksUrl: string,
    options: { audience: string; issuer: string | [string, ...string[]] },
  ): Promise<Record<string, unknown>> {
    const kid = this.readKid(token);
    const key = await this.publicKey(jwksUrl, kid);

    try {
      return await this.jwt.verifyAsync<Record<string, unknown>>(token, {
        publicKey: key,
        algorithms: ['RS256'],
        audience: options.audience,
        issuer: options.issuer,
      });
    } catch (error) {
      this.logger.warn(`OAuth token rejected: ${(error as Error).message}`);
      throw new UnauthorizedException({
        code: 'oauth_invalid_token',
        message: 'Provider token is not valid.',
      });
    }
  }

  private readKid(token: string): string {
    const [rawHeader] = token.split('.');
    if (!rawHeader) {
      throw new UnauthorizedException({ code: 'oauth_invalid_token', message: 'Malformed token.' });
    }
    try {
      const header = JSON.parse(Buffer.from(rawHeader, 'base64url').toString()) as { kid?: string };
      if (!header.kid) throw new Error('no kid');
      return header.kid;
    } catch {
      throw new UnauthorizedException({ code: 'oauth_invalid_token', message: 'Malformed token.' });
    }
  }

  private async publicKey(jwksUrl: string, kid: string): Promise<string> {
    let entry = this.cache.get(jwksUrl);
    const stale = !entry || Date.now() - entry.fetchedAt > OauthVerifier.CACHE_TTL_MS;

    if (stale) {
      entry = { keys: await this.fetchJwks(jwksUrl), fetchedAt: Date.now() };
      this.cache.set(jwksUrl, entry);
    }

    let jwk = entry!.keys.find((k) => k.kid === kid);

    // An unknown kid can mean the provider has just rotated its keys.
    // Re-read once before refusing.
    if (!jwk && !stale) {
      const fresh = { keys: await this.fetchJwks(jwksUrl), fetchedAt: Date.now() };
      this.cache.set(jwksUrl, fresh);
      jwk = fresh.keys.find((k) => k.kid === kid);
    }

    if (!jwk) {
      throw new UnauthorizedException({
        code: 'oauth_unknown_key',
        message: 'Signing key not found.',
      });
    }

    return createPublicKey({ key: jwk, format: 'jwk' }).export({
      type: 'spki',
      format: 'pem',
    }) as string;
  }

  private async fetchJwks(url: string): Promise<Jwks['keys']> {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) {
      throw new UnauthorizedException({
        code: 'oauth_jwks_unavailable',
        message: 'Could not reach identity provider.',
      });
    }
    return ((await response.json()) as Jwks).keys;
  }

  private required(key: string): string {
    const value = this.config.get<string>(key);
    if (!value) throw new Error(`${key} is not configured.`);
    return value;
  }
}
