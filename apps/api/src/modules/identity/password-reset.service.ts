import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MemberRole, MemberStatus, NotificationKind } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';

import { AuditService } from '../../common/audit.service';
import { MailService } from '../../common/mail.service';
import { PrismaService } from '../../common/prisma.service';
import { PushService } from '../push/push.service';
import type { ViewerContext } from '../visibility/visibility.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

/**
 * A WAY BACK INTO AN ACCOUNT (item 35).
 *
 * A forgotten password was permanent. There is no email sender configured,
 * so the usual "we sent you a link" had nothing to send with - and behind
 * the account is a family's archive.
 *
 * The answer that works before email exists is the one families already use
 * for everything else: ask the person who set it up. A family admin can make
 * a one-time link for another adult in the family and hand it over - read out,
 * sent in a message, or shown as a QR code across the kitchen table. The email
 * flow (requestByEmail, below), where the server has a mail provider, uses
 * exactly these rows - and the admin's way stays for everybody else, and for
 * an address that no longer works.
 *
 * WHAT THIS IS, SAID PLAINLY: a way for an admin to set another adult's
 * password, which is a way into their account. That is inherent to any
 * admin-assisted recovery, and the defences are the ones that work in a
 * family rather than in a bank:
 *
 *   - it cannot happen quietly: the person is notified the moment a link is
 *     made, and using it signs them out everywhere, so a stolen account is an
 *     account they notice they cannot reach;
 *   - it is written to the audit log with who made it;
 *   - it only reaches adults with an account in the admin's own family. Not
 *     another family, not a child profile (which has no password), and not
 *     somebody who has left.
 *
 * The link is single-use, lives 24 hours, voids any earlier unused one, and
 * only its hash is stored.
 */

/** Long enough to find the person and hand it over; short enough to go stale. */
const RESET_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * A link that went by email lives an hour: it was asked for by somebody at
 * their inbox, and a mailbox is a place links are found later by others.
 */
const EMAIL_RESET_TTL_MS = 60 * 60 * 1000;

/** One email per account in this long, however often the form is sent. */
const EMAIL_RESET_SPACING_MS = 5 * 60 * 1000;

/** The same floor registration enforces (auth.service.ts). */
const MIN_PASSWORD_LENGTH = 8;

/** What the email says, in the account's language. No name, nothing of the family's. */
const RESET_EMAIL = {
  lv: {
    subject: 'FamStory: paroles atjaunošana',
    text: (link: string) =>
      `Sveiki!\n\nKāds - cerams, tu - palūdza jaunu paroli FamStory kontam ar šo e-pasta adresi. Jaunu paroli vari iestatīt šeit (saite der vienu reizi, vienu stundu):\n\n${link}\n\nJa to nelūdzi tu, šo vēstuli vari droši ignorēt: parole paliek tā pati.\n\nFamStory`,
  },
  en: {
    subject: 'FamStory: setting a new password',
    text: (link: string) =>
      `Hello,\n\nSomebody - hopefully you - asked for a new password for the FamStory account with this email address. You can set one here (the link works once, for one hour):\n\n${link}\n\nIf it was not you, you can ignore this email: your password stays as it is.\n\nFamStory`,
  },
} as const;

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    @Optional() private readonly push?: PushService,
  ) {}

  /**
   * The public site the emailed link opens - the same address the app's own
   * links use (SITE_ORIGIN, https://famstory.lv on the server). Never the
   * request's Host header: this endpoint is public, and a forged Host would
   * send somebody's reset link to a page of the forger's choosing.
   */
  private get site(): string {
    const origin = (this.config.get<string>('SITE_ORIGIN') ?? '').trim().replace(/\/+$/, '');
    return /^https:\/\/[^/\s]+$/.test(origin) ? origin : '';
  }

  /** Whether "forgot your password?" can be answered by email on this server. */
  get emailAvailable(): boolean {
    return this.mail.configured && this.site !== '';
  }

  /**
   * "Forgot your password?" with an email sender: a link to the account's own
   * address.
   *
   * The answer is the same whether or not the address has an account - and
   * so is its timing: the address is checked here, and the looking up and
   * the sending happen after the reply has gone, so neither the words nor
   * the time it took say whether somebody is on FamStory. One email per
   * account per five minutes, whoever asks; the route's own limit counts the
   * asker.
   */
  async requestByEmail(email: unknown, now = new Date()): Promise<void> {
    if (!this.emailAvailable) {
      throw new ServiceUnavailableException({
        code: 'mail_unavailable',
        message: 'Password links by email are not set up on this server. A family admin can make one.',
      });
    }
    const address = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) || address.length > 254) {
      throw new BadRequestException({ code: 'invalid_email', message: 'That does not look like an email address.' });
    }
    setImmediate(() => {
      void this.sendLink(address, now).catch((error: unknown) =>
        this.logger.error('Could not send a password link', error as Error),
      );
    });
  }

  /** The part after the reply. Exported for the tests, which await it. */
  async sendLink(address: string, now = new Date()): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { email: address },
      select: { id: true, locale: true, passwordHash: true },
    });
    // No account, or one that signs in with Google or Apple and has no password.
    if (!user || !user.passwordHash) return false;

    const recent = await this.prisma.passwordReset.findFirst({
      where: {
        userId: user.id,
        createdByMemberId: null,
        createdAt: { gt: new Date(now.getTime() - EMAIL_RESET_SPACING_MS) },
      },
      select: { id: true },
    });
    if (recent) return false;

    const token = randomBytes(32).toString('base64url');
    await this.prisma.$transaction([
      // As with an admin's link: a new one voids the old, one way in at a time.
      this.prisma.passwordReset.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: now },
      }),
      this.prisma.passwordReset.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(token),
          createdByMemberId: null,
          expiresAt: new Date(now.getTime() + EMAIL_RESET_TTL_MS),
        },
      }),
    ]);

    const words = user.locale === 'lv' ? RESET_EMAIL.lv : RESET_EMAIL.en;
    await this.mail.send({
      to: address,
      subject: words.subject,
      text: words.text(`${this.site}/reset/${token}`),
    });

    await this.audit.record({
      userId: user.id,
      action: 'account.password_reset_email',
      entityType: 'User',
      entityId: user.id,
    });
    return true;
  }

  /** An admin makes a link for another adult in their family. */
  async createForMember(
    ctx: ViewerContext,
    memberId: string,
    baseUrl: string,
  ): Promise<{ link: string; expiresAt: string }> {
    if (ctx.role !== MemberRole.admin) {
      throw new ForbiddenException({
        code: 'insufficient_role',
        message: 'Only a family admin can make a password reset link.',
      });
    }

    const member = await this.prisma.member.findFirst({
      where: { id: memberId, familyId: ctx.familyId, status: MemberStatus.active },
      select: { id: true, role: true, userId: true },
    });

    // One answer for "not in this family" and "no such member": a link must
    // not become a way to probe which ids exist elsewhere.
    if (!member) {
      throw new NotFoundException({ code: 'member_not_found', message: 'Member not found.' });
    }

    if (member.role === MemberRole.child || !member.userId) {
      throw new BadRequestException({
        code: 'no_account',
        message: 'This profile has no account, so it has no password to reset.',
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: member.userId },
      select: { passwordHash: true, deletedAt: true },
    });

    if (!user || user.deletedAt) {
      throw new NotFoundException({ code: 'member_not_found', message: 'Member not found.' });
    }

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + RESET_TTL_MS);

    await this.prisma.$transaction([
      // Making a new link voids the old one: there is only ever one way in.
      this.prisma.passwordReset.updateMany({
        where: { userId: member.userId, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.passwordReset.create({
        data: {
          userId: member.userId,
          tokenHash: hashToken(token),
          createdByMemberId: ctx.memberId,
          expiresAt,
        },
      }),
      // It cannot happen quietly - see the class comment.
      this.prisma.notification.create({
        data: {
          familyId: ctx.familyId,
          memberId: member.id,
          kind: NotificationKind.password_reset_created,
          actorMemberId: ctx.memberId,
        },
      }),
    ]);

    await this.audit.record({
      familyId: ctx.familyId,
      userId: member.userId,
      action: 'account.password_reset_link',
      entityType: 'Member',
      entityId: member.id,
      metadata: { byMemberId: ctx.memberId },
    });
    // On their phone too, if they allowed it: the sooner they know, the
    // sooner a link they did not ask for is noticed.
    void this.push?.toMembers([member.id], NotificationKind.password_reset_created);

    return {
      link: `${baseUrl.replace(/\/+$/, '')}/reset/${token}`,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /** Is this link still good? Answers nothing else about the account. */
  async check(token: string): Promise<{ valid: boolean }> {
    const reset = await this.find(token);
    return { valid: Boolean(reset) };
  }

  /**
   * Set the new password.
   *
   * Every session ends, on every device. That is the half of the design that
   * makes misuse visible: whoever the account really belongs to finds
   * themselves signed out, and the notification tells them who made the link.
   */
  async complete(token: string, password: string): Promise<void> {
    if ((password ?? '').length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException({
        code: 'weak_password',
        message: `A password needs at least ${MIN_PASSWORD_LENGTH} characters.`,
      });
    }

    const reset = await this.find(token);
    if (!reset) {
      throw new NotFoundException({
        code: 'reset_link_invalid',
        message: 'This link has expired or has already been used.',
      });
    }

    // Claimed first, so two tabs with the same link cannot both set a password.
    const claimed = await this.prisma.passwordReset.updateMany({
      where: { id: reset.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) {
      throw new NotFoundException({
        code: 'reset_link_invalid',
        message: 'This link has expired or has already been used.',
      });
    }

    await this.prisma.user.update({
      where: { id: reset.userId },
      data: { passwordHash: await this.passwords.hash(password) },
    });

    await this.tokens.revokeAllForUser(reset.userId);

    await this.audit.record({
      userId: reset.userId,
      action: 'account.password_reset',
      entityType: 'User',
      entityId: reset.userId,
    });
  }

  private async find(token: string) {
    if (!token || token.length < 20) return null;

    const reset = await this.prisma.passwordReset.findUnique({
      where: { tokenHash: hashToken(token) },
      select: { id: true, userId: true, expiresAt: true, usedAt: true },
    });

    if (!reset || reset.usedAt || reset.expiresAt < new Date()) return null;
    return reset;
  }
}

/** Only the hash is stored - a leaked database yields no usable links. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
