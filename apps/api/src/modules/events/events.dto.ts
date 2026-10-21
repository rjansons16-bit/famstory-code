import { VisibilityKind } from '@prisma/client';

import type { RepeatRule } from '../../common/recurrence';

/**
 * DTO types. Validation (class-validator decorators) has to be added together
 * with the ValidationPipe when the module is finished — see docs/00-PLAN.md,
 * stage C.
 */

export interface ListEventsQuery {
  from?: string;
  to?: string;
  categoryId?: string;
  participantId?: string;
  /** Query strings arrive as text: "true" is the only yes. */
  milestonesOnly?: boolean | string;
  /**
   * Only repeating series, whatever their date. The app loads these apart
   * from the newest page, because a weekly practice that started in January
   * is on every calendar page and would otherwise have fallen off the end.
   */
  repeating?: boolean | string;
  /** Only what is on the story shelf - the shelf screen asks for these alone. */
  onStoryShelf?: boolean | string;
  q?: string;
  cursor?: string;
  limit?: number;
}

export interface VisibilityDto {
  kind: VisibilityKind;
  groupIds?: string[];
  memberIds?: string[];
}

export interface CreateEventDto {
  title: string;
  description?: string;
  startsAt: string;
  endsAt?: string;
  allDay?: boolean;
  categoryId: string;
  isMilestone?: boolean;
  /** The family's own labels. Separate axis from categoryId — see the schema. */
  tags?: string[];
  participantMemberIds?: string[];
  /**
   * Optional. When it is absent the server applies the safe default — and with
   * a child among the participants that default is "Parents only".
   */
  visibility?: VisibilityDto;
  attachmentIds?: string[];
  /** null removes it (on update). */
  reminder?: { minutesBefore: number } | null;
  /** How it repeats; null or absent for once. See common/recurrence.ts. */
  repeat?: RepeatRule | null;
  /** The last day an occurrence may start on, as an instant on that day. */
  repeatUntil?: string | null;
  /** The IANA zone the series is kept in - the device's own, sent by the app. */
  repeatTimeZone?: string | null;
  /** Which question of the week this entry answers ("childhood-home"). */
  promptKey?: string;
  /** A time capsule: closed to all but its author until then. null opens it (update). */
  sealedUntil?: string | null;
  /**
   * A surprise for this member, hidden from them until `revealAt`. Set once,
   * when the event is made: a surprise cannot be moved onto somebody else.
   */
  surpriseFor?: string;
  revealAt?: string;
  /** On the story shelf. */
  onStoryShelf?: boolean;
}

export type UpdateEventDto = Partial<
  Omit<CreateEventDto, 'visibility' | 'surpriseFor' | 'revealAt'>
> & {
  /** Days (YYYY-MM-DD) taken out of the series - the whole list, as it should be. */
  repeatSkips?: string[];
};
