import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MemberRole, ReactionKind } from '@prisma/client';

import { LIMITS } from '../../common/input';
import type { PrismaService } from '../../common/prisma.service';
import type { NotificationsService } from '../notifications/notifications.service';
import { VisibilityService, type ViewerContext } from '../visibility/visibility.service';
import { CommentsService } from './comments.service';

/**
 * Comments service tests.
 *
 * The property under test: EVERY path goes through the event visibility
 * check. If any method skips it, the comments endpoint becomes a way around
 * visibility control — the comments reveal both that the event exists and
 * what it is about.
 *
 * So this file does not only test "does it return the right data", but also
 * "was permission asked for at all".
 */

function ctx(role: MemberRole = MemberRole.member): ViewerContext {
  return { memberId: 'mem_me', familyId: 'fam_1', role, groupIds: ['grp_parents'] };
}

interface Harness {
  service: CommentsService;
  visibility: VisibilityService;
  assertCanSee: jest.Mock;
  prisma: {
    comment: Record<string, jest.Mock>;
    reaction: Record<string, jest.Mock>;
  };
}

function harness(options: { canSee?: boolean; comment?: unknown; reaction?: unknown } = {}): Harness {
  const canSee = options.canSee ?? true;

  const assertCanSee = jest.fn().mockImplementation(() => {
    if (!canSee) {
      return Promise.reject(
        new ForbiddenException({ code: 'visibility_denied', message: 'Event not available.' }),
      );
    }
    return Promise.resolve();
  });

  const prisma = {
    comment: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(options.comment ?? null),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'cmt_new', ...data })),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'cmt_1', ...data })),
    },
    reaction: {
      findUnique: jest.fn().mockResolvedValue(options.reaction ?? null),
      delete: jest.fn().mockResolvedValue({}),
      upsert: jest.fn().mockImplementation(({ create }) => Promise.resolve(create)),
    },
  };

  const visibility = new VisibilityService(prisma as unknown as PrismaService);
  visibility.assertCanSeeEvent = assertCanSee;
  // A time capsule's contents are one more gate on the same path; these tests
  // are about the gate itself, so both halves answer as the stand-in does.
  visibility.assertCanOpenEvent = assertCanSee;
  const notifications = { eventCreated: jest.fn(), commentAdded: jest.fn(), memberJoined: jest.fn() } as unknown as NotificationsService;

  return {
    service: new CommentsService(prisma as unknown as PrismaService, visibility, notifications),
    visibility,
    assertCanSee,
    prisma,
  };
}

// ---------------------------------------------------------------------------

describe('CommentsService — the visibility gate', () => {
  it('listing checks visibility before reading', async () => {
    const h = harness();
    await h.service.list(ctx(), 'evt_1');
    expect(h.assertCanSee).toHaveBeenCalledWith(expect.anything(), 'evt_1');
  });

  it('comments on an invisible event are not returned', async () => {
    const h = harness({ canSee: false });
    await expect(h.service.list(ctx(), 'evt_1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.prisma.comment.findMany).not.toHaveBeenCalled();
  });

  it('a comment cannot be added to an invisible event', async () => {
    const h = harness({ canSee: false });
    await expect(h.service.create(ctx(), 'evt_1', 'Sveiki')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(h.prisma.comment.create).not.toHaveBeenCalled();
  });

  it('neredzamam notikumam nevar pievienot reakciju', async () => {
    const h = harness({ canSee: false });
    await expect(
      h.service.toggleReaction(ctx(), 'evt_1', ReactionKind.heart),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.prisma.reaction.upsert).not.toHaveBeenCalled();
  });

  it('editing checks visibility, not just authorship', async () => {
    const h = harness({
      canSee: false,
      comment: { id: 'cmt_1', eventId: 'evt_1', authorMemberId: 'mem_me' },
    });
    // Even your own comment cannot be edited once the event is no longer
    // visible (for example, the author was removed from the group).
    await expect(h.service.update(ctx(), 'cmt_1', 'Cits teksts')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

describe('CommentsService — role capabilities', () => {
  it('a child cannot comment', async () => {
    const h = harness();
    await expect(
      h.service.create(ctx(MemberRole.child), 'evt_1', 'Sveiki'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('a viewer can comment on a visible event', async () => {
    const h = harness();
    await expect(h.service.create(ctx(MemberRole.viewer), 'evt_1', 'Cik jauki')).resolves.toBeDefined();
  });

  it('a child can react even though it cannot comment', async () => {
    const h = harness();
    await expect(
      h.service.toggleReaction(ctx(MemberRole.child), 'evt_1', ReactionKind.heart),
    ).resolves.toBeDefined();
  });
});

describe('CommentsService — saturs', () => {
  it('an empty comment is not accepted', async () => {
    const h = harness();
    await expect(h.service.create(ctx(), 'evt_1', '   ')).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.prisma.comment.create).not.toHaveBeenCalled();
  });

  it('whitespace around a comment is trimmed', async () => {
    const h = harness();
    await h.service.create(ctx(), 'evt_1', '  Cik liela izaugusi  ');
    expect(h.prisma.comment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ body: 'Cik liela izaugusi' }) }),
    );
  });

  it('a comment longer than any the app sends is refused, not stored', async () => {
    const h = harness();
    await expect(h.service.create(ctx(), 'evt_1', 'x'.repeat(LIMITS.comment + 1))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(h.prisma.comment.create).not.toHaveBeenCalled();
  });

  it('a body that is not text is a 400, not a 500', async () => {
    const h = harness();
    await expect(h.service.create(ctx(), 'evt_1', 42 as unknown as string)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('CommentsService — authorship', () => {
  const foreign = { id: 'cmt_1', eventId: 'evt_1', authorMemberId: 'mem_someone_else' };

  it('not even an administrator can edit someone else\'s comment', async () => {
    const h = harness({ comment: foreign });
    await expect(
      h.service.update(ctx(MemberRole.admin), 'cmt_1', 'Rewriting this'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('an author edits their own comment', async () => {
    const h = harness({ comment: { id: 'cmt_1', eventId: 'evt_1', authorMemberId: 'mem_me' } });
    await expect(h.service.update(ctx(), 'cmt_1', 'Labots')).resolves.toBeDefined();
  });

  it('an administrator MAY delete someone else\'s comment — that is moderation', async () => {
    const h = harness({ comment: foreign });
    await expect(h.service.remove(ctx(MemberRole.admin), 'cmt_1')).resolves.toBeDefined();
  });

  it('an ordinary member does not delete someone else\'s comment', async () => {
    const h = harness({ comment: foreign });
    await expect(h.service.remove(ctx(MemberRole.member), 'cmt_1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('deletion is soft — the row stays with deletedAt set', async () => {
    const h = harness({ comment: { id: 'cmt_1', eventId: 'evt_1', authorMemberId: 'mem_me' } });
    await h.service.remove(ctx(), 'cmt_1');
    expect(h.prisma.comment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ deletedAt: expect.any(Date) }) }),
    );
  });

  it('a comment that does not exist -> 404', async () => {
    const h = harness({ comment: null });
    await expect(h.service.update(ctx(), 'cmt_x', 'x')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('CommentsService — reakcijas', () => {
  it('the same reaction again removes it', async () => {
    const h = harness({ reaction: { eventId: 'evt_1', memberId: 'mem_me', kind: ReactionKind.heart } });
    const result = await h.service.toggleReaction(ctx(), 'evt_1', ReactionKind.heart);

    expect(result).toBeNull();
    expect(h.prisma.reaction.delete).toHaveBeenCalled();
    expect(h.prisma.reaction.upsert).not.toHaveBeenCalled();
  });

  it('a different reaction replaces it instead of adding a second', async () => {
    const h = harness({ reaction: { eventId: 'evt_1', memberId: 'mem_me', kind: ReactionKind.heart } });
    await h.service.toggleReaction(ctx(), 'evt_1', ReactionKind.clap);

    expect(h.prisma.reaction.delete).not.toHaveBeenCalled();
    expect(h.prisma.reaction.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { kind: ReactionKind.clap } }),
    );
  });

  it('the first reaction is created', async () => {
    const h = harness({ reaction: null });
    const result = await h.service.toggleReaction(ctx(), 'evt_1', ReactionKind.wow);

    expect(result).not.toBeNull();
    expect(h.prisma.reaction.upsert).toHaveBeenCalled();
  });
});
