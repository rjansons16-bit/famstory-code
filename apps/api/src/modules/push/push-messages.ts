import type { NotificationKind } from '@prisma/client';

/**
 * WHAT A NOTIFICATION ON THE PHONE SAYS: one plain line per kind, and never a
 * word the family wrote.
 *
 * Apple and Google carry every push, through servers outside the European
 * Union, and the privacy policy promises that what a family writes is never
 * transferred there (docs/legal/privacy-policy.md, section 4). So no title, no
 * name, no comment: "you have a reminder", and the app shows which once it is
 * opened - through the same visibility check as everything else. The bell in
 * the app keeps the full text, as it always has.
 */
export interface PushMessage {
  title: string;
  body: string;
  /** What the app needs to open the right screen. Strings only, as FCM requires. */
  data: Record<string, string>;
}

type Words = [title: string, body: string];

const TEXT: Record<'lv' | 'en', Partial<Record<NotificationKind, Words>> & { other: Words }> = {
  lv: {
    event_reminder: ['Atgādinājums', 'Drīz kaut kas notiek. Atver FamStory, lai redzētu.'],
    event_created: ['Kas jauns ģimenē', 'Kāds ģimenē pievienoja ko jaunu.'],
    comment_added: ['Jauna atbilde', 'Sarunā, kurā piedalies, ir jauna atbilde.'],
    member_joined: ['Ģimene paplašinās', 'Ģimenei pievienojās jauns cilvēks.'],
    password_reset_created: ['Paroles saite', 'Ģimenes administrators tev izveidoja paroles atjaunošanas saiti.'],
    capsule_opened: ['Laika kapsula', 'Ir pienākusi diena atvērt laika kapsulu.'],
    surprise_ready: ['Pārsteigums', 'Tevi gaida ģimenes apsveikumi.'],
    special_day: ['Drīz svētki', 'Pēc trim dienām ir ģimenes svētki.'],
    content_reported: ['Ziņojums', 'Par kaut ko ģimenē ir ziņots.'],
    other: ['FamStory', 'Tev ir jauns paziņojums.'],
  },
  en: {
    event_reminder: ['Reminder', 'Something is coming up. Open FamStory to see what.'],
    event_created: ['New in your family', 'Somebody in your family added something new.'],
    comment_added: ['New reply', 'There is a new reply in a conversation you are part of.'],
    member_joined: ['Your family grew', 'Somebody new joined your family.'],
    password_reset_created: ['Password link', 'Your family admin made you a link to set a new password.'],
    capsule_opened: ['Time capsule', 'The day to open a time capsule has come.'],
    surprise_ready: ['A surprise', 'Your family’s wishes are waiting for you.'],
    special_day: ['A family day soon', 'A day your family marks is three days away.'],
    content_reported: ['A report', 'Something in your family was reported.'],
    other: ['FamStory', 'You have a new notification.'],
  },
};

export function pushMessage(
  kind: NotificationKind,
  locale: string | null | undefined,
  data: { eventId?: string | null } = {},
): PushMessage {
  const words = locale === 'lv' ? TEXT.lv : TEXT.en;
  const [title, body] = words[kind] ?? words.other;
  return {
    title,
    body,
    data: { kind, ...(data.eventId ? { eventId: data.eventId } : {}) },
  };
}
