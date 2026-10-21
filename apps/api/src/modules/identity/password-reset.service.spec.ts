import { BadRequestException, ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { MemberRole } from '@prisma/client';
import { createHash } from 'node:crypto';

import type { AuditService } from '../../common/audit.service';
import { MailService } from '../../common/mail.service';
import type { PrismaService } from '../../common/prisma.service';
import type { ViewerContext } from '../visibility/visibility.service';
import { PasswordResetService } from './password-reset.service';
import type { PasswordService } from './password.service';
import type { TokenService } from './token.service';

/**
 * A way back into an account - and the ways it must not become a way into
 * somebody else's. An admin can set another adult's password with this, so
 * the tests are mostly about the edges: who can make a link, for whom, and
 * that it never happens without the person hearing about it.
 */

const admin = (overrides: Partial<ViewerContext> = {}): ViewerContext => ({
  memberId: 'mem_anna',
  familyId: 'fam_1',
  role: MemberRole.admin,
  groupIds: [],
  ...overrides,
});

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

function build(options: {
  member?: { id: string; role: MemberRole; userId: string | null } | null;
  user?: { id?: string; locale?: string; passwordHash: string | null; deletedAt?: Date | null } | null;
  reset?: { id: string; userId: string; expiresAt: Date; usedAt: Date | null } | null;
  claimed?: number;
  /** A link sent by email within the last five minutes. */
  recentEmail?: boolean;
  /** The server's settings: a mail provider and the public site. */
  env?: Record<string, string>;
} = {}) {
  const created: Record<string, unknown>[] = [];
  const sentMail: { to: string; subject: string; text: string }[] = [];

  const prisma = {
    member: {
      findFirst: jest.fn(async (_args: { where: Record<string, unknown> }) =>
        options.member === undefined
          ? { id: 'mem_martin', role: MemberRole.member, userId: 'usr_martin' }
          : options.member,
      ),
    },
    user: {
      findUnique: jest.fn(async () =>
        options.user === undefined ? { passwordHash: 'scrypt$...', deletedAt: null } : options.user,
      ),
      update: jest.fn(async (_args: { where: { id: string }; data: Record<string, unknown> }) => ({})),
    },
    passwordReset: {
      updateMany: jest.fn(async (_args: { where: Record<string, unknown> }) => ({
        count: options.claimed ?? 1,
      })),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return data;
      }),
      findUnique: jest.fn(async (_args: { where: { tokenHash: string } }) => options.reset ?? null),
      findFirst: jest.fn(async () => (options.recentEmail ? { id: 'rst_recent' } : null)),
    },
    notification: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => data),
    },
    $transaction: jest.fn(async (steps: Promise<unknown>[]) => Promise.all(steps)),
  };

  const passwords = { hash: jest.fn(async () => 'scrypt$new') } as unknown as PasswordService;
  const tokens = { revokeAllForUser: jest.fn(async () => undefined) } as unknown as TokenService;
  const audit = { record: jest.fn(async () => undefined) } as unknown as AuditService;

  const env = options.env ?? {};
  const config = { get: (name: string) => env[name] } as unknown as ConfigService;
  const mail = new MailService(config);
  mail.useSender({
    sendMail: async (message) => {
      sentMail.push({ to: message.to, subject: message.subject, text: message.text });
    },
  });

  return {
    service: new PasswordResetService(prisma as unknown as PrismaService, passwords, tokens, audit, mail, config),
    prisma,
    tokens,
    audit,
    created,
    sentMail,
  };
}

/** A server with a mail provider and its public site, as on the VPS. */
const WITH_MAIL = {
  SMTP_URL: 'smtps://user:secret@smtp.example.com:465',
  MAIL_FROM: 'FamStory <support@famstory.lv>',
  SITE_ORIGIN: 'https://famstory.lv',
};

describe('"Forgot your password?" by email', () => {
  it('without a mail provider it says so - the app then offers the admin link', async () => {
    const { service } = build();
    expect(service.emailAvailable).toBe(false);
    await expect(service.requestByEmail('anna@example.com')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('a site that is not https is no site to send a link to', () => {
    const { service } = build({ env: { ...WITH_MAIL, SITE_ORIGIN: 'http://192.168.1.5:8081' } });
    expect(service.emailAvailable).toBe(false);
  });

  it('refuses what is not an email address', async () => {
    const { service } = build({ env: WITH_MAIL });
    await expect(service.requestByEmail('anna')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.requestByEmail(42)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sends a one-hour link to the account, in its language, from the site - and stores only the hash', async () => {
    const now = new Date('2026-10-10T18:00:00.000Z');
    const { service, created, sentMail, audit } = build({
      env: WITH_MAIL,
      user: { id: 'usr_anna', locale: 'lv', passwordHash: 'scrypt$...' },
    });

    expect(await service.sendLink('anna@example.com', now)).toBe(true);

    expect(sentMail).toHaveLength(1);
    expect(sentMail[0].to).toBe('anna@example.com');
    expect(sentMail[0].subject).toBe('FamStory: paroles atjaunošana');
    const link = sentMail[0].text.match(/https:\/\/famstory\.lv\/reset\/(\S+)/);
    expect(link).not.toBeNull();
    expect(created[0].tokenHash).toBe(hash(link![1]));
    expect(created[0].createdByMemberId).toBeNull();
    expect((created[0].expiresAt as Date).getTime()).toBe(now.getTime() + 60 * 60 * 1000);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'account.password_reset_email' }));
  });

  it('nobody with that address, or nobody with a password: nothing is sent, and nothing says so', async () => {
    const none = build({ env: WITH_MAIL, user: null });
    expect(await none.service.sendLink('nobody@example.com')).toBe(false);
    expect(none.sentMail).toHaveLength(0);

    const google = build({ env: WITH_MAIL, user: { id: 'usr_g', locale: 'en', passwordHash: null } });
    expect(await google.service.sendLink('g@example.com')).toBe(false);
    expect(google.sentMail).toHaveLength(0);
  });

  it('one email per account per five minutes, however often the form is sent', async () => {
    const { service, sentMail } = build({
      env: WITH_MAIL,
      user: { id: 'usr_anna', locale: 'en', passwordHash: 'scrypt$...' },
      recentEmail: true,
    });
    expect(await service.sendLink('anna@example.com')).toBe(false);
    expect(sentMail).toHaveLength(0);
  });

  it('the reply does not wait for the looking up - the same for an address with an account and without', async () => {
    const { service, prisma } = build({ env: WITH_MAIL });
    await service.requestByEmail('Anna@Example.com ');
    // Answered before the account was even looked for.
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    await new Promise((resolve) => setImmediate(resolve));
    expect(prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { email: 'anna@example.com' } }));
  });
});

describe('Making a reset link', () => {
  it('gives an admin a link for another adult in the family', async () => {
    const { service, created } = build();

    const { link, expiresAt } = await service.createForMember(admin(), 'mem_martin', 'https://fam.example');

    expect(link.startsWith('https://fam.example/reset/')).toBe(true);
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());
    // The token itself is never stored - only its hash.
    const token = link.split('/reset/')[1];
    expect(created[0].tokenHash).toBe(hash(token));
    expect(JSON.stringify(created)).not.toContain(token);
  });

  it('refuses anybody who is not an admin', async () => {
    const { service } = build();

    await expect(
      service.createForMember(admin({ role: MemberRole.member }), 'mem_martin', 'https://x'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('only looks inside the admin’s own family', async () => {
    const { service, prisma } = build({ member: null });

    await expect(service.createForMember(admin(), 'mem_elsewhere', 'https://x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.member.findFirst.mock.calls[0][0].where).toMatchObject({ familyId: 'fam_1' });
  });

  it('refuses a child profile, which has no password', async () => {
    const { service } = build({ member: { id: 'mem_emily', role: MemberRole.child, userId: null } });

    await expect(service.createForMember(admin(), 'mem_emily', 'https://x')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('tells the person, so it can never happen quietly', async () => {
    const { service, prisma, audit } = build();

    await service.createForMember(admin(), 'mem_martin', 'https://x');

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        memberId: 'mem_martin',
        kind: 'password_reset_created',
        actorMemberId: 'mem_anna',
      }),
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'account.password_reset_link' }),
    );
  });

  it('voids any earlier link for the same person', async () => {
    const { service, prisma } = build();

    await service.createForMember(admin(), 'mem_martin', 'https://x');

    expect(prisma.passwordReset.updateMany.mock.calls[0][0].where).toEqual({
      userId: 'usr_martin',
      usedAt: null,
    });
  });
});

describe('Using a reset link', () => {
  const good = { id: 'rst_1', userId: 'usr_martin', expiresAt: new Date(Date.now() + 60_000), usedAt: null };
  const token = 'a'.repeat(43);

  it('sets the password and ends every session', async () => {
    const { service, prisma, tokens } = build({ reset: good });

    await service.complete(token, 'a new password');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'usr_martin' },
      data: { passwordHash: 'scrypt$new' },
    });
    // Whoever the account really belongs to is signed out and notices.
    expect(tokens.revokeAllForUser).toHaveBeenCalledWith('usr_martin');
  });

  it('refuses a short password before touching anything', async () => {
    const { service, prisma } = build({ reset: good });

    await expect(service.complete(token, 'short')).rejects.toMatchObject({
      response: { code: 'weak_password' },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('refuses a link that has already been used', async () => {
    const { service } = build({ reset: { ...good, usedAt: new Date() } });

    await expect(service.complete(token, 'a new password')).rejects.toMatchObject({
      response: { code: 'reset_link_invalid' },
    });
  });

  it('refuses a link that has expired', async () => {
    const { service } = build({ reset: { ...good, expiresAt: new Date(Date.now() - 1000) } });

    await expect(service.complete(token, 'a new password')).rejects.toMatchObject({
      response: { code: 'reset_link_invalid' },
    });
  });

  it('lets only one of two tabs with the same link set a password', async () => {
    const { service, prisma } = build({ reset: good, claimed: 0 });

    await expect(service.complete(token, 'a new password')).rejects.toMatchObject({
      response: { code: 'reset_link_invalid' },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('says whether a link is good without saying whose it is', async () => {
    const { service } = build({ reset: good });

    expect(await service.check(token)).toEqual({ valid: true });
  });
});
