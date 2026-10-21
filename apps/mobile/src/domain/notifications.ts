import type { AppNotification } from '@/domain/types';
import { t, tf } from '@/i18n';
import { differenceInCalendarDays, inDaysLabel, startOfDay, toDate } from '@/lib/date';
import { isSpecialDayKey, specialDayHint, specialDayName } from './special-days';

/**
 * A notification, put into words.
 *
 * The server sends facts - who, which event, what kind - and the sentence is
 * written here, at the moment it is drawn, in the language the reader chose.
 * A sentence composed on the server would be in one language for the whole
 * family and would stay in it after somebody switched.
 *
 * Called from render, never at module level (see i18n/index.ts): a string
 * built at import time keeps the language it was imported in.
 *
 * The sample family carries prewritten text; that wins, so the demo reads the
 * way it was written.
 */
export function describeNotification(
  n: AppNotification,
  now: Date = new Date(),
): { title: string; body: string } {
  if (n.title !== undefined && n.body !== undefined) return { title: n.title, body: n.body };

  const actor = n.actorName ?? t('notifications.someone');
  const event = n.eventTitle ?? '';

  switch (n.kind) {
    case 'event_created':
      return { title: tf('notifications.eventCreated', actor), body: event };
    case 'comment_added':
      return { title: tf('notifications.commentAdded', actor), body: event };
    case 'event_reminder':
      return { title: t('notifications.reminder'), body: event };
    case 'member_joined':
      return { title: tf('notifications.memberJoined', actor), body: t('notifications.memberJoinedBody') };
    case 'password_reset_created':
      // Said plainly, with who did it: this is the one notification that exists
      // so that something cannot happen behind somebody's back.
      return {
        title: tf('notifications.passwordReset', actor),
        body: t('notifications.passwordResetBody'),
      };
    case 'capsule_opened':
      return { title: t('notifications.capsuleOpened'), body: event };
    case 'surprise_ready':
      // Not the wish's title: there may be five, and the news is that they are there.
      return { title: t('notifications.surpriseReady'), body: t('notifications.surpriseReadyBody') };
    case 'content_reported':
      // No name, on purpose: who reported it stays out of the family's bell.
      return { title: t('notifications.contentReported'), body: event };
    case 'special_day': {
      // "Mother's Day in 3 days" - counted from the day it is read, not the
      // day it was sent, so a notification opened late does not say "in 3
      // days" about tomorrow. Once the day has passed, only its name.
      if (!isSpecialDayKey(n.dayKey)) return { title: t('notifications.title'), body: '' };
      const name = specialDayName(n.dayKey);
      const inDays = n.dayOn ? differenceInCalendarDays(toDate(n.dayOn), startOfDay(now)) : -1;
      return {
        title: inDays >= 0 ? tf('special.when', name, inDaysLabel(inDays)) : name,
        body: specialDayHint(n.dayKey),
      };
    }
    default:
      return { title: n.title ?? t('notifications.title'), body: n.body ?? event };
  }
}

/**
 * The bell without what somebody the reader blocked did (docs/02-DATA-MODEL.md,
 * Blocks). The server's list already is; the sample family's is filtered
 * here. What nobody in particular did stays.
 */
export function bellFor(list: AppNotification[], blocked: readonly string[]): AppNotification[] {
  if (blocked.length === 0) return list;
  return list.filter((n) => !n.actorMemberId || !blocked.includes(n.actorMemberId));
}
