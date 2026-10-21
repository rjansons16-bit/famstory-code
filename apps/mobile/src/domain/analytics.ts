/**
 * Analytics events that measure the MVP validation KPIs from the study.
 *
 * These go into the code NOW, not after the beta. The month-12 decision point
 * (does retention justify a public launch?) is meaningless without data.
 *
 * Every event here maps to a specific KPI in docs/00-PLAN.md, section 6.
 */

export type AnalyticsEvent =
  // --- Activation ---
  /** KPI: number of registered families. */
  | { name: 'signup_completed'; method: 'email' | 'google' | 'apple' }
  /** KPI: families in the closed beta (50-200). */
  | { name: 'family_created' }
  /** KPI: families with more than one active member (>40%). */
  | { name: 'invitation_sent'; channel: 'email' | 'link' | 'code'; role: string }
  | { name: 'invitation_accepted'; role: string }
  /**
   * The onboarding funnel.
   *
   * Decision point at months 3-4 is "do users understand the value and the
   * flows?" — and that question is answered by WHERE people stop, not by how
   * many finish. A single completion event cannot tell the difference between
   * a family lost at "what should we call you" and one lost at the first event.
   */
  | {
      name: 'onboarding_step_completed';
      step: 'about_you' | 'interests' | 'family' | 'people' | 'first_event';
    }
  /** KPI: families with >1 member, and families with 3+ events — both start here. */
  | { name: 'onboarding_completed'; peopleAdded: number; firstEventCreated: boolean }
  /**
   * From the demo to the real app (lib/demo-exit.web.ts): whether a year of
   * the sample family makes anybody want a family of their own. KPI:
   * registered families - the demo is where somebody without an account sees
   * what one is for. Where the button was, and nothing else.
   */
  | { name: 'demo_left'; from: 'welcome' | 'signIn' | 'profile' }

  // --- Core usage ---
  /** KPI: families creating 3+ events (>50%); events per month (5-10). */
  | { name: 'event_created'; categoryId: string; hasMedia: boolean; hasVoice: boolean; visibilityKind: string }
  | { name: 'event_viewed'; eventId: string }
  | { name: 'comment_added' }
  /**
   * Voice: the recordings made, how long (seconds), and whether anybody plays
   * them - the launch plan's bet is that a grandparent will talk where they
   * would never type. And dictation, by which field: if nobody presses it,
   * the button is only a privacy question with no benefit.
   */
  | { name: 'voice_note_recorded'; seconds: number }
  | { name: 'voice_note_played' }
  | { name: 'dictation_used'; field: 'title' | 'description' }
  | { name: 'reaction_added'; kind: string }

  // --- Differentiation validation ---
  /** KPI: use of visibility and group features (>25% of active families).
   *  This is the MOST IMPORTANT product event: it validates the differentiation. */
  | { name: 'visibility_changed'; from: string; to: string }
  | { name: 'group_created' }
  | { name: 'timeline_filtered'; filter: string }

  // --- Retention ---
  /** KPI: 7-day (>45%) and 30-day (>35-40%) retention. */
  | { name: 'app_opened'; daysSinceSignup: number }
  | { name: 'reminder_delivered' }
  | { name: 'reminder_opened' }
  /**
   * The birthday strip is a retention feature in the same family as "On this
   * day": nothing new is stored, the archive simply comes to the user. Whether
   * anybody acts on it is the only way to tell the two apart from a decoration.
   */
  | { name: 'birthday_opened'; inDays: number }
  /**
   * "4 new since Tuesday" (domain/whats-new.ts). Shown once per visit that has
   * something new; opened when somebody taps it to see only those. The ratio is
   * whether the line brings people to what the family added, or is wallpaper.
   */
  | { name: 'whats_new_shown'; count: number }
  | { name: 'whats_new_opened'; count: number }
  /**
   * The question of the week (domain/prompts.ts): shown, opened, answered.
   * The last is the one that matters - an entry that would not exist without
   * the question - and the key says which questions get answered at all.
   */
  | { name: 'weekly_question_shown'; key: string }
  | { name: 'weekly_question_opened'; key: string }
  | { name: 'weekly_question_answered'; key: string }
  /** Last month looked back on (domain/recap.ts): offered, and opened. */
  | { name: 'recap_shown'; month: string }
  | { name: 'recap_opened'; month: string }

  // --- Keepsakes ---
  /**
   * The things a family keeps rather than plans (docs/07-IMPROVEMENTS.md
   * items 75-82): each is a bet that a chronicle is opened again for what is
   * in it, so each says only that it was used - never what, nor for whom.
   */
  | { name: 'capsule_created'; yearsAhead: number }
  | { name: 'surprise_wish_added'; inDays: number }
  | { name: 'surprise_opened'; wishes: number }
  | { name: 'lifestory_answered'; chapter: string }
  | { name: 'heirloom_sticker_created' }
  | { name: 'yearly_opened'; view: 'traditions' | 'growth' }
  | { name: 'year_film_played'; photos: number }
  | { name: 'year_film_saved' }
  /** The app installed from the browser - the desktop and phone "download". */
  | { name: 'app_installed'; platform: string }

  // --- Gifts and the family's days ---
  /**
   * Gift ideas before a birthday (domain/gifts.ts) and the days a family
   * marks (domain/special-days.ts): whether people say what they like, whether
   * an idea is ever taken or looked up, and which days bring anybody in. How
   * many and where from - never which idea, whose, or what anybody likes.
   */
  | { name: 'interests_saved'; count: number; where: 'onboarding' | 'profile' | 'child' }
  | { name: 'gift_ideas_shown'; inDays: number; ideas: number }
  | { name: 'gift_idea_taken'; source: string }
  | { name: 'gift_idea_searched'; source: string }
  | { name: 'special_day_opened'; day: string }

  // --- Safety ---
  /** How often something gets reported, and why - never what, or by whom. */
  | { name: 'content_reported'; target: 'event' | 'comment'; reason: string }
  /** How often people block each other in a family - never who, or whom. */
  | { name: 'member_blocked' }
  | { name: 'member_unblocked' }

  // --- Monetisation ---
  /** KPI: free to premium conversion (3-7%). */
  | { name: 'paywall_shown'; trigger: string }
  | { name: 'paywall_dismissed'; trigger: string }
  | { name: 'subscription_started'; plan: 'monthly' | 'annual' }
  | { name: 'subscription_cancelled'; plan: 'monthly' | 'annual'; daysActive: number }
  /** Restore pressed; whether it found a purchase. */
  | { name: 'purchase_restored'; found: boolean }
  /** A purchase the store refused - the store's reason as a token, never its message. */
  | { name: 'purchase_failed'; reason: string }
  /** The app asked the store to show its rating question (the store decides). */
  | { name: 'review_requested' }

  // --- Push ---
  /** The phone's question about notifications was answered (lib/push.ts). */
  | { name: 'push_answered'; granted: boolean }

  // --- AI layer ---
  // No confidence where the rules have none to give (the app's category
  // keywords); a made-up number would be averaged into the decision.
  | { name: 'suggestion_shown'; kind: string; confidence?: number }
  | { name: 'suggestion_accepted'; kind: string }
  | { name: 'suggestion_rejected'; kind: string };

export type AnalyticsSink = (event: AnalyticsEvent) => void;

let sink: AnalyticsSink = () => {};

export function setAnalyticsSink(next: AnalyticsSink): void {
  sink = next;
}

export function track(event: AnalyticsEvent): void {
  sink(event);
}

/**
 * Console during development. Replace with a real sink for the beta
 * (PostHog EU, Amplitude EU, or our own backend).
 *
 * GDPR: no event carries an event title, description, photo or member name.
 * Structural facts only, following the data minimisation principle.
 */
export function installConsoleSink(): void {
  setAnalyticsSink((event) => {
    if (__DEV__) console.log('[analytics]', event.name, event);
  });
}
