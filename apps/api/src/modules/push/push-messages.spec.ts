import { NotificationKind } from '@prisma/client';

import { pushMessage } from './push-messages';

/**
 * What reaches a lock screen through Apple and Google. The one property that
 * matters: nothing the family wrote - so the tests hand in an event whose
 * title would be the obvious thing to show, and look for it.
 */
describe('What a push says', () => {
  it('has its own line for every kind of notification, in Latvian and in English', () => {
    const fallback = { lv: 'Tev ir jauns paziņojums.', en: 'You have a new notification.' };
    for (const kind of Object.values(NotificationKind)) {
      for (const locale of ['lv', 'en'] as const) {
        const message = pushMessage(kind, locale);
        expect(message.title.length).toBeGreaterThan(0);
        // A kind added to the schema without a line of its own falls back -
        // and this says which one.
        expect(`${kind}: ${message.body}`).not.toBe(`${kind}: ${fallback[locale]}`);
      }
    }
  });

  it('speaks Latvian to a Latvian phone and English to the rest', () => {
    expect(pushMessage(NotificationKind.event_reminder, 'lv').title).toBe('Atgādinājums');
    expect(pushMessage(NotificationKind.event_reminder, 'en').title).toBe('Reminder');
    expect(pushMessage(NotificationKind.event_reminder, null).title).toBe('Reminder');
  });

  it('carries only the kind and the event id - never a title, a name or a comment', () => {
    const message = pushMessage(NotificationKind.comment_added, 'lv', { eventId: 'evt_dentist' });
    expect(message.data).toEqual({ kind: 'comment_added', eventId: 'evt_dentist' });
    const everything = JSON.stringify(message);
    expect(everything).not.toMatch(/Zobārsts|Emīlija|Vera/);
  });

  it('leaves the event id out when there is none', () => {
    expect(pushMessage(NotificationKind.special_day, 'en').data).toEqual({ kind: 'special_day' });
  });
});
