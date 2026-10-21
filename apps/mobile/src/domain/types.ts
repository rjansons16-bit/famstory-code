/**
 * FamStory domain types.
 *
 * Canonical spec: docs/02-DATA-MODEL.md
 * Server-side mirror: apps/api/prisma/schema.prisma
 *
 * These types match API responses, not DB rows — an `Event` already carries
 * resolved participants and attachments.
 */

// ---------------------------------------------------------------------------
// Roles and permissions
// ---------------------------------------------------------------------------

/**
 * Roles from the feasibility study section on user roles.
 * A role decides what a member MAY DO. Visibility decides what they SEE.
 * Two separate things that must not be conflated.
 */
export type MemberRole =
  | 'admin' // Family admin: creates the family, manages members, groups, visibility
  | 'member' // Family member: sees what is allowed, comments, adds events
  | 'child' // Child profile: managed through a parent account, has no account
  | 'viewer'; // Grandparent / viewer: sees only what is allowed, does not write

export type MemberStatus = 'active' | 'invited' | 'removed';

// ---------------------------------------------------------------------------
// Family
// ---------------------------------------------------------------------------

export interface Family {
  id: string;
  name: string;
  createdAt: string;
  /** Family cover image in the timeline header. */
  coverUrl?: string;
  /** The plan in force now, as the server works it out (docs/02-DATA-MODEL.md, Subscriptions). */
  plan: 'free' | 'premium';
  /** How Premium was bought and when it ends; absent on the free plan and in the sample family. */
  subscription?: FamilySubscription;
  locale: 'lv' | 'en';
}

export interface FamilySubscription {
  period?: 'monthly' | 'annual';
  /** The end of what is paid for. Absent: no end (a plan set by hand). */
  until?: string;
  /** False once renewal is turned off: Premium runs to `until` and stops. */
  renews: boolean;
  store?: 'app_store' | 'play_store' | 'promotional' | 'other';
}

export interface Member {
  id: string;
  familyId: string;
  /** null for a child profile not linked to an account. */
  userId: string | null;
  displayName: string;
  avatarUrl?: string;
  role: MemberRole;
  status: MemberStatus;
  /** This member manages the child profile. A regulatory requirement. */
  managedByMemberId?: string;
  birthDate?: string;
  /**
   * In memoriam: the day this person died, once the family has marked it.
   * The profile stays; the birthday strip, reminders and sign-in stop.
   */
  diedOn?: string;
  /**
   * What they like, as keys from domain/interests.ts - never free text. The
   * family sees these; the gift ideas before a birthday read them. A child's
   * are set by the adults who manage the profile.
   */
  interests?: string[];
  groupIds: string[];
  joinedAt: string;
}

/**
 * One line on somebody's wish list. The person it is for sees only the lines
 * they wrote and never a claim - the server enforces that; the app draws it.
 */
export interface Wish {
  id: string;
  text: string;
  addedByMemberId: string;
  /** Who said "I'll get this". Always null in the owner's own view. */
  claimedByMemberId: string | null;
  createdAt: string;
}

/** A link to one event for somebody outside the family (see the API's guest module). */
export interface GuestLink {
  id: string;
  expiresAt: string;
  viewCount: number;
  lastViewedAt: string | null;
  createdByMemberId: string;
}

/** What a guest's browser gets: the words, the date and the photographs. */
export interface GuestView {
  familyName: string;
  sharedBy: string;
  expiresAt: string;
  /** A sticker on a family heirloom, which carries the voice too. Absent from an older server. */
  heirloom?: boolean;
  event: {
    title: string;
    description: string | null;
    startsAt: string;
    endsAt: string | null;
    allDay: boolean;
    categoryId: CategoryId;
    photos: { url: string; thumbnailUrl: string; width: number | null; height: number | null }[];
    /** Only on an heirloom sticker. */
    voiceNotes?: { url: string; durationSec: number | null }[];
  };
}

/** The member's own read-only calendar address. */
export interface CalendarFeed {
  url: string;
  webcalUrl: string;
  createdAt: string;
  lastFetchedAt: string | null;
}

export interface Group {
  id: string;
  familyId: string;
  name: string;
  /** System groups cannot be deleted: they follow from the roles. */
  isSystem: boolean;
  memberIds: string[];
  /** Icon key that design maps to a concrete glyph. */
  icon?: string;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/**
 * Visibility kind. This is the core of the differentiation — the feasibility
 * study calls it privacy control within the family.
 */
export type VisibilityKind =
  | 'family' // every active member of the family
  | 'custom' // named groups and/or named people
  | 'groups' // specific groups only
  | 'members' // specific members only
  | 'private'; // the author only

/**
 * `custom` carries groups AND people at once, which is what the design asks
 * for: "Custom — choose groups & people", with both lists ticked in one sheet.
 *
 * `groups` and `members` stay in the union because the data model has always
 * had them and existing events use them. They are the degenerate cases of
 * `custom`, and `matchesVisibility` treats all three the same way — a viewer
 * matches if they are in a named group OR named individually.
 */
export interface Visibility {
  kind: VisibilityKind;
  groupIds?: string[];
  memberIds?: string[];
}

export type AttachmentKind = 'image' | 'video' | 'document' | 'audio';

export interface Attachment {
  id: string;
  kind: AttachmentKind;
  url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  /** Seconds; a video's or a voice note's. */
  durationSec?: number;
  /** What a recording on this device was made as, until it is uploaded. */
  mimeType?: string;
}

export interface Comment {
  id: string;
  eventId: string;
  authorMemberId: string;
  body: string;
  createdAt: string;
}

export type ReactionKind = 'heart' | 'smile' | 'clap' | 'wow';

export interface Reaction {
  memberId: string;
  kind: ReactionKind;
}

export interface Reminder {
  id: string;
  eventId: string;
  /** Minutes before the event starts. */
  minutesBefore: number;
  enabled: boolean;
  /** Who to notify. Empty means everyone who can see the event. */
  memberIds?: string[];
}

export interface FamilyEvent {
  id: string;
  familyId: string;
  title: string;
  description?: string;
  /** ISO. Every event has a start; the end is optional. */
  startsAt: string;
  endsAt?: string;
  /** All-day event: birthdays, first day of school, anniversaries. */
  allDay: boolean;
  categoryId: CategoryId;
  /**
   * Free labels the family invents: "First steps", "Holiday", "School".
   *
   * NOT a replacement for the category, and the distinction matters. The
   * category is the structured life-cycle axis the study names as a
   * differentiator — a closed set, the same in every family, and what the
   * archive, the filters and a future AI classification are built on. A tag is
   * the family's own word for something, and it belongs to them alone.
   *
   * The design shows both on the composer: "Event type" above, "Tags" below.
   */
  tags?: string[];
  /** Who the event is ABOUT, not who can see it. */
  participantMemberIds: string[];
  authorMemberId: string;
  visibility: Visibility;
  attachments: Attachment[];
  /**
   * Voice notes, apart from the photographs on purpose: everything that draws
   * a cover reads `attachments[0]`, and a recording must never be one.
   */
  voiceNotes?: Attachment[];
  reactions: Reaction[];
  commentCount: number;
  reminder?: Reminder;
  createdAt: string;
  updatedAt: string;
  /** Archive entry: an event deliberately kept in the long-term chronicle. */
  isMilestone: boolean;

  /**
   * How it repeats; absent for once. A series is ONE event - its occurrences
   * are computed (domain/recurrence.ts), never stored.
   */
  repeat?: RepeatRule;
  /** The last day an occurrence may start on. */
  repeatUntil?: string;
  /** Days (YYYY-MM-DD) taken out of the series: "not this week". */
  repeatSkips?: string[];
  /** The IANA zone the series is kept in, so 18:00 stays 18:00 all year. */
  repeatTimeZone?: string;
  /**
   * Set only on a copy that stands for ONE occurrence of a series - the
   * calendar's day list, the timeline's "next practice". Which day it is.
   */
  occurrenceDay?: string;
  /** The question of the week this entry answers, when it does. */
  promptKey?: string;

  /**
   * A TIME CAPSULE: until then only its author sees inside. When `sealed` is
   * true this copy IS the envelope - the server sent no words, photographs,
   * voice, comments or reactions (domain/capsules.ts). The app never had them.
   */
  sealedUntil?: string;
  sealed?: boolean;
  /**
   * A SURPRISE for this member, hidden from them until `revealAt` - birthday
   * wishes gathered while they cannot look (domain/surprises.ts). The server
   * keeps it from them; the app only has to say so to everybody else.
   */
  hiddenFromMemberId?: string;
  revealAt?: string;
  /** On the story shelf: a voice to fall asleep to. */
  onStoryShelf?: boolean;
}

/** Weekly on the same weekday; monthly on the same day or the month's last; yearly on the date. */
export type RepeatRule = 'daily' | 'weekly' | 'monthly' | 'yearly';

// ---------------------------------------------------------------------------
// Life-cycle categories
// ---------------------------------------------------------------------------

export type CategoryId =
  | 'development' // growing up: first steps, first word, growth
  | 'education' // school, exams, graduations
  | 'milestone' // family landmarks: weddings, moving, anniversaries
  | 'health' // appointments, vaccinations, recovery
  | 'celebration' // birthdays, Christmas, parties
  | 'travel' // trips and holidays
  | 'activity' // everyday activities: practice, clubs
  | 'chore' // chores and tasks
  | 'finance' // financial decisions
  | 'other';

export interface Category {
  id: CategoryId;
  /** i18n key: the text comes from src/i18n. */
  labelKey: string;
  /** Semantic key that design maps to a colour and an icon. */
  tone: 'growth' | 'learn' | 'landmark' | 'care' | 'joy' | 'journey' | 'routine' | 'task' | 'money' | 'neutral';
}

// ---------------------------------------------------------------------------
// Account and session
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  locale: 'lv' | 'en';
  createdAt: string;
  /**
   * May the app count what this person does (data/telemetry.ts)? Absent means
   * yes - the default the server starts every account on. The server checks it
   * too; this copy only saves sending what would be thrown away.
   */
  shareUsageStats?: boolean;
  /**
   * Which kinds reach this person's bell (settings/index.tsx). Absent means
   * yes, as on the server; the server is what obeys them.
   */
  notifyEvents?: boolean;
  notifyComments?: boolean;
  notifyReminders?: boolean;
  /** Where a new event's reminder starts in the composer. Absent: none. */
  defaultReminderMinutes?: number;
  /**
   * The version of the terms and the privacy policy this person accepted, as
   * the server keeps it. null: none recorded. Absent: not known - the sample
   * family, or a server too old to say - and then nobody is asked.
   */
  termsVersion?: string | null;
  /**
   * Whether this person consented to keeping the health information they
   * write (GDPR Art. 9; the Health category). Absent: not known - the sample
   * family, an older server - and then nothing asks.
   */
  healthConsent?: boolean;
}

/** The three switches, by the name the store and the settings screen use. */
export type NotifyKind = 'events' | 'comments' | 'reminders';

export interface Session {
  user: User;
  /** The active family. A user may belong to several. */
  activeFamilyId: string;
  /** The member record for this user in the active family. */
  activeMemberId: string;
}

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

export interface Invitation {
  id: string;
  familyId: string;
  /** null when the invitation is a link or code with no named recipient. */
  email: string | null;
  code: string;
  role: MemberRole;
  groupIds: string[];
  invitedByMemberId: string;
  expiresAt: string;
  acceptedAt?: string;
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export type NotificationKind =
  | 'event_reminder'
  | 'event_created'
  | 'comment_added'
  | 'member_joined'
  /** An admin made a password reset link for this person. Never quiet. */
  | 'password_reset_created'
  | 'invitation_received'
  | 'conflict_detected'
  /** A time capsule's day has come (domain/capsules.ts). */
  | 'capsule_opened'
  /** The morning of this person's birthday: the family's wishes are theirs to read. */
  | 'surprise_ready'
  /** Mother's Day, Midsummer, Christmas Eve... three days ahead (domain/special-days.ts). */
  | 'special_day'
  /** For an admin: somebody reported an entry or a comment in it. Never says who. */
  | 'content_reported';

/** What can be reported, and why (docs/02-DATA-MODEL.md, Reports). */
export type ReportTarget = 'event' | 'comment';
export type ReportReason = 'inappropriate' | 'harassment' | 'spam' | 'other';
export const REPORT_REASONS: readonly ReportReason[] = ['inappropriate', 'harassment', 'spam', 'other'];
/** The server's limit for the note (apps/api/src/modules/reports). */
export const REPORT_NOTE_MAX = 500;

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  /**
   * Prewritten text - only the sample family has it. A notification from the
   * server carries facts instead (`actorName`, `eventTitle`) and is put into
   * words when it is drawn, in whatever language the reader has chosen: a
   * sentence composed on the server would be in one language for everybody,
   * and stay in it after the switch.
   */
  title?: string;
  body?: string;
  eventId?: string;
  eventTitle?: string;
  actorName?: string;
  /**
   * Who did it - on the sample family only, where the bell is filtered on
   * the device. The server leaves out what somebody the reader blocked did
   * before the list ever leaves it, and does not say who anybody else was.
   */
  actorMemberId?: string;
  /** A special day: which one (a key from domain/special-days.ts), and its date. */
  dayKey?: string;
  dayOn?: string;
  createdAt: string;
  readAt?: string;
}

// ---------------------------------------------------------------------------
// AI layer (MVP: rule-based, V2: LLM)
// ---------------------------------------------------------------------------

/**
 * A suggestion the user CONFIRMS. It never applies itself.
 * Rationale: the regulatory risk in the study about how AI suggestions may be
 * interpreted.
 */
export interface Suggestion {
  id: string;
  kind: 'category' | 'reminder_time' | 'conflict';
  /** What to show the user. Already localised. */
  message: string;
  /** 0..1 — below 0.6 it is not shown at all. */
  confidence: number;
  payload?: Record<string, unknown>;
}
