import { Injectable } from '@nestjs/common';
import { InsightKind, InsightSource } from '@prisma/client';

import { PrismaService } from '../../common/prisma.service';
import { occurrencesBetween } from '../../common/recurrence';
import { VisibilityService, type ViewerContext } from '../visibility/visibility.service';

/** An event with no end is taken to last this long when looking for overlaps. */
const ASSUMED_DURATION_MS = 60 * 60 * 1000;

/**
 * THE AI LAYER.
 *
 * The study's risk "overestimating AI features" (medium likelihood, medium
 * impact) comes with its own mitigation: "at MVP level use only simple
 * functions: event categorisation, reminder suggestions and conflict
 * detection".
 *
 * So the MVP implementation is RULE-BASED. No model, no API call, no data
 * leaving the EU.
 *
 * The response shape (Suggestion) is identical to what an LLM would return.
 * When V2 arrives only this class changes — the API and the UI stay as they are.
 *
 * The `accept` / `reject` counters are not decoration. Without them there is no
 * data on which to decide whether the AI layer is worth monetising as a
 * separate add-on (EUR 1-3 a month).
 */
@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visibility: VisibilityService,
  ) {}

  /** Below this threshold a suggestion is not shown at all. */
  private static readonly MIN_CONFIDENCE = 0.6;

  // -------------------------------------------------------------------------
  // 1. Category suggestion
  // -------------------------------------------------------------------------

  /**
   * Keywords are STEMS, not whole words, so plurals and possessives all match a
   * single entry ("school", "schools", "school's" all hit "school").
   *
   * MUST STAY IN SYNC with apps/mobile/src/domain/categories.ts — the app
   * suggests a category offline while composing, the server suggests one on
   * request, and two different answers for the same title read as a bug.
   * Extracting both into packages/shared is item 11 in docs/07-IMPROVEMENTS.md.
   */
  private static readonly KEYWORDS: Record<string, string[]> = {
    // No bare ordinals like "first": they are modifiers, not category signals.
    // "First day of school" is education, not development.
    development: ['step', 'tooth', 'teeth', 'crawl', 'walked', 'grew', 'weigh'],
    education: ['school', 'lesson', 'exam', 'homework', 'teacher', 'nursery', 'graduation'],
    milestone: ['wedding', 'anniversar', 'moving', 'christening', 'engage'],
    health: ['doctor', 'dentist', 'appointment', 'vaccin', 'hospital', 'clinic', 'checkup', 'fever'],
    celebration: ['birthday', 'party', 'christmas', 'easter', 'new year', 'celebrat'],
    travel: ['trip', 'travel', 'holiday', 'vacation', 'flight', 'hotel', 'seaside', 'camping'],
    activity: ['practice', 'training', 'rehearsal', 'concert', 'match', 'club', 'swim'],
    chore: ['chore', 'task', 'groceries', 'shopping', 'laundry', 'repair', 'inspection'],
    finance: ['payment', 'loan', 'insurance', 'tax', 'invoice', 'mortgage', 'bill'],
  };

  async suggestCategory(
    familyId: string,
    title: string,
    description = '',
  ): Promise<StoredSuggestion | null> {
    const haystack = `${title} ${description}`.toLowerCase();
    if (haystack.trim().length < 3) return null;

    let best: { categoryId: string; hits: number; specificity: number } | null = null;

    for (const [categoryId, words] of Object.entries(AiService.KEYWORDS)) {
      const matched = words.filter((w) => haystack.includes(w));
      if (matched.length === 0) continue;

      // Specificity = the length of the longest matched stem. This breaks ties:
      // a longer stem is a more specific signal than a short generic word.
      // Without it the winner would depend on object key order, which is
      // arbitrary from the user's point of view.
      const specificity = Math.max(...matched.map((w) => w.length));

      const better =
        !best ||
        matched.length > best.hits ||
        (matched.length === best.hits && specificity > best.specificity);

      if (better) best = { categoryId, hits: matched.length, specificity };
    }

    if (!best) return null;

    // More matches -> more confidence, but never 1.0.
    // A rule-based system must not pretend to be more certain than it is.
    const confidence = Math.min(0.9, 0.6 + best.hits * 0.1);
    if (confidence < AiService.MIN_CONFIDENCE) return null;

    return this.store(familyId, {
      kind: InsightKind.category_suggestion,
      message: `This looks like "${best.categoryId}"`,
      confidence,
      payload: { categoryId: best.categoryId },
    });
  }

  // -------------------------------------------------------------------------
  // 2. Schedule conflicts
  //
  // This is not AI at all — it is interval overlap. But it is the function that
  // gives the user the most practical value, and it is exactly right every
  // time. The study lists it among the AI MVP features; we implement it as
  // logic and do not pretend there is a model behind it.
  // -------------------------------------------------------------------------

  /**
   * Does anybody in this event already have something else at that time?
   *
   * Only among the events the person asking can see. It used to look at the
   * whole family and hand back the ids of what it found - a parents-only
   * appointment reached a grandparent's composer as "there is something here",
   * with its id. A conflict is a suggestion built from events, and every path
   * that reads events goes through `eventFilter` (VisibilityService).
   *
   * Repeating series count at each occurrence (common/recurrence.ts): a
   * weekly practice is a conflict every Tuesday, not only on the day it began.
   * The answer says who is double-booked, so the app can name them.
   */
  async detectConflicts(
    ctx: ViewerContext,
    input: {
      startsAt: Date;
      endsAt?: Date | null;
      participantMemberIds: string[];
      /** The event being edited, which does not conflict with itself. */
      excludeEventId?: string;
    },
  ): Promise<StoredSuggestion | null> {
    if (input.participantMemberIds.length === 0) return null;

    const start = input.startsAt;
    const end = input.endsAt ?? new Date(start.getTime() + ASSUMED_DURATION_MS);
    const around = {
      participants: { some: { memberId: { in: input.participantMemberIds } } },
      allDay: false,
      ...(input.excludeEventId ? { id: { not: input.excludeEventId } } : {}),
    };

    const oneOffs = await this.prisma.event.findMany({
      where: {
        AND: [
          this.visibility.eventFilter(ctx),
          {
            ...around,
            repeat: null,
            startsAt: { lt: end },
            // The other side's open end is the same assumed hour: a dentist at
            // 15:30 with no end is still there at 16:00.
            OR: [
              { endsAt: { gt: start } },
              { endsAt: null, startsAt: { gt: new Date(start.getTime() - ASSUMED_DURATION_MS) } },
            ],
          },
        ],
      },
      select: { id: true, participants: { select: { memberId: true } } },
      take: 3,
    });

    const series = await this.prisma.event.findMany({
      where: {
        AND: [this.visibility.eventFilter(ctx), { ...around, repeat: { not: null }, startsAt: { lt: end } }],
      },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        repeat: true,
        repeatUntil: true,
        repeatSkips: true,
        repeatTimeZone: true,
        participants: { select: { memberId: true } },
      },
      take: 50,
    });

    const busySeries = series.filter((s) => {
      const lasting = { ...s, endsAt: s.endsAt ?? new Date(s.startsAt.getTime() + ASSUMED_DURATION_MS) };
      return occurrencesBetween(lasting, start, end, 5).some(
        (o) => o.startsAt < end && (o.endsAt ?? o.startsAt) > start,
      );
    });

    const hits = [...oneOffs, ...busySeries].slice(0, 3);
    if (hits.length === 0) return null;

    const wanted = new Set(input.participantMemberIds);
    const memberIds = [
      ...new Set(hits.flatMap((e) => e.participants.map((p) => p.memberId)).filter((id) => wanted.has(id))),
    ];

    return this.store(ctx.familyId, {
      kind: InsightKind.schedule_conflict,
      message: 'A participant already has another event at this time',
      confidence: 1,
      payload: { eventIds: hits.map((e) => e.id), memberIds },
    });
  }

  // -------------------------------------------------------------------------
  // 3. Reminder time
  // -------------------------------------------------------------------------

  /**
   * The reminder time this family picks most often for this category.
   * With too little history there is no suggestion — better silent than guessing.
   */
  async suggestReminderTime(
    familyId: string,
    categoryId: string,
  ): Promise<StoredSuggestion | null> {
    const past = await this.prisma.reminder.findMany({
      where: { event: { familyId, categoryId, deletedAt: null } },
      select: { minutesBefore: true },
      take: 50,
      orderBy: { createdAt: 'desc' },
    });

    if (past.length < 3) return null;

    const counts = new Map<number, number>();
    for (const r of past) counts.set(r.minutesBefore, (counts.get(r.minutesBefore) ?? 0) + 1);

    const [minutes, hits] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const confidence = hits / past.length;
    if (confidence < AiService.MIN_CONFIDENCE) return null;

    return this.store(familyId, {
      kind: InsightKind.reminder_time,
      message: 'You usually set the reminder earlier for events like this',
      confidence,
      payload: { minutesBefore: minutes },
    });
  }

  // -------------------------------------------------------------------------
  // Response tracking
  // -------------------------------------------------------------------------

  async accept(insightId: string): Promise<void> {
    await this.prisma.insight.update({
      where: { id: insightId },
      data: { acceptedAt: new Date() },
    });
  }

  async reject(insightId: string): Promise<void> {
    await this.prisma.insight.update({
      where: { id: insightId },
      data: { rejectedAt: new Date() },
    });
  }

  // -------------------------------------------------------------------------

  private async store(
    familyId: string,
    data: { kind: InsightKind; message: string; confidence: number; payload?: object },
  ): Promise<StoredSuggestion> {
    const insight = await this.prisma.insight.create({
      data: {
        familyId,
        kind: data.kind,
        message: data.message,
        confidence: data.confidence,
        payload: data.payload ?? undefined,
        source: InsightSource.rules,
        // Suggestions go stale. A week is enough to measure acceptance.
        expiresAt: new Date(Date.now() + 7 * 864e5),
      },
    });

    return {
      id: insight.id,
      kind: insight.kind,
      message: insight.message,
      confidence: insight.confidence,
      payload: data.payload,
    };
  }
}

export interface StoredSuggestion {
  id: string;
  kind: InsightKind;
  message: string;
  confidence: number;
  payload?: object;
}
