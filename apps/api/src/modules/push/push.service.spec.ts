import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { NotificationKind, Platform } from '@prisma/client';

import type { PrismaService } from '../../common/prisma.service';
import type { PushMessage } from './push-messages';
import { PushService } from './push.service';
import type { PushOutcome, PushTransport } from './transports';

/**
 * Push follows the bell: it is handed the people NotificationsService chose
 * and knocks on their phones. What is tested here is the part between - which
 * phones those are, which door each goes through, and that a phone which no
 * longer takes pushes is forgotten.
 */

function fakeTransport(outcome: PushOutcome) {
  const sent: { token: string; message: PushMessage }[] = [];
  const transport: PushTransport = {
    configured: true,
    send: async (token, message) => {
      sent.push({ token, message });
      return outcome;
    },
  };
  return { transport, sent };
}

const IOS_TOKEN = 'a'.repeat(64);

function build(env: Record<string, string> = {}) {
  const prisma = {
    member: {
      findMany: jest.fn().mockResolvedValue([{ userId: 'usr_anna' }, { userId: 'usr_anna' }, { userId: 'usr_vera' }]),
    },
    device: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'dev_iphone', platform: Platform.ios, pushToken: IOS_TOKEN, locale: 'lv' },
        { id: 'dev_android', platform: Platform.android, pushToken: 'fcm:old-token-1234567890', locale: 'en' },
      ]),
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const config = { get: (name: string) => env[name] } as unknown as ConfigService;
  const service = new PushService(prisma as unknown as PrismaService, config);
  return { service, prisma };
}

describe('Knocking on the phones of the people the bell chose', () => {
  it('without keys it is off, and asks the database nothing', async () => {
    const { service, prisma } = build();
    expect(service.configured).toBe(false);
    expect(await service.toMembers(['mem_anna'], NotificationKind.event_created)).toBe(0);
    expect(prisma.member.findMany).not.toHaveBeenCalled();
  });

  it("each phone through its own door, in its own language; one no longer taking pushes is forgotten", async () => {
    const { service, prisma } = build();
    const apple = fakeTransport('sent');
    const google = fakeTransport('unregistered');
    service.useTransports({ apns: apple.transport, fcm: google.transport });

    const sent = await service.toMembers(['mem_anna', 'mem_vera'], NotificationKind.event_reminder, {
      eventId: 'evt_1',
    });

    expect(sent).toBe(1);
    // The accounts behind the members, each once.
    expect(prisma.device.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: { in: ['usr_anna', 'usr_vera'] } }) }),
    );
    expect(apple.sent).toEqual([
      {
        token: IOS_TOKEN,
        message: {
          title: 'Atgādinājums',
          body: 'Drīz kaut kas notiek. Atver FamStory, lai redzētu.',
          data: { kind: 'event_reminder', eventId: 'evt_1' },
        },
      },
    ]);
    expect(google.sent[0].message.title).toBe('Reminder');
    expect(prisma.device.deleteMany).toHaveBeenCalledWith({ where: { id: 'dev_android' } });
  });

  it('never throws: the bell is already written, a failed push is only a push that did not arrive', async () => {
    const { service, prisma } = build();
    service.useTransports({ apns: fakeTransport('sent').transport });
    prisma.member.findMany.mockRejectedValueOnce(new Error('database away'));
    await expect(service.toMembers(['mem_anna'], NotificationKind.event_created)).resolves.toBe(0);
  });
});

describe('A phone registering', () => {
  it('takes an iPhone or an Android, with a token that looks like one', async () => {
    const { service } = build();
    await expect(service.register('usr_anna', { platform: 'web', token: IOS_TOKEN })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.register('usr_anna', { platform: 'ios', token: 'short' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.register('usr_anna', { platform: 'android', token: 'has spaces in it, so no' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('moves a phone to whoever signed in on it last, and keeps its language', async () => {
    const { service, prisma } = build();
    await service.register('usr_vera', { platform: 'ios', token: IOS_TOKEN, locale: 'lv' });
    expect(prisma.device.upsert).toHaveBeenCalledWith({
      where: { pushToken: IOS_TOKEN },
      create: { userId: 'usr_vera', platform: Platform.ios, pushToken: IOS_TOKEN, locale: 'lv' },
      update: expect.objectContaining({ userId: 'usr_vera', platform: Platform.ios, locale: 'lv' }),
    });
  });

  it('signing out removes only this account’s phone', async () => {
    const { service, prisma } = build();
    await service.unregister('usr_anna', IOS_TOKEN);
    expect(prisma.device.deleteMany).toHaveBeenCalledWith({ where: { userId: 'usr_anna', pushToken: IOS_TOKEN } });
  });
});
