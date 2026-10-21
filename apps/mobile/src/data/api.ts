/**
 * Typed FamStory API client.
 *
 * This layer does two things and only two:
 *   1. Names the endpoints (docs/05-API.md) as TypeScript methods.
 *   2. Translates server responses into domain types (domain/types.ts).
 *
 * The second point matters more than it looks. The server returns a relational
 * shape (separate `visibility` and `participants` rows) while screens work with
 * a flattened `FamilyEvent`. If that translation happened in the screens, each
 * one would know about the DB layout, and a backend change would mean
 * rewriting 18 screens.
 */

import type {
  AppNotification,
  Attachment,
  CalendarFeed,
  Comment,
  Family,
  FamilyEvent,
  Group,
  GuestLink,
  GuestView,
  Invitation,
  Member,
  MemberRole,
  ReactionKind,
  RepeatRule,
  ReportReason,
  ReportTarget,
  Suggestion,
  User,
  Visibility,
  Wish,
} from '@/domain/types';
import { CATEGORY_BY_ID } from '@/domain/categories';
import { HttpClient } from './http';

// ---------------------------------------------------------------------------
// Server response shapes (only the parts we use)
// ---------------------------------------------------------------------------

interface ApiEvent {
  id: string;
  familyId: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  categoryId: string;
  /** Absent from an older server, which is read as no tags. */
  tags?: string[];
  isMilestone: boolean;
  repeat?: RepeatRule | null;
  repeatUntil?: string | null;
  repeatSkips?: string[];
  repeatTimeZone?: string | null;
  promptKey?: string | null;
  sealedUntil?: string | null;
  /** True when this is a time capsule's envelope: the contents were not sent. */
  sealed?: boolean;
  hiddenFromMemberId?: string | null;
  revealAt?: string | null;
  onStoryShelf?: boolean;
  authorMemberId: string;
  visibilityKind: 'family' | 'custom' | 'groups' | 'members' | 'private';
  visibility?: { groupId: string | null; memberId: string | null }[];
  participants?: { memberId: string }[];
  attachments?: ApiAttachment[];
  reactions?: { memberId: string; kind: ReactionKind }[];
  reminders?: { id: string; minutesBefore: number; enabled: boolean }[];
  _count?: { comments: number };
  createdAt: string;
  updatedAt: string;
}

interface ApiAttachment {
  id: string;
  kind: Attachment['kind'];
  storageKey: string;
  thumbnailKey: string | null;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  /** Signed, and only on an attachment that arrived with its event. */
  url?: string;
  thumbnailUrl?: string;
}

interface ApiNotification {
  id: string;
  kind: AppNotification['kind'];
  eventId: string | null;
  eventTitle: string | null;
  eventStartsAt: string | null;
  actorName: string | null;
  /** A special day's key and date; absent from an older server. */
  dayKey?: string | null;
  dayOn?: string | null;
  createdAt: string;
  readAt: string | null;
}

/** Where to put a photograph, from the server that will keep it. */
export interface UploadTarget {
  attachmentId: string;
  uploadUrl: string;
  method: 'PUT';
  expiresIn: number;
  maxBytes: number;
}

interface ApiMember {
  id: string;
  familyId: string;
  userId: string | null;
  displayName: string;
  avatarUrl: string | null;
  role: MemberRole;
  status: Member['status'];
  managedByMemberId: string | null;
  birthDate: string | null;
  diedOn?: string | null;
  /** Keys from domain/interests.ts; absent from an older server. */
  interests?: string[];
  joinedAt: string;
  groupLinks?: { groupId: string }[];
}

interface ApiGroup {
  id: string;
  familyId: string;
  name: string;
  icon: string | null;
  isSystem: boolean;
  members?: { memberId: string }[];
}

/** `POST /families/{id}/subscription/sync`, and the family's `subscription`. */
export interface ApiSubscription {
  plan: 'free' | 'premium';
  status: string | null;
  period?: 'monthly' | 'annual' | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  store?: 'app_store' | 'play_store' | 'promotional' | 'other' | null;
}

/** The plan the family is on, and what the paywall says about it. */
export function toFamilyPlan(
  plan: 'free' | 'premium' | undefined,
  subscription: ApiSubscription | null | undefined,
): Pick<Family, 'plan' | 'subscription'> {
  const effective = plan ?? (subscription?.plan === 'premium' && subscription.status === 'active' ? 'premium' : 'free');
  if (effective !== 'premium' || !subscription) return { plan: effective };
  return {
    plan: effective,
    subscription: {
      ...(subscription.period ? { period: subscription.period } : {}),
      ...(subscription.currentPeriodEnd ? { until: subscription.currentPeriodEnd } : {}),
      renews: !subscription.cancelAtPeriodEnd && Boolean(subscription.currentPeriodEnd),
      ...(subscription.store ? { store: subscription.store } : {}),
    },
  };
}

interface ApiFamily {
  id: string;
  name: string;
  coverUrl: string | null;
  locale: string;
  createdAt: string;
  members?: ApiMember[];
  groups?: ApiGroup[];
  /** The plan in force now (docs/05-API.md, Subscription). Older servers leave it out. */
  plan?: 'free' | 'premium';
  subscription?: ApiSubscription | null;
  /** Whom the reader blocked - their own list, on their own copy (docs/05-API.md, Blocks). */
  blockedMemberIds?: string[];
}

// ---------------------------------------------------------------------------
// Translation into domain types
// ---------------------------------------------------------------------------

function toVisibility(event: ApiEvent): Visibility {
  const rows = event.visibility ?? [];
  const groupIds = rows.map((r) => r.groupId).filter((id): id is string => Boolean(id));
  const memberIds = rows.map((r) => r.memberId).filter((id): id is string => Boolean(id));

  switch (event.visibilityKind) {
    // Groups and people at once - what the composer's audience sheet makes.
    // Missing until 2026-09-24, and it fell through to "family" below: the
    // badge told the author the whole family could see an event that, on the
    // server, only the people they had picked could.
    case 'custom':
      return { kind: 'custom', groupIds, memberIds };
    case 'groups':
      return { kind: 'groups', groupIds };
    case 'members':
      return { kind: 'members', memberIds };
    case 'private':
      return { kind: 'private' };
    default:
      return { kind: 'family' };
  }
}

/**
 * Attachments are stored as a storageKey, not a public link — see
 * docs/02-DATA-MODEL.md. The real URL is issued by the server, time-limited,
 * after the visibility check.
 */
function toAttachment(a: ApiAttachment, baseUrl: string): Attachment {
  return {
    id: a.id,
    kind: a.kind,
    // Signed by the server with the event that carried it - see
    // apps/api/src/modules/events/events.controller.ts. The endpoint below is
    // the fallback for a payload from an older server, and the way to get a
    // fresh link for one attachment once these have expired.
    url: a.url ?? `${baseUrl}/attachments/${a.id}/url`,
    thumbnailUrl:
      a.thumbnailUrl ??
      (a.thumbnailKey ? `${baseUrl}/attachments/${a.id}/url?variant=thumb` : undefined),
    width: a.width ?? undefined,
    height: a.height ?? undefined,
    durationSec: a.durationSec ?? undefined,
  };
}

function toEvent(e: ApiEvent, baseUrl: string): FamilyEvent {
  const reminder = e.reminders?.[0];
  return {
    id: e.id,
    familyId: e.familyId,
    title: e.title,
    description: e.description ?? undefined,
    startsAt: e.startsAt,
    endsAt: e.endsAt ?? undefined,
    allDay: e.allDay,
    // A category this version does not know - an older app, a newer server -
    // is "Other", not a timeline that cannot be drawn: every card looks its
    // category up, and an unknown one threw for the whole family.
    categoryId: e.categoryId in CATEGORY_BY_ID ? (e.categoryId as FamilyEvent['categoryId']) : 'other',
    // Saved all along and dropped here, so a tag vanished on the next refresh.
    tags: e.tags ?? [],
    participantMemberIds: (e.participants ?? []).map((p) => p.memberId),
    authorMemberId: e.authorMemberId,
    visibility: toVisibility(e),
    // One list on the server, two in the app: a voice note is never a cover.
    attachments: (e.attachments ?? []).filter((a) => a.kind !== 'audio').map((a) => toAttachment(a, baseUrl)),
    voiceNotes: (e.attachments ?? []).filter((a) => a.kind === 'audio').map((a) => toAttachment(a, baseUrl)),
    reactions: e.reactions ?? [],
    commentCount: e._count?.comments ?? 0,
    reminder: reminder
      ? {
          id: reminder.id,
          eventId: e.id,
          minutesBefore: reminder.minutesBefore,
          enabled: reminder.enabled,
        }
      : undefined,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    isMilestone: e.isMilestone,
    repeat: e.repeat ?? undefined,
    repeatUntil: e.repeatUntil ?? undefined,
    repeatSkips: e.repeat ? (e.repeatSkips ?? []) : undefined,
    repeatTimeZone: e.repeatTimeZone ?? undefined,
    promptKey: e.promptKey ?? undefined,
    sealedUntil: e.sealedUntil ?? undefined,
    sealed: e.sealed === true,
    hiddenFromMemberId: e.hiddenFromMemberId ?? undefined,
    revealAt: e.revealAt ?? undefined,
    onStoryShelf: e.onStoryShelf === true,
  };
}

function toMember(m: ApiMember): Member {
  return {
    id: m.id,
    familyId: m.familyId,
    userId: m.userId,
    displayName: m.displayName,
    avatarUrl: m.avatarUrl ?? undefined,
    role: m.role,
    status: m.status,
    managedByMemberId: m.managedByMemberId ?? undefined,
    birthDate: m.birthDate ?? undefined,
    diedOn: m.diedOn ?? undefined,
    interests: m.interests ?? [],
    groupIds: (m.groupLinks ?? []).map((g) => g.groupId),
    joinedAt: m.joinedAt,
  };
}

function toGroup(g: ApiGroup): Group {
  return {
    id: g.id,
    familyId: g.familyId,
    name: g.name,
    isSystem: g.isSystem,
    icon: g.icon ?? undefined,
    memberIds: (g.members ?? []).map((m) => m.memberId),
  };
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export interface FamilySnapshot {
  family: Family;
  members: Member[];
  groups: Group[];
  blockedMemberIds: string[];
}

export class FamStoryApi {
  constructor(
    private readonly http: HttpClient,
    private readonly baseUrl: string,
  ) {}

  // --- Auth ---

  /** `acceptedTerms`: the version of the terms and privacy policy shown at sign-up (legal/texts.ts). */
  register(input: { email: string; password: string; displayName: string; locale?: string; acceptedTerms?: string }) {
    return this.http.post<AuthResponse>('/auth/email/register', input, { skipAuth: true });
  }

  login(input: { email: string; password: string }) {
    return this.http.post<AuthResponse>('/auth/email/login', input, { skipAuth: true });
  }

  loginWithGoogle(idToken: string) {
    return this.http.post<AuthResponse>('/auth/google', { idToken }, { skipAuth: true });
  }

  loginWithApple(identityToken: string, displayName?: string) {
    return this.http.post<AuthResponse>(
      '/auth/apple',
      { identityToken, displayName },
      { skipAuth: true },
    );
  }

  logout(refreshToken: string) {
    return this.http.post<void>('/auth/logout', { refreshToken }, { skipAuth: true });
  }

  me() {
    return this.http.get<MeResponse>('/users/me');
  }

  /** This person accepted that version of the terms and the privacy policy (app/terms.tsx). */
  acceptTerms(version: string) {
    return this.http.post<{ termsVersion: string | null; termsAcceptedAt: string | null }>('/users/me/terms', {
      version,
    });
  }

  updateMe(patch: {
    displayName?: string;
    avatarUrl?: string;
    locale?: string;
    shareUsageStats?: boolean;
    notifyEvents?: boolean;
    notifyComments?: boolean;
    notifyReminders?: boolean;
    /** null clears it: new events start without a reminder again. */
    defaultReminderMinutes?: number | null;
    /** Explicit consent for health information: true gives it, false withdraws it. */
    healthConsent?: boolean;
  }) {
    return this.http.patch<User>('/users/me', patch);
  }

  /**
   * A batch of product events (data/telemetry.ts). The server keeps only the
   * names and fields it knows, and nothing at all for somebody who said no.
   */
  sendTelemetry(familyId: string | undefined, events: TelemetryEvent[]) {
    return this.http.post<void>('/telemetry/events', { familyId, events });
  }

  /**
   * One error the app ran into. Without a session on purpose: it may happen
   * before sign-in, and the report carries nobody in it (docs/05-API.md).
   */
  reportError(report: ErrorReport) {
    return this.http.post<void>('/telemetry/errors', report, { skipAuth: true });
  }

  /**
   * Your own name, birthday and interests in one family - the row the
   * timeline, the avatars, the birthday strip and the gift ideas read.
   * `birthDate: null` clears it.
   */
  updateMyMember(
    familyId: string,
    patch: { displayName?: string; birthDate?: string | null; interests?: string[] },
  ) {
    return this.http.patch<ApiMember>(`/families/${familyId}/me`, patch);
  }

  /** A child's interests, by an adult who manages the profile or an admin. */
  async updateChildInterests(familyId: string, memberId: string, interests: string[]): Promise<Member> {
    return toMember(
      await this.http.patch<ApiMember>(`/families/${familyId}/members/${memberId}/interests`, {
        interests,
      }),
    );
  }

  /**
   * A visit begins. The server keeps when, and answers with when the previous
   * one began - what "new since you last looked" is measured from. Null the
   * first time.
   */
  markSeen(familyId: string) {
    return this.http.post<{ previousSeenAt: string | null }>(`/families/${familyId}/me/seen`);
  }

  /**
   * Everything this account is, as JSON. Free on every plan - what Premium
   * sells is the designed chronicle, not a copy of your own data.
   *
   * Typed as `unknown`: the file is the server's shape, and the app only ever
   * hands it to the person. Mirroring the whole structure here would be a
   * second definition to keep in step for no reader.
   */
  exportMyData() {
    return this.http.get<unknown>('/users/me/data-export');
  }

  /** Starts the 30-day deletion. Every session, including this one, ends now. */
  deleteMe() {
    return this.http.delete<{ deletedAt: string; purgeAt: string }>('/users/me');
  }

  // --- Password resets ---

  /** An admin makes a one-time link for another adult in the family. */
  createPasswordReset(familyId: string, memberId: string) {
    return this.http.post<{ link: string; expiresAt: string }>(
      `/families/${familyId}/members/${memberId}/password-reset`,
    );
  }

  /** Public: the person holding the link cannot sign in, which is why they have it. */
  checkPasswordReset(token: string) {
    return this.http.get<{ valid: boolean }>(`/auth/password-reset/${encodeURIComponent(token)}`);
  }

  completePasswordReset(token: string, password: string) {
    return this.http.post<void>('/auth/password-reset', { token, password }, { skipAuth: true });
  }

  /** Public: whether this server can send the link by email, or only an admin can make one. */
  passwordResetOptions() {
    return this.http.get<{ byEmail: boolean }>('/auth/password-reset');
  }

  /** Public: "forgot your password?" - the same answer whether or not the address has an account. */
  requestPasswordReset(email: string) {
    return this.http.post<{ sent: true }>('/auth/password-reset/request', { email }, { skipAuth: true });
  }

  // --- Push ---

  /** This phone's push token, after its person said yes (api modules/push). */
  registerDevice(device: { platform: 'ios' | 'android'; token: string; locale: string }) {
    return this.http.post<void>('/users/me/devices', device);
  }

  /** Signing out on this phone: it stops getting this account's news. */
  unregisterDevice(token: string) {
    return this.http.delete<void>(`/users/me/devices/${encodeURIComponent(token)}`);
  }

  // --- Photographs ---

  /**
   * Step one of an upload: where to put this photograph, if it may go at all.
   *
   * The server answers with a URL it has signed. The bytes go there directly
   * (data/uploads.ts) rather than through this client, which is why there is
   * no `upload()` here - it is a plain PUT, the same shape a bucket wants.
   */
  requestUpload(
    familyId: string,
    eventId: string,
    file: { mimeType: string; sizeBytes: number; durationSec?: number },
  ) {
    return this.http.post<UploadTarget>(`/families/${familyId}/events/${eventId}/uploads`, file);
  }

  /**
   * A photograph or a voice note taken out of its event, file and all. Before
   * this existed a photograph removed while editing came back on the next save.
   */
  deleteAttachment(familyId: string, attachmentId: string) {
    return this.http.delete<void>(`/families/${familyId}/attachments/${attachmentId}`);
  }

  /** Step three: the bytes are there. The server reads the size and thumbnails it. */
  completeUpload(familyId: string, attachmentId: string) {
    return this.http.post<ApiAttachment>(
      `/families/${familyId}/uploads/${attachmentId}/complete`,
    );
  }

  // --- Family ---

  /** `birthDate` and `interests` are the creator's own, from onboarding, for their member row. */
  async createFamily(input: {
    name: string;
    locale?: string;
    birthDate?: string;
    interests?: string[];
  }): Promise<FamilySnapshot> {
    return this.snapshot(await this.http.post<ApiFamily>('/families', input));
  }

  async getFamily(familyId: string): Promise<FamilySnapshot> {
    return this.snapshot(await this.http.get<ApiFamily>(`/families/${familyId}`));
  }

  updateFamily(familyId: string, patch: { name?: string; coverUrl?: string; locale?: string }) {
    return this.http.patch<ApiFamily>(`/families/${familyId}`, patch);
  }

  async createChild(
    familyId: string,
    input: { displayName: string; birthDate?: string; managedByMemberId?: string },
  ): Promise<Member> {
    return toMember(await this.http.post<ApiMember>(`/families/${familyId}/children`, input));
  }

  async updateMemberRole(familyId: string, memberId: string, role: MemberRole): Promise<Member> {
    return toMember(
      await this.http.patch<ApiMember>(`/families/${familyId}/members/${memberId}`, { role }),
    );
  }

  removeMember(familyId: string, memberId: string) {
    return this.http.delete<void>(`/families/${familyId}/members/${memberId}`);
  }

  /** In memoriam: a day marks it, null takes it back. Admins only. */
  async setMemorial(familyId: string, memberId: string, diedOn: string | null): Promise<Member> {
    return toMember(
      await this.http.patch<ApiMember>(`/families/${familyId}/members/${memberId}/memorial`, {
        diedOn,
      }),
    );
  }

  /** A photograph as the request body; the answer is the signed link to the stored square. */
  uploadAvatar(familyId: string, memberId: string, file: Blob) {
    return this.http.putBytes<{ avatarUrl: string }>(
      `/families/${familyId}/members/${memberId}/avatar`,
      file,
      file.type || 'image/jpeg',
    );
  }

  // --- Wish lists ---

  listWishes(familyId: string, memberId: string) {
    return this.http.get<Wish[]>(`/families/${familyId}/members/${memberId}/wishes`);
  }

  /** `claim`: "I'll get this" in the same breath - a gift idea taken from the suggestions. */
  addWish(familyId: string, memberId: string, text: string, claim = false) {
    return this.http.post<Wish>(`/families/${familyId}/members/${memberId}/wishes`, {
      text,
      ...(claim ? { claim: true } : null),
    });
  }

  removeWish(familyId: string, wishId: string) {
    return this.http.delete<void>(`/families/${familyId}/wishes/${wishId}`);
  }

  toggleWishClaim(familyId: string, wishId: string) {
    return this.http.post<Wish>(`/families/${familyId}/wishes/${wishId}/claim`);
  }

  // --- The calendar feed ---

  calendarFeed(familyId: string) {
    return this.http.get<CalendarFeed>(`/families/${familyId}/calendar-feed`);
  }

  resetCalendarFeed(familyId: string) {
    return this.http.post<CalendarFeed>(`/families/${familyId}/calendar-feed/reset`);
  }

  // --- Guest links ---

  /**
   * A guest link, or with `heirloom` an heirloom sticker: a century long and
   * carrying the voice (the server's guest-links.service.ts says why).
   */
  createGuestLink(familyId: string, eventId: string, days: number, heirloom = false) {
    return this.http.post<{ id: string; url: string; expiresAt: string; heirloom?: boolean }>(
      `/families/${familyId}/events/${eventId}/share-links`,
      heirloom ? { heirloom: true } : { days },
    );
  }

  listGuestLinks(familyId: string, eventId: string) {
    return this.http.get<GuestLink[]>(`/families/${familyId}/events/${eventId}/share-links`);
  }

  revokeGuestLink(familyId: string, linkId: string) {
    return this.http.delete<void>(`/families/${familyId}/share-links/${linkId}`);
  }

  /** Public: the guest has no account. */
  openGuestLink(token: string) {
    return this.http.get<GuestView>(`/guest/${encodeURIComponent(token)}`);
  }

  // --- Groups ---

  async createGroup(
    familyId: string,
    input: { name: string; memberIds?: string[] },
  ): Promise<Group> {
    return toGroup(await this.http.post<ApiGroup>(`/families/${familyId}/groups`, input));
  }

  async updateGroup(
    familyId: string,
    groupId: string,
    patch: { name?: string; memberIds?: string[] },
  ): Promise<Group> {
    return toGroup(await this.http.patch<ApiGroup>(`/families/${familyId}/groups/${groupId}`, patch));
  }

  deleteGroup(familyId: string, groupId: string) {
    return this.http.delete<void>(`/families/${familyId}/groups/${groupId}`);
  }

  // --- Invitations ---

  listInvitations(familyId: string) {
    return this.http.get<Invitation[]>(`/families/${familyId}/invitations`);
  }

  invite(familyId: string, input: { email?: string; role: MemberRole; groupIds?: string[] }) {
    return this.http.post<Invitation>(`/families/${familyId}/invitations`, input);
  }

  revokeInvitation(familyId: string, invitationId: string) {
    return this.http.delete<void>(`/families/${familyId}/invitations/${invitationId}`);
  }

  previewInvitation(code: string) {
    return this.http.get<{ familyName: string; role: MemberRole }>(`/invitations/${code}`);
  }

  /** `birthDate` and `interests` are the joiner's own, from onboarding, for their member row. */
  acceptInvitation(code: string, input: { birthDate?: string; interests?: string[] } = {}) {
    return this.http.post<ApiMember>(`/invitations/${code}/accept`, input);
  }

  // --- Events ---

  async listEvents(
    familyId: string,
    query: {
      from?: string;
      to?: string;
      categoryId?: string;
      participantId?: string;
      milestonesOnly?: boolean;
      /** Only repeating series, whatever their date. */
      repeating?: boolean;
      /** Only what is on the story shelf. */
      onStoryShelf?: boolean;
      q?: string;
      cursor?: string;
      limit?: number;
    } = {},
  ): Promise<{ items: FamilyEvent[]; nextCursor: string | null }> {
    const result = await this.http.get<{ items: ApiEvent[]; nextCursor: string | null }>(
      `/families/${familyId}/events`,
      query,
    );
    return {
      items: result.items.map((e) => toEvent(e, this.baseUrl)),
      nextCursor: result.nextCursor,
    };
  }

  async getEvent(familyId: string, eventId: string): Promise<FamilyEvent> {
    return toEvent(
      await this.http.get<ApiEvent>(`/families/${familyId}/events/${eventId}`),
      this.baseUrl,
    );
  }

  async createEvent(familyId: string, input: CreateEventInput): Promise<FamilyEvent> {
    return toEvent(
      await this.http.post<ApiEvent>(`/families/${familyId}/events`, input),
      this.baseUrl,
    );
  }

  async updateEvent(
    familyId: string,
    eventId: string,
    patch: UpdateEventInput,
  ): Promise<FamilyEvent> {
    return toEvent(
      await this.http.patch<ApiEvent>(`/families/${familyId}/events/${eventId}`, patch),
      this.baseUrl,
    );
  }

  /** Soft on the server, so `restoreEvent` can bring it back under the same id. */
  deleteEvent(familyId: string, eventId: string): Promise<void> {
    return this.http.delete<void>(`/families/${familyId}/events/${eventId}`);
  }

  async restoreEvent(familyId: string, eventId: string): Promise<FamilyEvent> {
    return toEvent(
      await this.http.post<ApiEvent>(`/families/${familyId}/events/${eventId}/restore`),
      this.baseUrl,
    );
  }

  async changeVisibility(
    familyId: string,
    eventId: string,
    visibility: Visibility,
  ): Promise<FamilyEvent> {
    return toEvent(
      await this.http.patch<ApiEvent>(
        `/families/${familyId}/events/${eventId}/visibility`,
        visibility,
      ),
      this.baseUrl,
    );
  }

  // --- Comments and reactions ---

  listComments(familyId: string, eventId: string) {
    return this.http.get<Comment[]>(`/families/${familyId}/events/${eventId}/comments`);
  }

  addComment(familyId: string, eventId: string, body: string) {
    return this.http.post<Comment>(`/families/${familyId}/events/${eventId}/comments`, { body });
  }

  deleteComment(familyId: string, commentId: string) {
    return this.http.delete<void>(`/families/${familyId}/comments/${commentId}`);
  }

  /**
   * PUT, not PATCH: one member has one reaction per event, so setting it is
   * idempotent. Sending the same kind again clears it and the server answers
   * with null — that is the toggle.
   */
  toggleReaction(familyId: string, eventId: string, kind: ReactionKind) {
    return this.http.put<{ kind: ReactionKind } | null>(
      `/families/${familyId}/events/${eventId}/reactions`,
      { kind },
    );
  }

  // --- Reports ---

  /** "This should not be here" (docs/05-API.md, Reports). Twice is the first one again. */
  reportContent(
    familyId: string,
    report: { target: ReportTarget; id: string; reason: ReportReason; note?: string },
  ) {
    return this.http.post<{ id: string }>(`/families/${familyId}/reports`, report);
  }

  // --- Blocks ---

  /** "I do not want to see what this person posts." Twice is once. */
  blockMember(familyId: string, memberId: string) {
    return this.http.post<{ memberId: string }>(`/families/${familyId}/blocks`, { memberId });
  }

  unblockMember(familyId: string, memberId: string) {
    return this.http.delete<void>(`/families/${familyId}/blocks/${memberId}`);
  }

  // --- Notifications ---

  /**
   * The bell, already filtered by visibility on the server - including for
   * events whose visibility narrowed after the notification was written.
   */
  async listNotifications(familyId: string): Promise<AppNotification[]> {
    const rows = await this.http.get<ApiNotification[]>(`/families/${familyId}/notifications`);
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      eventId: row.eventId ?? undefined,
      eventTitle: row.eventTitle ?? undefined,
      actorName: row.actorName ?? undefined,
      dayKey: row.dayKey ?? undefined,
      dayOn: row.dayOn ?? undefined,
      createdAt: row.createdAt,
      readAt: row.readAt ?? undefined,
    }));
  }

  markNotificationRead(familyId: string, id: string) {
    return this.http.post<void>(`/families/${familyId}/notifications/${id}/read`);
  }

  markAllNotificationsRead(familyId: string) {
    return this.http.post<void>(`/families/${familyId}/notifications/read-all`);
  }

  // --- AI ---

  suggestCategory(familyId: string, title: string, description?: string) {
    return this.http.post<Suggestion | null>(`/families/${familyId}/ai/suggest-category`, {
      title,
      description,
    });
  }

  detectConflicts(
    familyId: string,
    input: { startsAt: string; endsAt?: string; participantMemberIds: string[] },
  ) {
    return this.http.post<Suggestion | null>(`/families/${familyId}/ai/detect-conflicts`, input);
  }

  acceptSuggestion(familyId: string, id: string) {
    return this.http.post<void>(`/families/${familyId}/ai/suggestions/${id}/accept`);
  }

  rejectSuggestion(familyId: string, id: string) {
    return this.http.post<void>(`/families/${familyId}/ai/suggestions/${id}/reject`);
  }

  /** After a purchase or a restore: the server reads the family's plan from the stores again. */
  syncSubscription(familyId: string) {
    return this.http.post<ApiSubscription>(`/families/${familyId}/subscription/sync`);
  }

  // -------------------------------------------------------------------------

  private snapshot(f: ApiFamily): FamilySnapshot {
    return {
      family: {
        id: f.id,
        name: f.name,
        createdAt: f.createdAt,
        coverUrl: f.coverUrl ?? undefined,
        ...toFamilyPlan(f.plan, f.subscription),
        locale: (f.locale === 'en' ? 'en' : 'lv') as Family['locale'],
      },
      members: (f.members ?? []).map(toMember),
      groups: (f.groups ?? []).map(toGroup),
      blockedMemberIds: f.blockedMemberIds ?? [],
    };
  }
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: { id: string; email: string; displayName: string; locale: string };
}

export interface TelemetryEvent {
  name: string;
  props: Record<string, unknown>;
  /** When it happened on this device - the batch goes later. */
  at: string;
}

export interface ErrorReport {
  message: string;
  stack?: string;
  platform: string;
  route?: string;
  appVersion?: string;
}

export interface MeResponse {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  locale: string;
  shareUsageStats?: boolean;
  notifyEvents?: boolean;
  notifyComments?: boolean;
  notifyReminders?: boolean;
  defaultReminderMinutes?: number | null;
  /** The version of the terms this person accepted; null: none yet. Older servers leave it out. */
  termsVersion?: string | null;
  /** When they consented to keeping health information; null: not, or withdrawn. */
  healthConsentAt?: string | null;
  createdAt: string;
  members: { id: string; role: MemberRole; family: { id: string; name: string } }[];
}

/**
 * Everything an event has except who can see it.
 *
 * Visibility is missing on purpose, and so it is on the server: it changes
 * through `changeVisibility`, because that is the path that writes the audit
 * entry. See docs/05-API.md.
 */
export type UpdateEventInput = Partial<Omit<CreateEventInput, 'visibility' | 'surpriseFor' | 'revealAt'>> & {
  /** The whole list of days taken out of the series, as it should now be. */
  repeatSkips?: string[];
};

export interface CreateEventInput {
  title: string;
  description?: string;
  startsAt: string;
  endsAt?: string;
  allDay?: boolean;
  categoryId: string;
  isMilestone?: boolean;
  /** The family's own labels. A separate axis from categoryId — see the schema. */
  tags?: string[];
  participantMemberIds?: string[];
  visibility?: Visibility;
  attachmentIds?: string[];
  /** null removes it, on an edit. */
  reminder?: { minutesBefore: number } | null;
  /** null or absent: once. See domain/recurrence.ts. */
  repeat?: RepeatRule | null;
  repeatUntil?: string | null;
  /** This device's zone, so the series keeps its local time through clock changes. */
  repeatTimeZone?: string | null;
  /** The question of the week this entry answers. */
  promptKey?: string;
  /** A time capsule: closed to all but its author until then. null opens it, on an edit. */
  sealedUntil?: string | null;
  /** A surprise for this member, hidden from them until `revealAt`. Only when made. */
  surpriseFor?: string;
  revealAt?: string;
  onStoryShelf?: boolean;
}
