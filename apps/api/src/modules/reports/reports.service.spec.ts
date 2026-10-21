import { BadRequestException, ForbiddenException, HttpException } from '@nestjs/common';
import { MemberRole } from '@prisma/client';

import type { PrismaService } from '../../common/prisma.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { VisibilityService, ViewerContext } from '../visibility/visibility.service';
import { REPORTS_PER_HOUR, ReportsService } from './reports.service';

/**
 * Reports.
 *
 * The property under test, as with comments: a report goes through the
 * event's own visibility check first, and nothing about the event is read
 * or answered for somebody it is not shown to. Then the product's rules: not
 * your own, once, not a flood, and the admins told without the reporter.
 */

const ME: ViewerContext = { memberId: 'mem_me', familyId: 'fam_1', role: MemberRole.member, groupIds: [] };

function harness(options: {
  canSee?: boolean;
  event?: { authorMemberId: string } | null;
  comment?: { id: string; eventId: string; authorMemberId: string } | null;
  open?: { id: string } | null;
  lastHour?: number;
} = {}) {
  const order: string[] = [];
  const assertCanOpenEvent = jest.fn().mockImplementation(() => {
    order.push('visibility');
    if (options.canSee === false) {
      return Promise.reject(new ForbiddenException({ code: 'visibility_denied', message: 'Event not available.' }));
    }
    return Promise.resolve();
  });
  const prisma = {
    event: {
      findFirst: jest.fn().mockImplementation(() => {
        order.push('event');
        return Promise.resolve(options.event === undefined ? { authorMemberId: 'mem_author' } : options.event);
      }),
    },
    comment: { findFirst: jest.fn().mockResolvedValue(options.comment ?? null) },
    contentReport: {
      findFirst: jest.fn().mockResolvedValue(options.open ?? null),
      count: jest.fn().mockResolvedValue(options.lastHour ?? 0),
      create: jest.fn().mockResolvedValue({ id: 'rep_new' }),
    },
  };
  const notifications = { contentReported: jest.fn().mockResolvedValue(undefined) };
  const service = new ReportsService(
    prisma as unknown as PrismaService,
    { assertCanOpenEvent } as unknown as VisibilityService,
    notifications as unknown as NotificationsService,
  );
  return { service, prisma, notifications, assertCanOpenEvent, order };
}

describe('ReportsService - only what you can see', () => {
  it('asks the event visibility before reading anything about the event', async () => {
    const h = harness();
    await h.service.create(ME, { target: 'event', id: 'evt_1', reason: 'spam' });
    expect(h.order).toEqual(['visibility', 'event']);
    expect(h.assertCanOpenEvent).toHaveBeenCalledWith(ME, 'evt_1');
  });

  it('refuses an event the reporter cannot see, and reads nothing of it', async () => {
    const h = harness({ canSee: false });
    await expect(h.service.create(ME, { target: 'event', id: 'evt_hidden', reason: 'spam' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(h.prisma.event.findFirst).not.toHaveBeenCalled();
    expect(h.prisma.contentReport.create).not.toHaveBeenCalled();
  });

  it('gives a comment that does not exist the same answer as one that is not shown', async () => {
    const missing = harness({ comment: null });
    const hidden = harness({ comment: { id: 'cmt_1', eventId: 'evt_1', authorMemberId: 'mem_author' }, canSee: false });
    const a = await missing.service.create(ME, { target: 'comment', id: 'cmt_x', reason: 'spam' }).catch((e) => e);
    const b = await hidden.service.create(ME, { target: 'comment', id: 'cmt_1', reason: 'spam' }).catch((e) => e);
    expect(a).toBeInstanceOf(ForbiddenException);
    expect(b).toBeInstanceOf(ForbiddenException);
    expect((a as ForbiddenException).getResponse()).toEqual((b as ForbiddenException).getResponse());
  });

  it('checks a comment against the visibility of the event it is on', async () => {
    const h = harness({ comment: { id: 'cmt_1', eventId: 'evt_9', authorMemberId: 'mem_author' } });
    await h.service.create(ME, { target: 'comment', id: 'cmt_1', reason: 'harassment' });
    expect(h.assertCanOpenEvent).toHaveBeenCalledWith(ME, 'evt_9');
    expect(h.prisma.contentReport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ target: 'comment', eventId: 'evt_9', commentId: 'cmt_1' }),
      }),
    );
  });

  it('refuses an event that is gone from the family as if it were not shown', async () => {
    const h = harness({ event: null });
    await expect(h.service.create(ME, { target: 'event', id: 'evt_gone', reason: 'spam' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

describe('ReportsService - the rules', () => {
  it('does not take a report of your own entry or comment', async () => {
    const own = harness({ event: { authorMemberId: 'mem_me' } });
    await expect(own.service.create(ME, { target: 'event', id: 'evt_1', reason: 'other' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const ownComment = harness({ comment: { id: 'cmt_1', eventId: 'evt_1', authorMemberId: 'mem_me' } });
    await expect(
      ownComment.service.create(ME, { target: 'comment', id: 'cmt_1', reason: 'other' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps one open report per person per thing, and tells nobody twice', async () => {
    const h = harness({ open: { id: 'rep_old' } });
    await expect(h.service.create(ME, { target: 'event', id: 'evt_1', reason: 'spam' })).resolves.toEqual({ id: 'rep_old' });
    expect(h.prisma.contentReport.create).not.toHaveBeenCalled();
    expect(h.notifications.contentReported).not.toHaveBeenCalled();
  });

  it('stops a flood', async () => {
    const h = harness({ lastHour: REPORTS_PER_HOUR });
    const error = await h.service.create(ME, { target: 'event', id: 'evt_1', reason: 'spam' }).catch((e) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
  });

  it('keeps the report and tells the admins, naming the reporter only to the service', async () => {
    const h = harness();
    await expect(
      h.service.create(ME, { target: 'event', id: 'evt_1', reason: 'inappropriate', note: '  not for here  ' }),
    ).resolves.toEqual({ id: 'rep_new' });
    expect(h.prisma.contentReport.create).toHaveBeenCalledWith({
      data: {
        familyId: 'fam_1',
        reporterMemberId: 'mem_me',
        target: 'event',
        eventId: 'evt_1',
        commentId: null,
        reason: 'inappropriate',
        note: 'not for here',
      },
      select: { id: true },
    });
    expect(h.notifications.contentReported).toHaveBeenCalledWith('fam_1', 'evt_1', 'mem_me', 'mem_author');
  });
});

describe('ReportsService - what a request may be', () => {
  it.each([
    [{ target: 'member', id: 'x', reason: 'spam' }],
    [{ target: 'event', id: '', reason: 'spam' }],
    [{ target: 'event', id: 'evt_1', reason: 'boring' }],
    [{ target: 'event', id: 'evt_1', reason: 'spam', note: 42 }],
    [{}],
  ])('refuses %j', async (input) => {
    const h = harness();
    await expect(h.service.create(ME, input)).rejects.toBeInstanceOf(BadRequestException);
    expect(h.assertCanOpenEvent).not.toHaveBeenCalled();
  });

  it('refuses a note longer than 500 characters, and keeps an empty one as none', async () => {
    const long = harness();
    await expect(
      long.service.create(ME, { target: 'event', id: 'evt_1', reason: 'other', note: 'x'.repeat(501) }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const empty = harness();
    await empty.service.create(ME, { target: 'event', id: 'evt_1', reason: 'other', note: '   ' });
    expect(empty.prisma.contentReport.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ note: null }) }),
    );
  });
});
