import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ReportReason, ReportTarget } from '@prisma/client';

import { PrismaService } from '../../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { VisibilityService, type ViewerContext } from '../visibility/visibility.service';

/** A note longer than this is a letter, and the operator reads these one by one. */
export const REPORT_NOTE_MAX = 500;

/** Enough for anybody with a real reason; a flood is something else. */
export const REPORTS_PER_HOUR = 20;

const HOUR_MS = 60 * 60 * 1000;

export interface ReportInput {
  target?: unknown;
  id?: unknown;
  reason?: unknown;
  note?: unknown;
}

/**
 * REPORTS: "this should not be here", for an entry or a comment.
 *
 * App Review guideline 1.2 asks an app whose people post things for a way to
 * report what they post (docs/09-APP-STORES.md §3.3). In a family the
 * people who act on a report are the family's admins, who can already delete
 * any entry or comment and remove a member. So a report tells them, and it
 * tells the operator, who reads every one (scripts/reports.ts).
 *
 * The rules (docs/02-DATA-MODEL.md, Reports):
 *
 *   - Only what the reporter can see. The check is the one opening the event
 *     goes through, and it comes first, before anything about the event is
 *     read. Something that does not exist and something not shown to this
 *     person get the same answer, so a report can never be a way to learn
 *     what is there.
 *   - Not your own. What you wrote you can delete.
 *   - Once: the same person reporting the same thing again, while the first
 *     report is open, gets the first one back.
 *   - The admins are told without the reporter (notifications.service.ts).
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visibility: VisibilityService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(ctx: ViewerContext, input: ReportInput): Promise<{ id: string }> {
    const { target, id, reason, note } = this.read(input);

    // What was reported, and the event it belongs to. The event's own
    // visibility is asked before anything is decided or answered.
    let eventId: string;
    let commentId: string | null = null;
    let authorMemberId: string | undefined;
    if (target === ReportTarget.comment) {
      const comment = await this.prisma.comment.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, eventId: true, authorMemberId: true },
      });
      if (!comment) throw unseen();
      eventId = comment.eventId;
      commentId = comment.id;
      authorMemberId = comment.authorMemberId;
    } else {
      eventId = id;
    }

    await this.visibility.assertCanOpenEvent(ctx, eventId);

    if (target === ReportTarget.event) {
      const event = await this.prisma.event.findFirst({
        where: { id: eventId, familyId: ctx.familyId, deletedAt: null },
        select: { authorMemberId: true },
      });
      authorMemberId = event?.authorMemberId;
    }
    if (!authorMemberId) throw unseen();

    if (authorMemberId === ctx.memberId) {
      throw new BadRequestException({
        code: 'own_content',
        message: 'What you wrote yourself you can delete.',
      });
    }

    const open = await this.prisma.contentReport.findFirst({
      where: { reporterMemberId: ctx.memberId, eventId, commentId, resolvedAt: null },
      select: { id: true },
    });
    if (open) return { id: open.id };

    const lastHour = await this.prisma.contentReport.count({
      where: { reporterMemberId: ctx.memberId, createdAt: { gte: new Date(Date.now() - HOUR_MS) } },
    });
    if (lastHour >= REPORTS_PER_HOUR) {
      throw new HttpException(
        { code: 'too_many_reports', message: 'That is a lot of reports for one hour. Try again later.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const report = await this.prisma.contentReport.create({
      data: {
        familyId: ctx.familyId,
        reporterMemberId: ctx.memberId,
        target,
        eventId,
        commentId,
        reason,
        note,
      },
      select: { id: true },
    });

    // Not awaited, and it never throws: the report is kept whatever the bell does.
    void this.notifications.contentReported(ctx.familyId, eventId, ctx.memberId, authorMemberId);

    return { id: report.id };
  }

  /** The request as the four things it may be. Anything else is refused, not guessed at. */
  private read(input: ReportInput): { target: ReportTarget; id: string; reason: ReportReason; note: string | null } {
    const target = input.target;
    if (target !== ReportTarget.event && target !== ReportTarget.comment) {
      throw new BadRequestException({ code: 'invalid_report', message: 'Report an event or a comment.' });
    }
    if (typeof input.id !== 'string' || input.id.trim() === '' || input.id.length > 64) {
      throw new BadRequestException({ code: 'invalid_report', message: 'Which one is missing.' });
    }
    const reason = input.reason;
    if (typeof reason !== 'string' || !Object.values(ReportReason).includes(reason as ReportReason)) {
      throw new BadRequestException({ code: 'invalid_report', message: 'A reason is needed.' });
    }
    let note: string | null = null;
    if (input.note !== undefined && input.note !== null) {
      if (typeof input.note !== 'string') {
        throw new BadRequestException({ code: 'invalid_report', message: 'A note is text.' });
      }
      const trimmed = input.note.trim();
      if (trimmed.length > REPORT_NOTE_MAX) {
        throw new BadRequestException({
          code: 'note_too_long',
          message: `A note is at most ${REPORT_NOTE_MAX} characters.`,
        });
      }
      note = trimmed === '' ? null : trimmed;
    }
    return { target, id: input.id.trim(), reason: reason as ReportReason, note };
  }
}

/** The same answer the visibility check gives - for a comment that is not there, too. */
function unseen(): ForbiddenException {
  return new ForbiddenException({ code: 'visibility_denied', message: 'Event not available.' });
}
