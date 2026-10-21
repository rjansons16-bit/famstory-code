import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Platform, type NotificationKind } from '@prisma/client';

import { PrismaService } from '../../common/prisma.service';
import { pushMessage } from './push-messages';
import { ApnsTransport, FcmTransport, fcmAccountFrom, pemFrom, type PushTransport } from './transports';

/**
 * PUSH: the bell's news on the phone's lock screen, for whoever let the app
 * send them.
 *
 * It follows the bell and never decides anything itself. NotificationsService
 * chooses who hears about what - the visibility filter, each person's own
 * switches, blocks, nobody told in the name of somebody gone - and writes the
 * rows; this tells the phones of exactly those people, with a line that holds
 * nothing the family wrote (push-messages.ts).
 *
 * A device is a phone that registered its token after the person said yes
 * (`POST /users/me/devices`); signing out removes it, and a phone that
 * stopped taking pushes removes itself the first time one is refused. Off
 * until the server has the keys (APNS_*, FCM_SERVICE_ACCOUNT): then it is a
 * device table nothing reads, which is what the LAN host has.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private apns: PushTransport;
  private fcm: PushTransport;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const read = (name: string) => (config.get<string>(name) ?? '').trim();
    this.apns = new ApnsTransport({
      keyPem: pemFrom(read('APNS_KEY')),
      keyId: read('APNS_KEY_ID'),
      // The same ten characters the app links already need.
      teamId: read('APNS_TEAM_ID') || read('APPLE_TEAM_ID'),
      topic: read('APNS_TOPIC') || 'lv.famstory.app',
      sandbox: read('APNS_SANDBOX') === 'true',
    });
    this.fcm = new FcmTransport(fcmAccountFrom(read('FCM_SERVICE_ACCOUNT')));
  }

  get configured(): boolean {
    return this.apns.configured || this.fcm.configured;
  }

  /** For tests: transports that record instead of connecting. */
  useTransports(transports: { apns?: PushTransport; fcm?: PushTransport }): void {
    if (transports.apns) this.apns = transports.apns;
    if (transports.fcm) this.fcm = transports.fcm;
  }

  /**
   * A phone's token, after its person said yes. The token is the phone's
   * address for pushes and nothing else; a phone that changes hands moves to
   * whoever signed in on it last.
   */
  async register(userId: string, input: { platform?: unknown; token?: unknown; locale?: unknown }): Promise<void> {
    const platform =
      input.platform === 'ios' ? Platform.ios : input.platform === 'android' ? Platform.android : null;
    if (!platform) {
      throw new BadRequestException({ code: 'invalid_platform', message: 'A device is "ios" or "android".' });
    }
    const token = typeof input.token === 'string' ? input.token.trim() : '';
    // An APNs token is hex; an FCM token is a long run of URL-safe text.
    const looksRight =
      platform === Platform.ios ? /^[0-9a-fA-F]{64,200}$/.test(token) : /^[\w:.-]{20,4096}$/.test(token);
    if (!looksRight) {
      throw new BadRequestException({ code: 'invalid_token', message: 'That is not a push token.' });
    }
    const locale = input.locale === 'lv' ? 'lv' : 'en';

    await this.prisma.device.upsert({
      where: { pushToken: token },
      create: { userId, platform, pushToken: token, locale },
      update: { userId, platform, locale, lastSeenAt: new Date() },
    });
  }

  /** Signing out on this phone: it stops getting this account's news. */
  async unregister(userId: string, token: string): Promise<void> {
    await this.prisma.device.deleteMany({ where: { userId, pushToken: token } });
  }

  /**
   * Tell these members' phones about one notification each. Never throws -
   * the bell's row is already written, and a push that fails is a push that
   * did not arrive, not an error anybody sees.
   */
  async toMembers(memberIds: string[], kind: NotificationKind, data: { eventId?: string | null } = {}): Promise<number> {
    if (memberIds.length === 0 || !this.configured) return 0;
    try {
      const members = await this.prisma.member.findMany({
        where: { id: { in: memberIds }, userId: { not: null } },
        select: { userId: true },
      });
      const userIds = [...new Set(members.map((m) => m.userId as string))];
      if (userIds.length === 0) return 0;

      const devices = await this.prisma.device.findMany({
        where: { userId: { in: userIds }, platform: { in: [Platform.ios, Platform.android] } },
        select: { id: true, platform: true, pushToken: true, locale: true },
      });

      let sent = 0;
      for (const device of devices) {
        const transport = device.platform === Platform.ios ? this.apns : this.fcm;
        if (!transport.configured) continue;
        const outcome = await transport.send(device.pushToken, pushMessage(kind, device.locale, data));
        if (outcome === 'sent') sent += 1;
        else if (outcome === 'unregistered') await this.prisma.device.deleteMany({ where: { id: device.id } });
      }
      return sent;
    } catch (error) {
      this.logger.error(`Could not push ${kind}`, error as Error);
      return 0;
    }
  }
}
