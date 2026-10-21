import { BadRequestException } from '@nestjs/common';

import type { AuditService } from '../../common/audit.service';
import type { PrismaService } from '../../common/prisma.service';
import { RateLimitStore } from '../../common/rate-limit.store';
import { AuthService, acceptedVersion } from './auth.service';
import type { PasswordService } from './password.service';
import type { TokenService } from './token.service';

/**
 * The floor under registration.
 *
 * The DTOs carry no class-validator decorators yet, and a TypeScript interface
 * is nothing at runtime — so `POST /auth/email/register` with an empty body
 * used to reach Prisma and create a user whose email was the empty string.
 * These tests exist to make sure it never reaches Prisma again: each one
 * asserts the database was not touched, not merely that something was thrown.
 */

function build() {
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    },
  };
  const passwords = { hash: jest.fn().mockResolvedValue('hashed') } as unknown as PasswordService;
  const tokens = {
    issue: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r', expiresIn: 900 }),
  } as unknown as TokenService;

  const rateLimits = new RateLimitStore();
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;

  return {
    prisma,
    rateLimits,
    service: new AuthService(
      prisma as unknown as PrismaService,
      passwords,
      tokens,
      rateLimits,
      audit,
    ),
  };
}

const good = { email: 'anna@example.com', password: 'LongEnough1', displayName: 'Anna' };

describe('Registering', () => {
  it('accepts an ordinary address', async () => {
    const { service, prisma } = build();
    prisma.user.create.mockResolvedValue({
      id: 'usr_1',
      email: good.email,
      displayName: 'Anna',
      locale: 'en',
    });

    await expect(service.register(good)).resolves.toMatchObject({
      user: { email: good.email },
    });
  });

  it('refuses an empty address before it can become a row', async () => {
    const { service, prisma } = build();

    await expect(service.register({ ...good, email: '' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
    // Not even the lookup: a blank address is not a question worth asking.
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('refuses something that is not an address', async () => {
    const { service, prisma } = build();

    for (const email of ['anna', 'anna@', '@example.com', 'anna example.com', 'a@b']) {
      await expect(service.register({ ...good, email })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('refuses a password shorter than the client asks for', async () => {
    const { service, prisma } = build();

    await expect(service.register({ ...good, password: 'short' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('refuses a name that is only whitespace', async () => {
    // The name is what the whole family sees in the timeline. A row of spaces
    // is an invisible member.
    const { service, prisma } = build();

    await expect(service.register({ ...good, displayName: '   ' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('normalises the address, so one person cannot become two', async () => {
    const { service, prisma } = build();
    prisma.user.create.mockResolvedValue({
      id: 'usr_1',
      email: good.email,
      displayName: 'Anna',
      locale: 'en',
    });

    await service.register({ ...good, email: '  Anna@Example.COM ' });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'anna@example.com' },
    });
  });
});

describe('The terms a person accepted', () => {
  it('are recorded at sign-up, with the version and the moment', async () => {
    const { service, prisma } = build();
    prisma.user.create.mockResolvedValue({ id: 'usr_1', email: good.email, displayName: 'Anna', locale: 'en' });

    await service.register({ ...good, acceptedTerms: '1.0' });

    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data.termsVersion).toBe('1.0');
    expect(data.termsAcceptedAt).toBeInstanceOf(Date);
  });

  it('are not recorded when the app sent no version, or something else', async () => {
    const { service, prisma } = build();
    prisma.user.create.mockResolvedValue({ id: 'usr_1', email: good.email, displayName: 'Anna', locale: 'en' });

    await service.register({ ...good, acceptedTerms: '<script>' });
    await service.register({ ...good, email: 'b@example.com' });

    for (const [call] of prisma.user.create.mock.calls) {
      expect(call.data).not.toHaveProperty('termsVersion');
      expect(call.data).not.toHaveProperty('termsAcceptedAt');
    }
  });

  it.each([
    ['1.0', '1.0'],
    ['2', '2'],
    ['1.2.3', '1.2.3'],
    ['1.0 ', null],
    ['v1', null],
    [1, null],
    [null, null],
  ])('%p is %p', (value, version) => {
    expect(acceptedVersion(value)).toBe(version);
  });
});
