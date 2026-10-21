/**
 * THE EVENTS THE APP MAY REPORT, and what each one may carry.
 *
 * The same list as `AnalyticsEvent` in apps/mobile/src/domain/analytics.ts. A
 * name that is not here is dropped, and so is any field not listed for its
 * event - the list is what stops this table from becoming a place where
 * content ends up. A field arrives as one of three shapes and is kept only in
 * that shape:
 *
 *   word    - a short token from the app's own vocabulary: "email", "family",
 *             "2026-08". Never free text; see WORD.
 *   number  - a finite count or a number of days.
 *   boolean
 *
 * Deliberately NOT carried even where the app sends it: `event_viewed`'s
 * eventId. How often events are opened is a question; which one was opened is
 * not, and an id is a thread back to what a family wrote.
 */

export type FieldKind = 'word' | 'number' | 'boolean';

export const KNOWN_EVENTS: Readonly<Record<string, Readonly<Record<string, FieldKind>>>> = {
  // --- Activation ---
  signup_completed: { method: 'word' },
  family_created: {},
  invitation_sent: { channel: 'word', role: 'word' },
  invitation_accepted: { role: 'word' },
  onboarding_step_completed: { step: 'word' },
  onboarding_completed: { peopleAdded: 'number', firstEventCreated: 'boolean' },

  // --- Core usage ---
  event_created: { categoryId: 'word', hasMedia: 'boolean', hasVoice: 'boolean', visibilityKind: 'word' },
  event_viewed: {},
  comment_added: {},
  voice_note_recorded: { seconds: 'number' },
  voice_note_played: {},
  dictation_used: { field: 'word' },
  reaction_added: { kind: 'word' },

  // --- Differentiation ---
  visibility_changed: { from: 'word', to: 'word' },
  group_created: {},
  timeline_filtered: { filter: 'word' },

  // --- Retention ---
  app_opened: { daysSinceSignup: 'number' },
  reminder_delivered: {},
  reminder_opened: {},
  birthday_opened: { inDays: 'number' },
  whats_new_shown: { count: 'number' },
  whats_new_opened: { count: 'number' },
  weekly_question_shown: { key: 'word' },
  weekly_question_opened: { key: 'word' },
  weekly_question_answered: { key: 'word' },
  recap_shown: { month: 'word' },
  recap_opened: { month: 'word' },

  // --- Keepsakes ---
  capsule_created: { yearsAhead: 'number' },
  surprise_wish_added: { inDays: 'number' },
  surprise_opened: { wishes: 'number' },
  lifestory_answered: { chapter: 'word' },
  heirloom_sticker_created: {},
  yearly_opened: { view: 'word' },
  year_film_played: { photos: 'number' },
  year_film_saved: {},
  app_installed: { platform: 'word' },

  // --- Gifts and the family's days ---
  interests_saved: { count: 'number', where: 'word' },
  gift_ideas_shown: { inDays: 'number', ideas: 'number' },
  gift_idea_taken: { source: 'word' },
  gift_idea_searched: { source: 'word' },
  special_day_opened: { day: 'word' },

  // --- Push ---
  push_answered: { granted: 'boolean' },

  // --- Safety ---
  content_reported: { target: 'word', reason: 'word' },
  member_blocked: {},
  member_unblocked: {},

  // --- Monetisation ---
  paywall_shown: { trigger: 'word' },
  paywall_dismissed: { trigger: 'word' },
  subscription_started: { plan: 'word' },
  subscription_cancelled: { plan: 'word', daysActive: 'number' },
  purchase_restored: { found: 'boolean' },
  purchase_failed: { reason: 'word' },
  review_requested: {},
  suggestion_shown: { kind: 'word', confidence: 'number' },
  suggestion_accepted: { kind: 'word' },
  suggestion_rejected: { kind: 'word' },
};

/**
 * What a word may look like: the app's tokens are lower-case identifiers,
 * category and group ids, a month key. A space is enough to refuse it - that
 * is where a title or a name would begin.
 */
const WORD = /^[A-Za-z0-9_.:-]{1,40}$/;

/**
 * The fields of one event as the list allows them, or null when the name is
 * not one the app has. Unknown fields and wrong shapes are dropped, not
 * rejected: a new app version adding a field must not lose the event.
 */
export function allowedProps(name: string, raw: unknown): Record<string, string | number | boolean> | null {
  if (!Object.prototype.hasOwnProperty.call(KNOWN_EVENTS, name)) return null;
  const fields = KNOWN_EVENTS[name];
  const kept: Record<string, string | number | boolean> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return kept;

  for (const [field, kind] of Object.entries(fields)) {
    const value = (raw as Record<string, unknown>)[field];
    if (kind === 'word' && typeof value === 'string' && WORD.test(value)) kept[field] = value;
    else if (kind === 'number' && typeof value === 'number' && Number.isFinite(value) && Math.abs(value) < 1e6) {
      kept[field] = value;
    } else if (kind === 'boolean' && typeof value === 'boolean') kept[field] = value;
  }
  return kept;
}
