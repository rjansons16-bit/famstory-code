/**
 * Application state.
 *
 * TWO BACKENDS, ONE STORE. Without `EXPO_PUBLIC_API_URL` everything lives in
 * memory and comes from `mock.ts` — that is what the browser build, the design
 * review and the phone demo run on, and it needs no database. With the variable
 * set, the same actions talk to the server. `backend.ts` is the switch.
 *
 * HOW A WRITE BEHAVES. The local state changes first and the request goes out
 * behind it. A family app is used on a phone on a train; waiting for a round
 * trip before a tapped heart turns red would make the product feel broken on
 * exactly the connection it will mostly meet. When the server refuses, the
 * change is rolled back and `lastError` says so — see `syncFamily()` below.
 *
 * WHAT IS NEVER OPTIMISTIC: anything whose server answer the app then depends
 * on — signing in, creating the family, accepting an invitation. Those await.
 */

import { useMemo } from 'react';
import { create } from 'zustand';

import { track } from '@/domain/analytics';
import { bellFor } from '@/domain/notifications';
import { cleanInterests, mayEditInterests, type InterestKey } from '@/domain/interests';
import type {
  AppNotification,
  Attachment,
  Comment,
  Family,
  FamilyEvent,
  Group,
  Invitation,
  Member,
  MemberRole,
  NotifyKind,
  ReactionKind,
  ReportReason,
  ReportTarget,
  Session,
  User,
  Visibility,
  Wish,
} from '@/domain/types';
import {
  dayAsInstant,
  dayBefore,
  deviceTimeZone,
  timelinePlace,
  type RepeatRule,
} from '@/domain/recurrence';
import { can, canSee, withoutBlocked } from '@/domain/visibility';
import { newSinceLastVisit } from '@/domain/whats-new';
import { tf } from '@/i18n';
import { isAnniversaryOfToday } from '@/lib/date';
import { toFamilyPlan, type FamStoryApi, type FamilySnapshot } from './api';
import {
  clearTokens,
  currentRefreshToken,
  getApi,
  loadTokens,
  saveTokens,
  setSessionExpiredHandler,
} from './backend';
import { ApiError } from './http';
import { LEGAL_VERSION, legalTextsAreDrafts } from '@/legal/texts';
import { forgetPurchases } from '@/lib/purchases';
import { pushAvailable, pushPermission, pushToken, type PushPermission } from '@/lib/push';
import { useLocale } from './locale';
import {
  sampleComments,
  sampleEvents,
  sampleFamily,
  sampleMembers,
  sampleNotifications,
  sampleWishes,
} from './mock-lv';
import { persistedDraft, persistedSession } from './persist';
import { isLocal, readLocalFile, uploadAttachments, type UploadOutcome } from './uploads';
import {
  mockComments,
  mockEvents,
  mockFamily,
  mockGroups,
  mockInvitations,
  mockMembers,
  mockNotifications,
  mockSession,
  mockWishes,
} from './mock';

/**
 * Somebody who pressed "Get started" on the demo (no server): nobody yet.
 * It used to be the sample family's Anna under a new name, so the profile
 * read the name typed on "About you" over anna.berg@example.com, and joining
 * a family made them Anna (2026-09-28).
 */
/** The sample family, in the language the app is read in (data/mock-lv.ts). */
function sampleNow() {
  const locale = useLocale.getState().locale;
  return {
    family: sampleFamily(mockFamily, locale),
    members: sampleMembers(mockMembers, locale),
    events: sampleEvents(mockEvents, locale),
    comments: sampleComments(mockComments, locale),
    notifications: sampleNotifications(mockNotifications, locale),
  };
}

function newcomer(): User {
  return {
    id: 'usr_you',
    email: '',
    displayName: '',
    locale: useLocale.getState().locale,
    createdAt: new Date().toISOString(),
  };
}

export interface AppState {
  // --- Session ---
  session: Session | null;
  onboardingComplete: boolean;
  /**
   * False until the persisted session has been read from disk.
   *
   * Without this the app renders the signed-out state for one frame and the
   * router redirects to the welcome screen before rehydration finishes — the
   * user gets bounced out of the app they were already signed in to.
   */
  hydrated: boolean;

  /**
   * The last thing the server refused, for the banner at the root.
   *
   * A write that is applied locally and then rejected has to say so, or the
   * user is looking at something that only exists on their screen.
   */
  lastError: { code: string; message: string } | null;
  dismissError(): void;

  // --- Data ---
  family: Family | null;
  members: Member[];
  groups: Group[];
  events: FamilyEvent[];
  comments: Comment[];
  invitations: Invitation[];
  notifications: AppNotification[];
  /**
   * Whom this person blocked (docs/02-DATA-MODEL.md, Blocks). Their own list:
   * it comes with the family on every load and is never kept on the device.
   */
  blockedMemberIds: string[];

  // --- Auth ---
  /**
   * `newUser` signs in with no family, which is the only way to reach the
   * onboarding screens. Without it those four screens are unreachable code.
   */
  signIn(
    method: 'email' | 'google' | 'apple',
    options?: {
      newUser?: boolean;
      /** Required against a live API. Ignored by the mock backend. */
      email?: string;
      password?: string;
    },
  ): Promise<void>;
  signOut(): void;
  /** Restores the persisted session on launch. Called once, from the root layout. */
  hydrate(): Promise<void>;
  /**
   * Reload the family and its events from the server.
   *
   * A no-op on the mock backend, where the data is already the whole truth.
   */
  refresh(): Promise<void>;
  /**
   * `refresh()` with the three things a screen should not have to own: one
   * request when two screens ask at once, a refusal that lands in the banner
   * instead of an unhandled rejection, and a timestamp for `lastSyncedAt`.
   */
  syncNow(): Promise<void>;
  /**
   * When the data last came from the server, or null while it never has.
   *
   * Read by the check that runs when the app returns to the foreground: a
   * refresh is worth a request after an hour in a pocket, not after two
   * seconds in the camera.
   */
  lastSyncedAt: number | null;
  /**
   * A copy of everything this account is, as JSON text, or null if the server
   * refused. GDPR Art. 15 and 20 - free on every plan.
   */
  exportMyData(): Promise<string | null>;
  /**
   * Start the 30-day deletion and sign out. GDPR Art. 17.
   *
   * False means the server refused and the account is untouched - the screen
   * must not claim otherwise, because the person has just been told their
   * data is going.
   */
  deleteMyAccount(): Promise<boolean>;
  /**
   * Comments for one event, fetched when it is opened.
   *
   * Not part of `refresh`: a timeline of fifty events would be fifty extra
   * requests for conversations nobody has scrolled to yet.
   */
  loadComments(eventId: string): Promise<void>;

  // --- Onboarding ---
  /**
   * Who you are inside the family: the name everyone sees, a face, a birthday.
   * Set before the family exists, so the name lands on the session first and is
   * carried onto the member row when `createFamily` runs.
   */
  updateMyProfile(patch: { displayName?: string; birthDate?: string; avatarUrl?: string }): void;
  /**
   * The birthday and the photo from "About you", waiting for a member row.
   *
   * That screen runs before the family exists, and they used to be written onto
   * the member list — which for a new account is empty, so they were gone by
   * the next screen. The name never had this problem: it lives on the account.
   * `createFamily` and `joinFamily` put these onto the row they create.
   */
  pendingProfile: { birthDate?: string; avatarUrl?: string; interests?: InterestKey[] };
  /**
   * What you like (domain/interests.ts): onto your member row, or - during
   * onboarding, before there is one - kept in `pendingProfile` for it.
   */
  setMyInterests(interests: readonly InterestKey[]): void;
  /** A child's interests, by the adult who manages the profile or an admin. */
  setChildInterests(memberId: string, interests: readonly InterestKey[]): void;
  /** True once the family exists. False means the reason is already in `lastError`. */
  createFamily(name: string): Promise<boolean>;
  /**
   * The family's name, by an administrator - what "you can change it later"
   * on the create-family screen promised. Shown at once; put back, with the
   * reason in `lastError`, if the server refuses.
   */
  renameFamily(name: string): void;
  /** True once the invitation is accepted. False means the reason is in `lastError`. */
  joinFamily(code: string): Promise<boolean>;
  /**
   * The invitation code somebody arrived with, kept across the sign-up detour.
   *
   * A link lands on /join/<code>, and an account has to exist before it can be
   * accepted. Without this the person walks through registration and arrives
   * at "create a family or join one" with the code back on the doormat - and
   * creating a second, empty family is the one mistake this app cannot undo.
   */
  pendingInviteCode: string | null;
  rememberInvite(code: string): void;
  /**
   * A child profile: no account of its own, managed by whoever adds it.
   * Returns null when there is no family yet — a child cannot exist outside one.
   */
  addChild(name: string): Promise<Member | null>;
  completeOnboarding(): void;

  // --- Events ---
  /**
   * Where the next, older page of the timeline starts, or null when there is
   * none. The refresh loads the newest fifty; this is how the rest arrives.
   */
  eventsCursor: string | null;
  loadingMore: boolean;
  /** The next page, appended. A no-op with nothing more, or on sample data. */
  loadMoreEvents(): Promise<void>;
  /**
   * Every event this viewer may see, not only the newest pages: for the
   * screens that look across years - the story shelf, a life story, the
   * traditions, growing up, the year's film.
   */
  loadArchive(): Promise<void>;
  /**
   * Events found elsewhere - a search that asked the server - put where the
   * event screen can find them. Only ones the server returned to this person,
   * so nothing arrives here that `canSee` would not also let through.
   */
  mergeEvents(events: FamilyEvent[]): void;
  addEvent(input: NewEventInput): FamilyEvent;
  updateEvent(id: string, patch: Partial<FamilyEvent>): void;
  /** "Not this week": one occurrence out of a series, the rest untouched. */
  skipOccurrence(id: string, day: string): void;
  /** The series ends with the occurrence before `day`; everything earlier stays. */
  stopRepeatingFrom(id: string, day: string): void;
  deleteEvent(id: string): void;
  /**
   * The last deleted event, held so it can be put back.
   *
   * A family chronicle that destroys a memory on one tap is harsh — and the
   * confirmation dialog does not really help, because the tap that matters was
   * already a mistake. The schema has had `deletedAt` all along; this is the
   * client half of it.
   */
  recentlyDeleted: { event: FamilyEvent; comments: Comment[] } | null;
  undoDelete(): void;
  dismissUndo(): void;
  toggleReaction(eventId: string, kind: ReactionKind): void;
  addComment(eventId: string, body: string): void;
  /**
   * "This should not be here" - somebody else's entry or comment, to the
   * family's admins and to whoever runs FamStory (docs/02-DATA-MODEL.md,
   * Reports). True once it is kept; on the sample family there is nobody to
   * send it to, and it says so the same way.
   */
  reportContent(target: ReportTarget, id: string, reason: ReportReason, note?: string): Promise<boolean>;
  /**
   * "I do not want to see what this person posts": their entries, comments
   * and reactions leave this person's view, and the bell says nothing they do.
   * Nobody is told. Applied at once, and taken back if the server refuses.
   */
  blockMember(memberId: string): void;
  unblockMember(memberId: string): void;

  // --- Family ---
  inviteMember(input: { email?: string; role: MemberRole; groupIds: string[] }): Invitation;
  updateMemberRole(memberId: string, role: MemberRole): void;
  removeMember(memberId: string): void;
  createGroup(name: string, memberIds: string[]): Group;
  updateGroup(id: string, patch: Partial<Group>): void;
  deleteGroup(id: string): void;

  // --- Notifications ---
  markNotificationRead(id: string): void;
  markAllNotificationsRead(): void;

  // --- Wish lists (domain/wishes.ts) ---
  /**
   * Per person, loaded when their profile is opened. From the server this is
   * already what this viewer may see; screens still read it through
   * `wishesVisibleTo`, which is what keeps the sample family honest too.
   */
  wishes: Record<string, Wish[]>;
  loadWishes(memberId: string): Promise<void>;
  /**
   * `claim`: "I'll get this" in the same breath - how a gift idea is taken
   * (domain/gifts.ts). Never on your own list.
   */
  addWish(memberId: string, text: string, options?: { claim?: boolean }): void;
  removeWish(memberId: string, wishId: string): void;
  toggleWishClaim(memberId: string, wishId: string): void;

  // --- In memoriam, and a face ---
  /** An admin marks the day somebody died (an ISO day), or takes it back (null). */
  setMemorial(memberId: string, diedOn: string | null): void;
  /**
   * A new photograph for a member, from a local file the picker returned.
   * Shown at once from the file; uploaded behind it (avatars on the server).
   */
  setAvatar(memberId: string, localUri: string): void;

  // --- What changed since the last visit (domain/whats-new.ts) ---
  /**
   * When the previous visit began: "new" means added after this. Null on a
   * first visit, and on the welcome screen.
   */
  newSince: string | null;
  /** Events opened during this visit, which are no longer new. */
  openedEventIds: string[];
  /**
   * Begin a visit: remember when the previous one began and tell the server
   * this one has. Called at launch, at sign-in, and on coming back to the app
   * after VISIT_GAP_MS away.
   */
  startVisit(): Promise<void>;
  markEventOpened(id: string): void;

  // --- Subscription ---
  /** The sample family only: Premium on this device, nothing bought. */
  activatePremium(plan: 'monthly' | 'annual'): void;
  /**
   * After a purchase or a restore in the store: the server reads the family's
   * plan from RevenueCat, and this copy takes what it says. null when there
   * is no server, or it could not answer - the webhook brings it later.
   */
  syncSubscription(): Promise<'free' | 'premium' | null>;

  // --- Privacy ---
  /**
   * This person accepts the terms and the privacy policy this build publishes
   * (legal/texts.ts LEGAL_VERSION). False when the server did not keep it.
   */
  acceptTerms(): Promise<boolean>;
  /**
   * Gives (true) or withdraws (false) consent to keeping health information
   * this person writes - the Health category (GDPR Art. 9). The server keeps
   * it and refuses a new health entry without it. False when it was not saved.
   */
  setHealthConsent(on: boolean): Promise<boolean>;
  /**
   * Pushes on this phone (lib/push.ts): the token to the server when the
   * person has said yes - asking first when `ask` and the phone still may.
   * At every launch without asking, because a token can change. Answers what
   * the phone's permission is now, for Settings to show.
   */
  registerPush(ask: boolean): Promise<PushPermission>;
  /**
   * Whether the app may count what this person does (data/telemetry.ts).
   * Kept on the account, so it holds on every device they sign in on.
   */
  setShareUsageStats(on: boolean): void;

  // --- Notifications ---
  /**
   * One of the three switches on the settings screen. Kept on the account and
   * obeyed by the server, which is what decides who a notification is written
   * for - the app only shows the choice.
   */
  setNotify(kind: NotifyKind, on: boolean): void;
  /** What a new event's reminder starts at in the composer; undefined for none. */
  setDefaultReminder(minutes: number | undefined): void;
}

export interface NewEventInput {
  title: string;
  description?: string;
  startsAt: string;
  endsAt?: string;
  allDay: boolean;
  categoryId: FamilyEvent['categoryId'];
  participantMemberIds: string[];
  visibility: Visibility;
  attachments: FamilyEvent['attachments'];
  /** Recordings made in the composer; uploaded after the event, like photographs. */
  voiceNotes?: FamilyEvent['attachments'];
  tags: string[];
  isMilestone: boolean;
  reminderMinutesBefore?: number;
  /** Absent: once. */
  repeat?: RepeatRule;
  repeatUntil?: string;
  /** The question of the week this answers, when it does. */
  promptKey?: string;
  /** A time capsule: closed to everybody but its author until then. */
  sealedUntil?: string;
  /** A surprise for this member, kept from them until `revealAt`. */
  surpriseFor?: string;
  revealAt?: string;
  /** On the story shelf. */
  onStoryShelf?: boolean;
}

/**
 * How far back the archive screens reach: fifty pages of fifty. A family with
 * more than 2,500 memories sees its newest 2,500 there, which is years.
 */
const ARCHIVE_PAGES = 50;

let idCounter = 1000;
const nextId = (prefix: string) => `${prefix}_${++idCounter}`;

/**
 * A write that has already been applied locally.
 *
 * Nothing awaits this. The point of the optimistic update is that the screen
 * has already moved on; what this adds is the two things a fire-and-forget
 * would drop — the rollback, and a user-visible reason.
 *
 * `rollback` is what puts the state back. It runs before `lastError` is set,
 * so the banner never appears over a screen still showing the change it is
 * complaining about.
 */
interface SyncOptions {
  rollback?: () => void;
  onError: (error: AppError) => void;
}

/** A write inside a family. Does nothing until there is a family to write to. */
function syncFamily(
  run: (api: FamStoryApi, familyId: string) => Promise<unknown>,
  options: SyncOptions & { familyId: string | undefined },
): void {
  const api = getApi();
  if (!api || !options.familyId) return;
  send(run(api, options.familyId), options);
}

/**
 * A write against the signed-in user rather than a family.
 *
 * Separate because of when it happens: "About you" runs before the family
 * exists, so a family id is exactly the thing this call cannot wait for.
 */
function syncUser(run: (api: FamStoryApi) => Promise<unknown>, options: SyncOptions): void {
  const api = getApi();
  if (!api) return;
  send(run(api), options);
}

function send(request: Promise<unknown>, options: SyncOptions): void {
  void request.catch((error: unknown) => {
    options.rollback?.();
    options.onError(describeError(error));
  });
}

/**
 * The server's photographs and voice notes an edit no longer lists. Only when
 * the edit says what the list is now - a patch that leaves a list out leaves
 * it alone - and never a local one, which the server has not got.
 */
export function removedMedia(previous: FamilyEvent | undefined, patch: Partial<FamilyEvent>): Attachment[] {
  if (!previous) return [];
  const gone: Attachment[] = [];
  for (const key of ['attachments', 'voiceNotes'] as const) {
    const now = patch[key];
    if (!now) continue;
    const kept = new Set(now.map((a) => a.id));
    for (const a of previous[key] ?? []) if (!isLocal(a) && !kept.has(a.id)) gone.push(a);
  }
  return gone;
}

/** The banner for uploads that did not go up, or nothing. Photographs are named first. */
function uploadFailure(
  photos: UploadOutcome,
  recordings: UploadOutcome,
): { lastError: AppError } | null {
  if (photos.failed === 0 && recordings.failed === 0) return null;
  const error = photos.error ?? recordings.error;
  if (error) return { lastError: describeError(error) };
  return {
    lastError: {
      code: 'upload_failed',
      message:
        photos.failed > 0
          ? tf('event.uploadFailed', photos.failed)
          : tf('voice.uploadFailed', recordings.failed),
    },
  };
}

export interface AppError {
  code: string;
  message: string;
}

/** The same audience, whatever order the lists came in. */
function sameVisibility(a: Visibility, b: Visibility | undefined): boolean {
  if (!b || a.kind !== b.kind) return false;
  const same = (x: string[] = [], y: string[] = []) =>
    x.length === y.length && [...x].sort().every((id, i) => id === [...y].sort()[i]);
  return same(a.groupIds, b.groupIds) && same(a.memberIds, b.memberIds);
}

/** Whatever went wrong, in the two fields a banner can render. */
export function describeError(error: unknown): AppError {
  if (error instanceof ApiError) return { code: error.code, message: error.message };
  // A dropped connection is the common case and does not arrive as an ApiError.
  return {
    code: 'network_unreachable',
    message: error instanceof Error ? error.message : 'The server could not be reached.',
  };
}

/**
 * The refresh currently in flight, shared by everyone who asks for one.
 *
 * Module level rather than state: two screens mounted at once both ask on the
 * same pull, and a second `me()` would be a second full snapshot for nothing.
 */
let inFlightSync: Promise<void> | null = null;

/**
 * Which sign-in the store is holding: one more with every sign-out.
 *
 * An answer that set off before a sign-out - a refresh on its way when "Sign
 * out" was pressed, which is what coming back to the window starts - belongs
 * to nobody by the time it arrives, and put into the store it signed that
 * person straight back in: the owner, 2026-10-01, "the first time it throws me
 * to the start, only the second time can I sign out". Each such answer checks
 * this before it writes anything.
 */
let signedInAs = 0;

/**
 * The push token this phone gave the server for the signed-in account, so
 * signing out can take it back. Kept in memory only: the next launch asks the
 * phone again (registerPush), and nothing about pushes is written to disk.
 */
let pushRegisteredToken: string | null = null;

export const useApp = create<AppState>((set, get) => ({
  session: null,
  onboardingComplete: false,
  hydrated: false,

  family: null,
  members: [],
  groups: [],
  events: [],
  comments: [],
  invitations: [],
  notifications: [],
  blockedMemberIds: [],
  recentlyDeleted: null,
  lastError: null,
  lastSyncedAt: null,
  pendingProfile: {},
  pendingInviteCode: null,
  newSince: null,
  openedEventIds: [],
  wishes: {},
  eventsCursor: null,
  loadingMore: false,

  async loadMoreEvents() {
    const api = getApi();
    const familyId = get().family?.id;
    const cursor = get().eventsCursor;
    if (!api || !familyId || !cursor || get().loadingMore) return;

    set({ loadingMore: true });
    const asked = signedInAs;
    try {
      const page = await api.listEvents(familyId, { limit: 50, cursor });
      if (asked !== signedInAs) return;
      const known = new Set(get().events.map((e) => e.id));
      set({
        events: [...get().events, ...page.items.filter((e) => !known.has(e.id))],
        eventsCursor: page.nextCursor,
      });
    } catch (error) {
      set({ lastError: describeError(error) });
    } finally {
      set({ loadingMore: false });
    }
  },

  async loadArchive() {
    // The same pages the timeline scrolls through, to the end. A page that
    // brings nothing new - an error, or another load already running - ends it.
    for (let page = 0; page < ARCHIVE_PAGES && get().eventsCursor; page++) {
      const before = get().eventsCursor;
      await get().loadMoreEvents();
      if (get().eventsCursor === before) break;
    }
  },

  mergeEvents(found) {
    const known = new Set(get().events.map((e) => e.id));
    const fresh = found.filter((e) => !known.has(e.id));
    if (fresh.length > 0) set({ events: [...get().events, ...fresh] });
  },

  async loadWishes(memberId) {
    const api = getApi();
    const familyId = get().family?.id;

    if (!api) {
      // The sample family's lists, once; after that whatever this session did.
      if (!get().wishes[memberId]) {
        set({
          wishes: {
            ...get().wishes,
            [memberId]: sampleWishes(mockWishes[memberId] ?? [], useLocale.getState().locale),
          },
        });
      }
      return;
    }
    if (!familyId) return;

    try {
      const list = await api.listWishes(familyId, memberId);
      set({ wishes: { ...get().wishes, [memberId]: list } });
    } catch (error) {
      set({ lastError: describeError(error) });
    }
  },

  addWish(memberId, text, options) {
    const me = get().session?.activeMemberId;
    const clean = text.trim().replace(/\s+/g, ' ');
    if (!me || clean.length < 2) return;
    // Nobody claims on their own list: they cannot see the claims.
    const claim = options?.claim === true && memberId !== me;

    const local: Wish = {
      id: nextId('wish'),
      text: clean,
      addedByMemberId: me,
      claimedByMemberId: claim ? me : null,
      createdAt: new Date().toISOString(),
    };
    const before = get().wishes;
    set({ wishes: { ...before, [memberId]: [...(before[memberId] ?? []), local] } });

    syncFamily(
      async (api, familyId) => {
        const saved = await api.addWish(familyId, memberId, clean, claim);
        const list = get().wishes[memberId] ?? [];
        set({ wishes: { ...get().wishes, [memberId]: list.map((w) => (w.id === local.id ? saved : w)) } });
      },
      {
        familyId: get().family?.id,
        rollback: () => set({ wishes: before }),
        onError: (e) => set({ lastError: e }),
      },
    );
  },

  removeWish(memberId, wishId) {
    const before = get().wishes;
    set({
      wishes: { ...before, [memberId]: (before[memberId] ?? []).filter((w) => w.id !== wishId) },
    });
    syncFamily((api, familyId) => api.removeWish(familyId, wishId), {
      familyId: get().family?.id,
      rollback: () => set({ wishes: before }),
      onError: (e) => set({ lastError: e }),
    });
  },

  toggleWishClaim(memberId, wishId) {
    const me = get().session?.activeMemberId;
    if (!me) return;
    const before = get().wishes;
    const list = before[memberId] ?? [];
    set({
      wishes: {
        ...before,
        [memberId]: list.map((w) =>
          w.id === wishId
            ? { ...w, claimedByMemberId: w.claimedByMemberId === me ? null : me }
            : w,
        ),
      },
    });
    syncFamily(
      async (api, familyId) => {
        const saved = await api.toggleWishClaim(familyId, wishId);
        const current = get().wishes[memberId] ?? [];
        set({ wishes: { ...get().wishes, [memberId]: current.map((w) => (w.id === wishId ? saved : w)) } });
      },
      {
        familyId: get().family?.id,
        rollback: () => set({ wishes: before }),
        onError: (e) => set({ lastError: e }),
      },
    );
  },

  setMemorial(memberId, diedOn) {
    const before = get().members;
    set({
      members: before.map((m) => (m.id === memberId ? { ...m, diedOn: diedOn ?? undefined } : m)),
    });
    syncFamily((api, familyId) => api.setMemorial(familyId, memberId, diedOn), {
      familyId: get().family?.id,
      rollback: () => set({ members: before }),
      onError: (e) => set({ lastError: e }),
    });
  },

  setAvatar(memberId, localUri) {
    const before = get().members;
    // The file this phone already has, straight away. Everybody else gets the
    // server's copy with their next refresh.
    set({ members: before.map((m) => (m.id === memberId ? { ...m, avatarUrl: localUri } : m)) });
    syncFamily(
      async (api, familyId) => {
        const file = await readLocalFile(localUri);
        await api.uploadAvatar(familyId, memberId, file);
      },
      {
        familyId: get().family?.id,
        rollback: () => set({ members: before }),
        onError: (e) => set({ lastError: e }),
      },
    );
  },

  async startVisit() {
    const familyId = get().family?.id;
    set({ openedEventIds: [] });

    // A visit is what retention is counted in (docs/00-PLAN.md section 6):
    // the launch, and coming back after VISIT_GAP_MS away - not every return
    // from the camera.
    if (familyId) {
      const since = Date.now() - Date.parse(get().session?.user.createdAt ?? '');
      track({
        name: 'app_opened',
        daysSinceSignup: Number.isFinite(since) ? Math.max(0, Math.floor(since / 864e5)) : 0,
      });
    }

    const api = getApi();
    if (!api) {
      // The sample family has no server to remember a visit, so it pretends
      // the last one was ten days ago - which is what shows the demo what this
      // does, with Martin's two recent events marked.
      set({ newSince: familyId ? new Date(Date.now() - 10 * 864e5).toISOString() : null });
      return;
    }
    if (!familyId) return;

    const asked = signedInAs;
    try {
      const { previousSeenAt } = await api.markSeen(familyId);
      if (asked !== signedInAs) return;
      set({ newSince: previousSeenAt });
    } catch {
      // Not worth a banner: the timeline is all there, only the "new" marks
      // are missing, and the next visit tries again.
    }
  },

  markEventOpened(id) {
    if (get().openedEventIds.includes(id)) return;
    set({ openedEventIds: [...get().openedEventIds, id] });
  },

  rememberInvite(code) {
    set({ pendingInviteCode: code.trim().toUpperCase() });
  },

  dismissError() {
    set({ lastError: null });
  },

  // -------------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------------

  async hydrate() {
    const api = getApi();

    if (api) {
      // A refresh that fails has nowhere left to go, and the session is over.
      setSessionExpiredHandler(() => get().signOut());

      if (!(await loadTokens())) {
        set({ hydrated: true });
        return;
      }

      try {
        await get().refresh();
        set({ hydrated: true, lastSyncedAt: Date.now() });
        void get().startVisit();
      } catch (error) {
        // A 401 means these tokens are dead, and keeping them would make every
        // later request fail: the app would look broken rather than signed out.
        //
        // Anything else — no network, a server that is down, a train tunnel —
        // is temporary, and throwing the tokens away for it would sign somebody
        // out of their own family because they went through a tunnel. The
        // launch still finishes; the next one, with a signal, restores them.
        if (error instanceof ApiError && error.isAuthFailure) {
          await clearTokens();
          set({ session: null, hydrated: true });
        } else {
          set({ hydrated: true, lastError: describeError(error) });
        }
      }
      return;
    }

    const stored = await persistedSession.read();

    if (!stored) {
      set({ hydrated: true });
      return;
    }

    if (stored.kind === 'new') {
      // Signed in, but the family was never created: onboarding is unfinished.
      set({
        session: { user: newcomer(), activeFamilyId: '', activeMemberId: '' },
        onboardingComplete: false,
        hydrated: true,
      });
      return;
    }

    set({
      session: mockSession,
      ...sampleNow(),
      groups: mockGroups,
      invitations: mockInvitations,
      onboardingComplete: stored.onboardingComplete,
      hydrated: true,
    });
    void get().startVisit();
  },

  /**
   * Everything this family has, from the server.
   *
   * The order matters: the membership comes from `/users/me`, and only then is
   * there a family id to ask anything else about. A user with no membership is
   * signed in but has not finished onboarding — that is a state, not an error.
   */
  syncNow() {
    // The mock backend is already the whole truth, and pulling down on it
    // would spin a wheel over data that cannot have changed.
    if (!getApi()) return Promise.resolve();
    if (inFlightSync) return inFlightSync;

    const asked = signedInAs;
    inFlightSync = get()
      .refresh()
      .then(() => {
        if (asked === signedInAs) set({ lastSyncedAt: Date.now() });
      })
      .catch((error: unknown) => {
        if (asked !== signedInAs) return;
        // Whatever is on screen stays: rows from an hour ago that a person can
        // read beat an empty screen that is technically up to date.
        //
        // A dead session is the one silence worth keeping — the HTTP client is
        // already signing the user out, and a banner about it would appear on
        // top of the welcome screen.
        if (error instanceof ApiError && error.isAuthFailure) return;
        set({ lastError: describeError(error) });
      })
      .finally(() => {
        inFlightSync = null;
      });

    return inFlightSync;
  },

  async exportMyData() {
    const api = getApi();

    if (api) {
      try {
        return JSON.stringify(await api.exportMyData(), null, 2);
      } catch (error) {
        set({ lastError: describeError(error) });
        return null;
      }
    }

    // On sample data the file is what this device is showing. Anything else
    // would be a button that works everywhere except where it is demonstrated.
    const { session, family, members, groups, events, comments } = get();
    return JSON.stringify(
      {
        format: 'famstory.export.v1',
        exportedAt: new Date().toISOString(),
        you: session?.user ?? null,
        families: family ? [{ family, members, groups }] : [],
        events,
        comments,
      },
      null,
      2,
    );
  },

  async reportContent(target, id, reason, note) {
    const familyId = get().family?.id;
    if (!familyId) return false;
    track({ name: 'content_reported', target, reason });

    const api = getApi();
    if (!api) return true;
    try {
      const text = note?.trim();
      await api.reportContent(familyId, { target, id, reason, ...(text ? { note: text } : {}) });
      return true;
    } catch (error) {
      set({ lastError: describeError(error) });
      return false;
    }
  },

  blockMember(memberId) {
    const before = get().blockedMemberIds;
    if (before.includes(memberId) || memberId === get().session?.activeMemberId) return;
    track({ name: 'member_blocked' });
    set({ blockedMemberIds: [...before, memberId] });

    syncFamily((api, familyId) => api.blockMember(familyId, memberId), {
      familyId: get().family?.id,
      rollback: () => set({ blockedMemberIds: before }),
      onError: (e) => set({ lastError: e }),
    });
  },

  unblockMember(memberId) {
    const before = get().blockedMemberIds;
    if (!before.includes(memberId)) return;
    track({ name: 'member_unblocked' });
    set({ blockedMemberIds: before.filter((id) => id !== memberId) });

    // What the server left out while they were blocked comes back with a
    // load, not from this device, which never had it. A load that fails is
    // not a failed unblock, so it is not what the rollback answers to.
    syncFamily(
      (api, familyId) =>
        api.unblockMember(familyId, memberId).then(() => {
          void get().refresh().catch(() => undefined);
        }),
      {
        familyId: get().family?.id,
        rollback: () => set({ blockedMemberIds: before }),
        onError: (e) => set({ lastError: e }),
      },
    );
  },

  async deleteMyAccount() {
    const api = getApi();

    if (api) {
      try {
        await api.deleteMe();
      } catch (error) {
        set({ lastError: describeError(error) });
        return false;
      }
    }

    // Every session was revoked on the server; this one has to go too, or the
    // app keeps showing a family behind a token that no longer works.
    get().signOut();
    return true;
  },

  async refresh() {
    const api = getApi();
    if (!api) return;
    const asked = signedInAs;

    const me = await api.me();
    if (asked !== signedInAs) return;
    const membership = me.members[0];

    const user = {
      id: me.id,
      email: me.email,
      displayName: me.displayName,
      avatarUrl: me.avatarUrl ?? undefined,
      locale: (me.locale === 'lv' ? 'lv' : 'en') as User['locale'],
      createdAt: me.createdAt,
      shareUsageStats: me.shareUsageStats !== false,
      notifyEvents: me.notifyEvents !== false,
      notifyComments: me.notifyComments !== false,
      notifyReminders: me.notifyReminders !== false,
      defaultReminderMinutes: me.defaultReminderMinutes ?? undefined,
      // Absent from an older server: not known, so the app does not ask.
      ...(me.termsVersion !== undefined ? { termsVersion: me.termsVersion } : {}),
      ...(me.healthConsentAt !== undefined ? { healthConsent: me.healthConsentAt !== null } : {}),
    };

    if (!membership) {
      set({
        session: { user, activeFamilyId: '', activeMemberId: '' },
        onboardingComplete: false,
        family: null,
        members: [],
        groups: [],
        events: [],
        comments: [],
        invitations: [],
        notifications: [],
        blockedMemberIds: [],
      });
      return;
    }

    const familyId = membership.family.id;
    const snapshot = await api.getFamily(familyId);
    const { items: newest, nextCursor } = await api.listEvents(familyId, { limit: 50 });
    // The series as well, whatever their date: a weekly practice that began
    // in January is on every calendar page, and would otherwise have fallen
    // off the end of the newest fifty. Not worth failing the refresh over.
    const series = await api
      .listEvents(familyId, { repeating: true, limit: 50 })
      .then((page) => page.items)
      .catch(() => []);
    const items = [...newest, ...series.filter((s) => !newest.some((e) => e.id === s.id))];

    // Only an admin may list invitations. A member asking is not an error
    // worth showing anybody, so the family loads without them.
    const invitations = await api.listInvitations(familyId).catch(() => []);
    // The bell is not worth failing a refresh over either: without it the
    // family still loads, and the next refresh tries again.
    const notifications = await api.listNotifications(familyId).catch(() => get().notifications);
    if (asked !== signedInAs) return;

    set({
      session: { user, activeFamilyId: familyId, activeMemberId: membership.id },
      family: snapshot.family,
      members: snapshot.members,
      groups: snapshot.groups,
      blockedMemberIds: snapshot.blockedMemberIds,
      events: items,
      // A refresh starts the chronicle again from the newest page; older ones
      // come back as the timeline is scrolled (loadMoreEvents).
      eventsCursor: nextCursor,
      comments: [],
      invitations,
      notifications,
      onboardingComplete: true,
    });
  },

  async loadComments(eventId) {
    const api = getApi();
    const familyId = get().session?.activeFamilyId;
    if (!api || !familyId) return;

    const asked = signedInAs;
    try {
      const fetched = await api.listComments(familyId, eventId);
      if (asked !== signedInAs) return;
      set({
        comments: [...get().comments.filter((c) => c.eventId !== eventId), ...fetched],
      });
    } catch (error) {
      set({ lastError: describeError(error) });
    }
  },

  async signIn(method, options) {
    const api = getApi();

    if (api) {
      const email = options?.email?.trim() ?? '';
      const password = options?.password ?? '';

      // Google and Apple need an id token from a native sign-in SDK, and there
      // is no point pretending otherwise: a button that silently signs somebody
      // in as a mock user is worse than one that says it is not wired yet.
      if (method !== 'email') {
        set({
          lastError: {
            code: 'provider_unavailable',
            message: 'Google and Apple sign-in need a native build. Use email for now.',
          },
        });
        throw new Error('provider_unavailable');
      }

      const auth = options?.newUser
        ? await api.register({
            email,
            password,
            // The real name is asked for on the next screen ("About you") and
            // lands through PATCH /users/me. Registering needs *something*, and
            // the local part of the address is a better placeholder than "New
            // user" — it is at least the person's own word.
            displayName: email.split('@')[0] || 'Me',
            // The sign-up screen shows the terms and the privacy policy it
            // agrees to; the server keeps which version that was - once
            // they are final, not while they are a draft with blanks.
            acceptedTerms: LEGAL_VERSION && !legalTextsAreDrafts() ? LEGAL_VERSION : undefined,
          })
        : await api.login({ email, password });

      await saveTokens(auth);
      setSessionExpiredHandler(() => get().signOut());
      track({ name: 'signup_completed', method });
      set({ pendingProfile: {} });
      await get().refresh();
      void get().startVisit();
      return;
    }

    track({ name: 'signup_completed', method });

    if (options?.newUser) {
      void persistedSession.write({ kind: 'new', onboardingComplete: false });
      // A brand-new account: signed in, but no family yet. index.tsx sends
      // this state to onboarding.
      set({
        session: { user: newcomer(), activeFamilyId: '', activeMemberId: '' },
        onboardingComplete: false,
        family: null,
        members: [],
        groups: [],
        events: [],
        comments: [],
        invitations: [],
        notifications: [],
        blockedMemberIds: [],
        pendingProfile: {},
      });
      return;
    }

    void persistedSession.write({ kind: 'existing', onboardingComplete: true });
    set({
      session: mockSession,
      ...sampleNow(),
      groups: mockGroups,
      invitations: mockInvitations,
      blockedMemberIds: [],
      // The mock user already has a family, so onboarding is skipped.
      onboardingComplete: true,
    });
    void get().startVisit();
  },

  signOut() {
    signedInAs += 1;
    const api = getApi();
    const refreshToken = currentRefreshToken();

    if (api && refreshToken) {
      // Revoked on the server, not merely forgotten on this device — a token
      // that still works somewhere is not a sign-out.
      void api.logout(refreshToken).catch(() => undefined);
    }
    // And this phone stops getting this account's pushes - asked before the
    // tokens go, while the request can still say who is asking.
    if (api && pushRegisteredToken) {
      void api.unregisterDevice(pushRegisteredToken).catch(() => undefined);
    }
    pushRegisteredToken = null;
    void clearTokens();
    setSessionExpiredHandler(null);
    // RevenueCat knew this phone as the family; the next person is not.
    void forgetPurchases();

    void persistedSession.clear();
    void persistedDraft.clear();
    set({
      session: null,
      onboardingComplete: false,
      family: null,
      members: [],
      groups: [],
      events: [],
      comments: [],
      invitations: [],
      notifications: [],
      // Held-for-undo data is still family data. Leaving it behind would let
      // the next person to sign in on this device restore someone else's event.
      recentlyDeleted: null,
      lastError: null,
      // And a birthday typed by whoever onboarded on this device last.
      pendingProfile: {},
      // And an invitation somebody opened here. Left behind, it would send the
      // next person to sign up on this device straight into another family's
      // join screen, with the code already filled in.
      pendingInviteCode: null,
      // And whose visit this was: the next person's "new" is their own.
      newSince: null,
      openedEventIds: [],
      // And whom they blocked, which is theirs alone.
      blockedMemberIds: [],
      // And the wish lists - somebody else's surprises.
      wishes: {},
      eventsCursor: null,
      loadingMore: false,
    });
  },

  // -------------------------------------------------------------------------
  // Onboarding
  // -------------------------------------------------------------------------

  updateMyProfile(patch) {
    const state = get();
    const session = state.session;
    if (!session) return;

    const displayName = patch.displayName?.trim();
    if (patch.displayName !== undefined && !displayName) return;

    const hasMemberRow = state.members.some((m) => m.id === session.activeMemberId);

    set({
      session: displayName
        ? { ...session, user: { ...session.user, displayName } }
        : session,
      // The member row is what the timeline and the avatars read. Moving only
      // the user would leave the family looking at the placeholder name.
      members: state.members.map((m) =>
        m.id === session.activeMemberId
          ? {
              ...m,
              ...(displayName ? { displayName } : null),
              ...(patch.birthDate ? { birthDate: patch.birthDate } : null),
              ...(patch.avatarUrl ? { avatarUrl: patch.avatarUrl } : null),
            }
          : m,
      ),
      // No row yet: "About you" runs before the family exists. Kept for the
      // row that creating or joining one is about to make.
      pendingProfile: hasMemberRow
        ? state.pendingProfile
        : {
            ...state.pendingProfile,
            ...(patch.birthDate ? { birthDate: patch.birthDate } : null),
            ...(patch.avatarUrl ? { avatarUrl: patch.avatarUrl } : null),
          },
    });

    // Sent after the change is on screen. With a family, to the member row the
    // family actually reads (and the server carries the name on to the
    // account); before one exists, "About you" has only the account to write.
    //
    // The photograph goes up as a file of its own (setAvatar), never as a
    // URL field: a file:// address on the server would be a broken image for
    // everybody else. Before the family exists it waits in pendingProfile.
    const rollback = () => set({ session, members: state.members });

    if (hasMemberRow && patch.avatarUrl) get().setAvatar(session.activeMemberId, patch.avatarUrl);

    if (hasMemberRow) {
      const memberPatch = {
        ...(displayName ? { displayName } : null),
        ...(patch.birthDate !== undefined ? { birthDate: patch.birthDate } : null),
      };
      if (Object.keys(memberPatch).length === 0) return;

      syncFamily((api, familyId) => api.updateMyMember(familyId, memberPatch), {
        familyId: state.family?.id,
        rollback,
        onError: (e) => set({ lastError: e }),
      });
      return;
    }

    if (displayName) {
      syncUser((api) => api.updateMe({ displayName }), {
        rollback,
        onError: (e) => set({ lastError: e }),
      });
    }
  },

  setMyInterests(interests) {
    const state = get();
    const session = state.session;
    if (!session) return;
    const clean = cleanInterests(interests);

    // Onboarding asks before the family exists; creating or joining one puts
    // these on the row it makes, as it does the birthday.
    if (!state.members.some((m) => m.id === session.activeMemberId)) {
      set({ pendingProfile: { ...state.pendingProfile, interests: clean } });
      return;
    }

    const before = state.members;
    set({ members: before.map((m) => (m.id === session.activeMemberId ? { ...m, interests: clean } : m)) });
    syncFamily((api, familyId) => api.updateMyMember(familyId, { interests: clean }), {
      familyId: state.family?.id,
      rollback: () => set({ members: before }),
      onError: (e) => set({ lastError: e }),
    });
  },

  setChildInterests(memberId, interests) {
    const state = get();
    const me = state.members.find((m) => m.id === state.session?.activeMemberId);
    const child = state.members.find((m) => m.id === memberId);
    if (!me || !child || child.id === me.id || !mayEditInterests(me, child)) return;
    const clean = cleanInterests(interests);

    const before = state.members;
    set({ members: before.map((m) => (m.id === memberId ? { ...m, interests: clean } : m)) });
    syncFamily((api, familyId) => api.updateChildInterests(familyId, memberId, clean), {
      familyId: state.family?.id,
      rollback: () => set({ members: before }),
      onError: (e) => set({ lastError: e }),
    });
  },

  async createFamily(name) {
    const api = getApi();
    const pending = get().pendingProfile;

    if (api) {
      // Awaited, not optimistic: everything after this — the member id, the
      // three system groups, the first event — is addressed by ids the server
      // makes. Guessing them locally and reconciling later would mean two
      // sources of truth during the one flow that has no data to fall back on.
      let snapshot: FamilySnapshot;
      try {
        snapshot = await api.createFamily({
          name,
          birthDate: pending.birthDate,
          interests: pending.interests,
        });
      } catch (error) {
        // Reported, and the caller stays where it is: the next screen adds
        // people to a family, and there is no family to add them to.
        set({ lastError: describeError(error) });
        return false;
      }
      track({ name: 'family_created' });

      // From here the family exists, so nothing below may report failure — a
      // second press would make a second family. The creator's own row is in
      // the snapshot the server returned; no second request is needed to find it.
      const userId = get().session?.user.id;
      const membership = snapshot.members.find((m) => m.userId === userId);

      set({
        family: snapshot.family,
        members: snapshot.members,
        groups: snapshot.groups,
        events: [],
        comments: [],
        invitations: [],
        notifications: [],
        blockedMemberIds: [],
        session: get().session
          ? {
              ...get().session!,
              activeFamilyId: snapshot.family.id,
              activeMemberId: membership?.id ?? '',
            }
          : null,
        pendingProfile: {},
      });
      // The photograph from "About you", now that there is a row to put it on.
      if (membership && pending.avatarUrl) get().setAvatar(membership.id, pending.avatarUrl);
      return true;
    }

    track({ name: 'family_created' });
    const familyId = nextId('fam');
    const memberId = nextId('mem');
    const user = get().session?.user ?? newcomer();
    const previous = get().members.find((m) => m.id === get().session?.activeMemberId);
    // Still `new`: onboarding is not finished, and the family that was just
    // created lives only in memory. SecureStore is for small values, so a full
    // snapshot does not belong there — with the real API this family would
    // already exist on the server and come back from GET /users/me.
    void persistedSession.write({ kind: 'new', onboardingComplete: false });

    const parents: Group = {
      id: nextId('grp'),
      familyId,
      name: 'Parents',
      isSystem: true,
      icon: 'parents',
      memberIds: [memberId],
    };
    const children: Group = {
      id: nextId('grp'),
      familyId,
      name: 'Children',
      isSystem: true,
      icon: 'children',
      memberIds: [],
    };
    const grandparents: Group = {
      id: nextId('grp'),
      familyId,
      name: 'Grandparents',
      isSystem: true,
      icon: 'grandparents',
      memberIds: [],
    };

    set({
      family: { id: familyId, name, createdAt: new Date().toISOString(), plan: 'free', locale: 'en' },
      members: [
        {
          id: memberId,
          familyId,
          userId: user.id,
          displayName: user.displayName,
          // Anything already entered on "About you" — that screen runs before
          // the family exists, so it has been waiting in `pendingProfile`.
          avatarUrl: previous?.avatarUrl ?? pending.avatarUrl,
          birthDate: previous?.birthDate ?? pending.birthDate,
          interests: previous?.interests ?? pending.interests ?? [],
          role: 'admin',
          status: 'active',
          groupIds: [parents.id],
          joinedAt: new Date().toISOString(),
        },
      ],
      groups: [parents, children, grandparents],
      events: [],
      comments: [],
      invitations: [],
      notifications: [],
      blockedMemberIds: [],
      session: { user, activeFamilyId: familyId, activeMemberId: memberId },
      pendingProfile: {},
    });
    return true;
  },

  async joinFamily(code) {
    const api = getApi();
    const pending = get().pendingProfile;

    if (api) {
      try {
        await api.acceptInvitation(code, {
          birthDate: pending.birthDate,
          interests: pending.interests,
        });
      } catch (error) {
        set({ lastError: describeError(error) });
        return false;
      }
      track({ name: 'invitation_accepted', role: 'member' });
      set({ pendingProfile: {}, pendingInviteCode: null });

      // The code is used up now, so this counts as joined even if loading the
      // family fails: pressing Join again could only be told the code is gone.
      // The bar says what failed, and the next launch loads the family.
      try {
        await get().refresh();
        const mine = get().session?.activeMemberId;
        if (mine && pending.avatarUrl) get().setAvatar(mine, pending.avatarUrl);
      } catch (error) {
        set({ lastError: describeError(error) });
      }
      return true;
    }

    track({ name: 'invitation_accepted', role: 'member' });
    void persistedSession.write({ kind: 'new', onboardingComplete: false });
    // Into the sample family as a new member, under the name from "About
    // you" - not as Anna, who is already in it.
    const user = get().session?.user ?? newcomer();
    const joined: Member = {
      id: nextId('mem'),
      familyId: mockFamily.id,
      userId: user.id,
      displayName: user.displayName,
      avatarUrl: pending.avatarUrl,
      birthDate: pending.birthDate,
      interests: pending.interests ?? [],
      role: 'member',
      status: 'active',
      groupIds: [],
      joinedAt: new Date().toISOString(),
    };
    const sample = sampleNow();
    set({
      session: { user, activeFamilyId: mockFamily.id, activeMemberId: joined.id },
      ...sample,
      members: [...sample.members, joined],
      groups: mockGroups,
      invitations: [],
      blockedMemberIds: [],
      pendingProfile: {},
    });
    return true;
  },

  async addChild(name) {
    const state = get();
    const trimmed = name.trim();
    const family = state.family;
    const guardian = state.session?.activeMemberId;
    if (!family || !guardian || !trimmed) return null;

    const api = getApi();
    if (api) {
      // Awaited: the caller uses the returned member straight away, and the
      // guardian link is a regulatory field the server writes, not the client.
      try {
        const child = await api.createChild(family.id, {
          displayName: trimmed,
          managedByMemberId: guardian,
        });
        set({ members: [...state.members, child] });
        return child;
      } catch (error) {
        set({ lastError: describeError(error) });
        return null;
      }
    }

    const childrenGroup = state.groups.find((g) => g.isSystem && g.icon === 'children');

    const child: Member = {
      id: nextId('mem'),
      familyId: family.id,
      // No account. A child never signs in; the parent's account carries them.
      userId: null,
      displayName: trimmed,
      role: 'child',
      status: 'active',
      // Regulatory, not convenience: every child profile names the adult behind
      // it. docs/06-PRIVACY-GDPR.md.
      managedByMemberId: guardian,
      groupIds: childrenGroup ? [childrenGroup.id] : [],
      joinedAt: new Date().toISOString(),
    };

    set({
      members: [...state.members, child],
      groups: state.groups.map((g) =>
        g.id === childrenGroup?.id ? { ...g, memberIds: [...g.memberIds, child.id] } : g,
      ),
    });

    return child;
  },

  completeOnboarding() {
    void persistedSession.write({ kind: 'existing', onboardingComplete: true });
    set({ onboardingComplete: true });
  },

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  addEvent(input) {
    const state = get();
    const now = new Date().toISOString();
    const id = nextId('evt');

    const event: FamilyEvent = {
      id,
      familyId: state.family?.id ?? '',
      title: input.title,
      description: input.description,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      allDay: input.allDay,
      categoryId: input.categoryId,
      participantMemberIds: input.participantMemberIds,
      authorMemberId: state.session?.activeMemberId ?? '',
      visibility: input.visibility,
      attachments: input.attachments,
      voiceNotes: input.voiceNotes ?? [],
      tags: input.tags,
      reactions: [],
      commentCount: 0,
      reminder:
        input.reminderMinutesBefore !== undefined
          ? {
              id: nextId('rem'),
              eventId: id,
              minutesBefore: input.reminderMinutesBefore,
              enabled: true,
            }
          : undefined,
      createdAt: now,
      updatedAt: now,
      isMilestone: input.isMilestone,
      repeat: input.repeat,
      repeatUntil: input.repeat ? input.repeatUntil : undefined,
      repeatSkips: input.repeat ? [] : undefined,
      // The zone this phone is in: "Tuesdays at 18:00" means 18:00 here.
      repeatTimeZone: input.repeat ? deviceTimeZone() : undefined,
      promptKey: input.promptKey,
      sealedUntil: input.sealedUntil,
      // Its author sees inside; the envelope is for everybody else.
      sealed: false,
      hiddenFromMemberId: input.surpriseFor,
      revealAt: input.surpriseFor ? input.revealAt : undefined,
      onStoryShelf: input.onStoryShelf ?? false,
    };

    track({
      name: 'event_created',
      categoryId: event.categoryId,
      hasMedia: event.attachments.length > 0,
      hasVoice: (event.voiceNotes?.length ?? 0) > 0,
      visibilityKind: event.visibility.kind,
    });
    if (input.promptKey) track({ name: 'weekly_question_answered', key: input.promptKey });
    if (input.sealedUntil) {
      track({ name: 'capsule_created', yearsAhead: yearsBetween(now, input.sealedUntil) });
    }
    if (input.surpriseFor && input.revealAt) {
      track({ name: 'surprise_wish_added', inDays: daysBetween(now, input.revealAt) });
    }

    set({ events: [event, ...state.events] });

    // The local row carries a local id. When the server answers, the whole row
    // is replaced by the server's — same position in the list, real id, real
    // visibility (which the server may have narrowed for a child).
    syncFamily(
      async (api, familyId) => {
        const saved = await api.createEvent(familyId, {
          title: input.title,
          description: input.description,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          allDay: input.allDay,
          categoryId: input.categoryId,
          isMilestone: input.isMilestone,
          tags: input.tags,
          participantMemberIds: input.participantMemberIds,
          visibility: input.visibility,
          reminder:
            input.reminderMinutesBefore !== undefined
              ? { minutesBefore: input.reminderMinutesBefore }
              : undefined,
          repeat: event.repeat ?? null,
          repeatUntil: event.repeatUntil ?? null,
          repeatTimeZone: event.repeatTimeZone ?? null,
          promptKey: input.promptKey,
          ...(input.sealedUntil ? { sealedUntil: input.sealedUntil } : null),
          ...(input.surpriseFor && input.revealAt
            ? { surpriseFor: input.surpriseFor, revealAt: input.revealAt }
            : null),
          ...(input.onStoryShelf ? { onStoryShelf: true } : null),
        });
        // The saved row has no attachments yet - they are uploaded against
        // its id, below - so the local previews are carried across. Without
        // this the photographs would blink out the moment the event saved.
        set({
          events: get().events.map((e) =>
            e.id === id ? { ...saved, attachments: e.attachments, voiceNotes: e.voiceNotes } : e,
          ),
        });

        const voices = input.voiceNotes ?? [];
        if (input.attachments.length === 0 && voices.length === 0) return;

        const photos = await uploadAttachments(api, familyId, saved.id, input.attachments);
        const recordings = await uploadAttachments(api, familyId, saved.id, voices);

        set({
          events: get().events.map((e) =>
            e.id === saved.id
              ? { ...e, attachments: photos.attachments, voiceNotes: recordings.attachments }
              : e,
          ),
          // Said out loud, because the event is saved and looks complete: a
          // photograph that silently did not go up is the one failure a family
          // would only discover on somebody else's phone, months later.
          ...uploadFailure(photos, recordings),
        });
      },
      {
        familyId: state.family?.id,
        rollback: () => set({ events: get().events.filter((e) => e.id !== id) }),
        onError: (e) => set({ lastError: e }),
      },
    );

    return event;
  },

  updateEvent(id, patch) {
    const before = get().events;
    const previous = before.find((e) => e.id === id);
    // A series that starts repeating now is kept in this phone's zone, like a
    // new one. One that already repeats keeps the zone it was made in.
    const zone =
      patch.repeat && !previous?.repeatTimeZone ? { repeatTimeZone: deviceTimeZone() } : null;

    set({
      events: before.map((e) =>
        e.id === id ? { ...e, ...patch, ...zone, updatedAt: new Date().toISOString() } : e,
      ),
    });

    syncFamily(
      async (api, familyId) => {
        // Visibility travels its own road, because that is the road that
        // audits - and only when it changed. The composer sends the whole
        // event back on every edit, and each save used to write "visibility
        // changed from family to family" into the audit log.
        if (patch.visibility && !sameVisibility(patch.visibility, previous?.visibility)) {
          await api.changeVisibility(familyId, id, patch.visibility);
        }

        // What the edit took out. It used to stay on the server - a photograph
        // removed in the composer came back the moment the event saved - and a
        // voice note somebody did not want kept must actually go.
        for (const gone of removedMedia(previous, patch)) {
          await api.deleteAttachment(familyId, gone.id);
        }

        const saved = await api.updateEvent(familyId, id, {
          title: patch.title,
          description: patch.description,
          startsAt: patch.startsAt,
          endsAt: patch.endsAt,
          allDay: patch.allDay,
          categoryId: patch.categoryId,
          isMilestone: patch.isMilestone,
          tags: patch.tags,
          participantMemberIds: patch.participantMemberIds,
          // Present in the patch only when the caller changed it: null takes
          // the reminder off, and leaving it out leaves it alone. It used to be
          // left out always, so a reminder changed while editing never reached
          // the server.
          ...('reminder' in patch
            ? { reminder: patch.reminder ? { minutesBefore: patch.reminder.minutesBefore } : null }
            : null),
          ...('repeat' in patch ? { repeat: patch.repeat ?? null } : null),
          ...('repeatUntil' in patch ? { repeatUntil: patch.repeatUntil ?? null } : null),
          ...(zone ? zone : null),
          ...(patch.repeatSkips ? { repeatSkips: patch.repeatSkips } : null),
          ...('sealedUntil' in patch ? { sealedUntil: patch.sealedUntil ?? null } : null),
          ...('onStoryShelf' in patch ? { onStoryShelf: patch.onStoryShelf === true } : null),
        });

        // The update reply carries what the server already has. Anything
        // still local was added in this edit and has to go up.
        const local = (patch.attachments ?? []).filter(isLocal);
        const localVoices = (patch.voiceNotes ?? []).filter(isLocal);
        const savedVoices = saved.voiceNotes ?? [];
        set({
          events: get().events.map((e) =>
            e.id === id
              ? {
                  ...saved,
                  attachments: [...saved.attachments, ...local],
                  voiceNotes: [...savedVoices, ...localVoices],
                }
              : e,
          ),
        });

        if (local.length === 0 && localVoices.length === 0) return;

        const photos = await uploadAttachments(api, familyId, id, local);
        const recordings = await uploadAttachments(api, familyId, id, localVoices);
        set({
          events: get().events.map((e) =>
            e.id === id
              ? {
                  ...e,
                  attachments: [...saved.attachments, ...photos.attachments],
                  voiceNotes: [...savedVoices, ...recordings.attachments],
                }
              : e,
          ),
          ...uploadFailure(photos, recordings),
        });
      },
      {
        familyId: get().family?.id,
        rollback: () => set({ events: before }),
        onError: (e) => set({ lastError: e }),
      },
    );
  },

  skipOccurrence(id, day) {
    const event = get().events.find((e) => e.id === id);
    if (!event?.repeat) return;
    const skips = event.repeatSkips ?? [];
    if (skips.includes(day)) return;
    get().updateEvent(id, { repeatSkips: [...skips, day].sort() });
  },

  stopRepeatingFrom(id, day) {
    const event = get().events.find((e) => e.id === id);
    if (!event?.repeat) return;
    get().updateEvent(id, { repeatUntil: dayAsInstant(dayBefore(day)) });
  },

  deleteEvent(id) {
    const state = get();
    const event = state.events.find((e) => e.id === id);
    if (!event) return;

    // Sent straight away rather than held for the undo window: the delete has
    // to survive the app being closed in the six seconds the bar is up, and the
    // server delete is soft, so `restore` can still take it back.
    syncFamily((api, familyId) => api.deleteEvent(familyId, id), {
      familyId: state.family?.id,
      rollback: () =>
        set({
          events: [event, ...get().events],
          comments: [...get().comments, ...state.comments.filter((c) => c.eventId === id)],
          recentlyDeleted: null,
        }),
      onError: (e) => set({ lastError: e }),
    });

    set({
      events: state.events.filter((e) => e.id !== id),
      comments: state.comments.filter((c) => c.eventId !== id),
      recentlyDeleted: {
        event,
        // The comments go with it. Restoring an event without the conversation
        // that hung off it would be a quieter kind of data loss.
        comments: state.comments.filter((c) => c.eventId === id),
      },
    });
  },

  undoDelete() {
    const pending = get().recentlyDeleted;
    if (!pending) return;

    set({
      events: [pending.event, ...get().events],
      comments: [...get().comments, ...pending.comments],
      recentlyDeleted: null,
    });

    // The same id comes back from the server too — that is what makes the
    // comments, reactions and reminders still point at something.
    syncFamily((api, familyId) => api.restoreEvent(familyId, pending.event.id), {
      familyId: get().family?.id,
      rollback: () =>
        set({
          events: get().events.filter((e) => e.id !== pending.event.id),
          comments: get().comments.filter((c) => c.eventId !== pending.event.id),
        }),
      onError: (e) => set({ lastError: e }),
    });
  },

  dismissUndo() {
    set({ recentlyDeleted: null });
  },

  toggleReaction(eventId, kind) {
    const memberId = get().session?.activeMemberId;
    if (!memberId) return;

    const before = get().events;
    syncFamily((api, familyId) => api.toggleReaction(familyId, eventId, kind), {
      familyId: get().family?.id,
      rollback: () => set({ events: before }),
      onError: (e) => set({ lastError: e }),
    });

    set({
      events: get().events.map((e) => {
        if (e.id !== eventId) return e;
        const existing = e.reactions.find((r) => r.memberId === memberId);
        if (existing?.kind === kind) {
          return { ...e, reactions: e.reactions.filter((r) => r.memberId !== memberId) };
        }
        track({ name: 'reaction_added', kind });
        return {
          ...e,
          reactions: [...e.reactions.filter((r) => r.memberId !== memberId), { memberId, kind }],
        };
      }),
    });
  },

  addComment(eventId, body) {
    const memberId = get().session?.activeMemberId;
    if (!memberId || !body.trim()) return;

    track({ name: 'comment_added' });
    const comment: Comment = {
      id: nextId('cmt'),
      eventId,
      authorMemberId: memberId,
      body: body.trim(),
      createdAt: new Date().toISOString(),
    };

    const before = { comments: get().comments, events: get().events };
    set({
      comments: [...get().comments, comment],
      events: get().events.map((e) =>
        e.id === eventId ? { ...e, commentCount: e.commentCount + 1 } : e,
      ),
    });

    syncFamily(
      async (api, familyId) => {
        const saved = await api.addComment(familyId, eventId, body.trim());
        set({ comments: get().comments.map((c) => (c.id === comment.id ? saved : c)) });
      },
      {
        familyId: get().family?.id,
        rollback: () => set(before),
        onError: (e) => set({ lastError: e }),
      },
    );
  },

  // -------------------------------------------------------------------------
  // Family
  // -------------------------------------------------------------------------

  inviteMember({ email, role, groupIds }) {
    const state = get();
    track({
      name: 'invitation_sent',
      channel: email ? 'email' : 'link',
      role,
    });

    const invitation: Invitation = {
      id: nextId('inv'),
      familyId: state.family?.id ?? '',
      email: email ?? null,
      code: `FAM-${Math.floor(1000 + Math.random() * 9000)}`,
      role,
      groupIds,
      invitedByMemberId: state.session?.activeMemberId ?? '',
      expiresAt: new Date(Date.now() + 14 * 864e5).toISOString(),
    };

    const before = state.invitations;
    set({ invitations: [...before, invitation] });

    syncFamily(
      async (api, familyId) => {
        const saved = await api.invite(familyId, { email, role, groupIds });
        // The code the family reads out loud is the server's, not the random
        // one this device invented a moment ago.
        set({
          invitations: get().invitations.map((i) => (i.id === invitation.id ? saved : i)),
        });
      },
      {
        familyId: state.family?.id,
        rollback: () => set({ invitations: before }),
        onError: (e) => set({ lastError: e }),
      },
    );

    return invitation;
  },

  updateMemberRole(memberId, role) {
    const before = get().members;
    set({ members: before.map((m) => (m.id === memberId ? { ...m, role } : m)) });

    syncFamily((api, familyId) => api.updateMemberRole(familyId, memberId, role), {
      familyId: get().family?.id,
      rollback: () => set({ members: before }),
      onError: (e) => set({ lastError: e }),
    });
  },

  removeMember(memberId) {
    // The member is not deleted, only marked. Their events and comments stay
    // in the family chronicle. That is a deliberate choice: a person can leave
    // a family; the family's history does not leave with them.
    const before = get().members;
    set({
      members: before.map((m) => (m.id === memberId ? { ...m, status: 'removed' as const } : m)),
    });

    syncFamily((api, familyId) => api.removeMember(familyId, memberId), {
      familyId: get().family?.id,
      rollback: () => set({ members: before }),
      onError: (e) => set({ lastError: e }),
    });
  },

  createGroup(name, memberIds) {
    track({ name: 'group_created' });
    const group: Group = {
      id: nextId('grp'),
      familyId: get().family?.id ?? '',
      name,
      isSystem: false,
      memberIds,
    };
    const before = { groups: get().groups, members: get().members };
    set({
      groups: [...get().groups, group],
      members: get().members.map((m) =>
        memberIds.includes(m.id) ? { ...m, groupIds: [...m.groupIds, group.id] } : m,
      ),
    });

    syncFamily(
      async (api, familyId) => {
        const saved = await api.createGroup(familyId, { name, memberIds });
        set({
          groups: get().groups.map((g) => (g.id === group.id ? saved : g)),
          members: get().members.map((m) =>
            m.groupIds.includes(group.id)
              ? { ...m, groupIds: m.groupIds.map((id) => (id === group.id ? saved.id : id)) }
              : m,
          ),
        });
      },
      {
        familyId: get().family?.id,
        rollback: () => set(before),
        onError: (e) => set({ lastError: e }),
      },
    );

    return group;
  },

  renameFamily(name) {
    const state = get();
    const family = state.family;
    const me = state.members.find((m) => m.id === state.session?.activeMemberId);
    const trimmed = name.trim();
    // An administrator's, as on the server - also on the sample family, where
    // nothing else would stop it.
    if (!family || !me || !can(me, 'family.edit') || !trimmed || trimmed === family.name) return;
    set({ family: { ...family, name: trimmed } });

    syncFamily((api, familyId) => api.updateFamily(familyId, { name: trimmed }), {
      familyId: family.id,
      rollback: () => {
        const now = get().family;
        if (now) set({ family: { ...now, name: family.name } });
      },
      onError: (e) => set({ lastError: e }),
    });
  },

  updateGroup(id, patch) {
    const before = get().groups;
    set({ groups: before.map((g) => (g.id === id ? { ...g, ...patch } : g)) });

    syncFamily(
      (api, familyId) =>
        api.updateGroup(familyId, id, { name: patch.name, memberIds: patch.memberIds }),
      {
        familyId: get().family?.id,
        rollback: () => set({ groups: before }),
        onError: (e) => set({ lastError: e }),
      },
    );
  },

  deleteGroup(id) {
    // System groups are never deleted — they exist because of the roles.
    const group = get().groups.find((g) => g.id === id);
    if (!group || group.isSystem) return;

    const before = { groups: get().groups, members: get().members, events: get().events };
    syncFamily((api, familyId) => api.deleteGroup(familyId, id), {
      familyId: get().family?.id,
      rollback: () => set(before),
      onError: (e) => set({ lastError: e }),
    });

    set({
      groups: get().groups.filter((g) => g.id !== id),
      members: get().members.map((m) => ({
        ...m,
        groupIds: m.groupIds.filter((gid) => gid !== id),
      })),
      // Events that were visible only to this group become private to their
      // author. Fail closed — deleting a group never opens data wider. A
      // custom audience keeps its people: only the group leaves it.
      events: get().events.map((e) => {
        const { kind } = e.visibility;
        if (kind !== 'groups' && kind !== 'custom') return e;
        if (!(e.visibility.groupIds ?? []).includes(id)) return e;

        const groupIds = (e.visibility.groupIds ?? []).filter((gid) => gid !== id);
        const memberIds = kind === 'custom' ? (e.visibility.memberIds ?? []) : [];
        if (groupIds.length === 0 && memberIds.length === 0) {
          return { ...e, visibility: { kind: 'private' as const } };
        }
        return {
          ...e,
          visibility:
            kind === 'custom'
              ? { kind: 'custom' as const, groupIds, memberIds }
              : { kind: 'groups' as const, groupIds },
        };
      }),
    });
  },

  // -------------------------------------------------------------------------
  // Notifications
  // -------------------------------------------------------------------------

  markNotificationRead(id) {
    const before = get().notifications;
    if (before.find((n) => n.id === id)?.readAt) return;

    set({
      notifications: before.map((n) =>
        n.id === id ? { ...n, readAt: new Date().toISOString() } : n,
      ),
    });

    syncFamily((api, familyId) => api.markNotificationRead(familyId, id), {
      familyId: get().family?.id,
      rollback: () => set({ notifications: before }),
      onError: (e) => set({ lastError: e }),
    });
  },

  markAllNotificationsRead() {
    const before = get().notifications;
    const now = new Date().toISOString();
    set({ notifications: before.map((n) => ({ ...n, readAt: n.readAt ?? now })) });

    syncFamily((api, familyId) => api.markAllNotificationsRead(familyId), {
      familyId: get().family?.id,
      rollback: () => set({ notifications: before }),
      onError: (e) => set({ lastError: e }),
    });
  },

  // -------------------------------------------------------------------------
  // Subscription
  // -------------------------------------------------------------------------

  activatePremium(plan) {
    // Only where there is no server to sell anything: the sample family. A
    // real purchase goes through the store and comes back as the server's
    // answer (syncSubscription), never as this.
    if (getApi()) return;
    track({ name: 'subscription_started', plan });
    const family = get().family;
    if (family) set({ family: { ...family, plan: 'premium' } });
  },

  async syncSubscription() {
    const api = getApi();
    const familyId = get().family?.id;
    if (!api || !familyId) return null;
    try {
      const answer = await api.syncSubscription(familyId);
      const family = get().family;
      // Another family by now (signed out, switched): this answer is not theirs.
      if (!family || family.id !== familyId) return null;
      const { plan, subscription } = toFamilyPlan(answer.plan, answer);
      const next = { ...family, plan };
      if (subscription) next.subscription = subscription;
      else delete next.subscription;
      set({ family: next });
      return plan;
    } catch {
      return null;
    }
  },

  async acceptTerms() {
    const api = getApi();
    const session = get().session;
    if (!api || !session || !LEGAL_VERSION) return false;
    try {
      const saved = await api.acceptTerms(LEGAL_VERSION);
      const now = get().session;
      if (now?.user.id === session.user.id) {
        set({ session: { ...now, user: { ...now.user, termsVersion: saved.termsVersion } } });
      }
      return saved.termsVersion === LEGAL_VERSION;
    } catch {
      return false;
    }
  },

  async registerPush(ask) {
    if (!pushAvailable()) return 'unavailable';
    const api = getApi();
    // The sample family has no server to tell, so it never asks.
    if (!api || !get().session) return pushPermission();

    const asked = signedInAs;
    const result = await pushToken(ask);
    if (!result) return 'unavailable';
    if (result.asked) track({ name: 'push_answered', granted: result.granted });
    if (result.granted && result.token && asked === signedInAs) {
      try {
        await api.registerDevice({
          platform: result.platform,
          token: result.token,
          locale: useLocale.getState().locale,
        });
        pushRegisteredToken = result.token;
      } catch {
        // The bell inside the app still works; the next launch tries again.
      }
    }
    return result.granted ? 'granted' : pushPermission();
  },

  async setHealthConsent(on) {
    const api = getApi();
    const session = get().session;
    if (!api || !session) return false;
    try {
      const saved = await api.updateMe({ healthConsent: on });
      const given = Boolean((saved as { healthConsentAt?: string | null }).healthConsentAt);
      const now = get().session;
      if (now?.user.id === session.user.id) {
        set({ session: { ...now, user: { ...now.user, healthConsent: given } } });
      }
      return given === on;
    } catch {
      return false;
    }
  },

  setShareUsageStats(on) {
    const session = get().session;
    if (!session || session.user.shareUsageStats === on) return;

    set({ session: { ...session, user: { ...session.user, shareUsageStats: on } } });
    syncUser((api) => api.updateMe({ shareUsageStats: on }), {
      rollback: () => set({ session }),
      onError: (e) => set({ lastError: e }),
    });
  },

  setNotify(kind, on) {
    const session = get().session;
    const field = NOTIFY_FIELD[kind];
    if (!session || (session.user[field] !== false) === on) return;

    set({ session: { ...session, user: { ...session.user, [field]: on } } });
    syncUser((api) => api.updateMe({ [field]: on }), {
      rollback: () => set({ session }),
      onError: (e) => set({ lastError: e }),
    });
  },

  setDefaultReminder(minutes) {
    const session = get().session;
    if (!session || session.user.defaultReminderMinutes === minutes) return;

    set({ session: { ...session, user: { ...session.user, defaultReminderMinutes: minutes } } });
    syncUser((api) => api.updateMe({ defaultReminderMinutes: minutes ?? null }), {
      rollback: () => set({ session }),
      onError: (e) => set({ lastError: e }),
    });
  },
}));

/** The account field behind each switch (User.notify* on the server too). */
const NOTIFY_FIELD = {
  events: 'notifyEvents',
  comments: 'notifyComments',
  reminders: 'notifyReminders',
} as const satisfies Record<NotifyKind, keyof User>;

// ---------------------------------------------------------------------------
// Selectors
//
// Every list that reaches a screen goes through canSee(). There is no path
// anywhere that renders events without the visibility check.
// ---------------------------------------------------------------------------

export function useCurrentMember(): Member | null {
  return useApp((s) => s.members.find((m) => m.id === s.session?.activeMemberId) ?? null);
}

export function useVisibleEvents(): FamilyEvent[] {
  // Deriving MUST NOT happen inside the selector: zustand compares snapshots
  // by reference, and a fresh array on every call causes an infinite render
  // loop ("The result of getSnapshot should be cached").
  // So the store returns stable references and the filter lives in useMemo.
  const events = useApp((s) => s.events);
  const members = useApp((s) => s.members);
  const activeMemberId = useApp((s) => s.session?.activeMemberId);
  const blocked = useApp((s) => s.blockedMemberIds);
  const blockedComments = useBlockedComments(blocked);

  return useMemo(() => {
    const me = members.find((m) => m.id === activeMemberId);
    if (!me) return [];
    return events
      .filter((e) => canSee(e, me, blocked))
      .map((e) => withoutBlocked(e, blocked, blockedComments))
      .sort((a, b) => +new Date(b.startsAt) - +new Date(a.startsAt));
  }, [events, members, activeMemberId, blocked, blockedComments]);
}

const NO_COMMENTS: readonly Comment[] = [];

/**
 * The comments this device holds by people the viewer blocked - what the
 * counts leave out. One unchanging empty list when nobody is blocked, so a
 * new comment does not rebuild every list of events for nothing.
 */
function useBlockedComments(blocked: readonly string[]): readonly Comment[] {
  const comments = useApp((s) => s.comments);
  return useMemo(
    () =>
      blocked.length === 0 ? NO_COMMENTS : comments.filter((c) => blocked.includes(c.authorMemberId)),
    [comments, blocked],
  );
}

/**
 * "On this day" — the same calendar day in an earlier year.
 *
 * The study rates retention as a critical risk, and nothing else in the app
 * brings a user back between events. This costs one date comparison: no new
 * table, no new endpoint, no notification infrastructure.
 *
 * It runs through the same `canSee()` as everything else. A hidden event does
 * not become visible because it happens to have an anniversary.
 */
export function useOnThisDay(): FamilyEvent[] {
  const events = useApp((s) => s.events);
  const members = useApp((s) => s.members);
  const activeMemberId = useApp((s) => s.session?.activeMemberId);
  const blocked = useApp((s) => s.blockedMemberIds);

  return useMemo(() => {
    const me = members.find((m) => m.id === activeMemberId);
    if (!me) return [];

    return events
      .filter((e) => isAnniversaryOfToday(e.startsAt) && canSee(e, me, blocked))
      .sort((a, b) => +new Date(b.startsAt) - +new Date(a.startsAt));
  }, [events, members, activeMemberId, blocked]);
}

/**
 * The timeline's list: what `useVisibleEvents` gives, with each repeating
 * series placed once, at its next occurrence (or its last, once it is over) -
 * see `timelinePlace`. Newest first, like the rest of the chronicle.
 */
export function useTimelineEvents(): FamilyEvent[] {
  const visible = useVisibleEvents();
  return useMemo(() => {
    const now = new Date();
    return visible
      .map((event) => timelinePlace(event, now))
      .sort((a, b) => +new Date(b.startsAt) - +new Date(a.startsAt));
  }, [visible]);
}

/**
 * What the others added since this person's previous visit, newest first.
 *
 * Built on `useVisibleEvents`, so it can only ever count what `canSee` already
 * let through - a "4 new" that included a hidden event would be a leak in the
 * form of a number.
 */
export function useWhatsNew(): FamilyEvent[] {
  const visible = useVisibleEvents();
  const since = useApp((s) => s.newSince);
  const opened = useApp((s) => s.openedEventIds);
  const memberId = useApp((s) => s.session?.activeMemberId);

  return useMemo(
    () => newSinceLastVisit(visible, { since, memberId, opened }),
    [visible, since, memberId, opened],
  );
}

export function useMemberLookup(): (id: string) => Member | undefined {
  const members = useApp((s) => s.members);
  return (id: string) => members.find((m) => m.id === id);
}

export function useUnreadCount(): number {
  return useApp((s) => bellFor(s.notifications, s.blockedMemberIds).filter((n) => !n.readAt).length);
}

/** The bell, without what somebody this person blocked did (`bellFor`). */
export function useBell(): AppNotification[] {
  const notifications = useApp((s) => s.notifications);
  const blocked = useApp((s) => s.blockedMemberIds);
  return useMemo(() => bellFor(notifications, blocked), [notifications, blocked]);
}

/**
 * The server keeps its own copy of the language.
 *
 * Not for the screens - those read the store directly - but for everything the
 * server writes: a notification, an invitation email, a reminder. Fire and
 * forget, because a preference that failed to reach the server is not worth a
 * banner over a family's timeline; the next change sends it again.
 */
useLocale.subscribe((state, previous) => {
  if (state.locale === previous.locale) return;

  const api = getApi();
  if (!api || !useApp.getState().session) return;

  void api.updateMe({ locale: state.locale }).catch(() => undefined);
});

/**
 * The sample family in the language just chosen (data/mock-lv.ts): its own
 * entries change their words, and anything added to the demo stays as it was
 * written. Only without a server - a real family's words are its own.
 */
useLocale.subscribe((state, previous) => {
  if (state.locale === previous.locale || getApi()) return;
  const app = useApp.getState();
  if (!app.family) return;
  useApp.setState({
    family: sampleFamily(app.family, state.locale),
    members: sampleMembers(app.members, state.locale),
    events: sampleEvents(app.events, state.locale),
    comments: sampleComments(app.comments, state.locale),
    notifications: sampleNotifications(app.notifications, state.locale),
    wishes: Object.fromEntries(
      Object.entries(app.wishes).map(([memberId, list]) => [memberId, sampleWishes(list, state.locale)]),
    ),
  });
});

/** Whole years from one moment to another, for a capsule's telemetry. */
function yearsBetween(from: string, to: string): number {
  return Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / (365.25 * 86_400_000)));
}

/** Whole days from one moment to another. */
function daysBetween(from: string, to: string): number {
  return Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000));
}
