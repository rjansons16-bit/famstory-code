# The API contract

Status: **partly implemented**. `identity`, `families`, `events`, `comments`,
`visibility`, `ai` and the read half of `media` exist in `apps/api/src/modules/`.
Uploads, `notifications`, `subscription` and `export` are still specification
only — see `00-PLAN.md`, stage C. Each table below marks which is which.

Every endpoint described here has a matching `// TODO(api):` comment in the
mobile app, in `apps/mobile/src/data/store.ts`. When an endpoint is ready, the
body of the corresponding action is replaced — nothing changes in the screens.

Base: `https://api.famstory.app/v1`

---

## Health

`GET /health` answers without a token: `{ status, database, databaseMs }`, or a
`503 database_unreachable` when the process runs but cannot reach PostgreSQL.
For whatever watches the server — nothing else about it is said to a stranger.

## General rules

**Authentication.** `Authorization: Bearer <accessToken>`. Access 15 min,
refresh 30 days, rotated on every use.

**Family context.** Every resource endpoint either lives under
`/families/{familyId}` or returns a resource whose `familyId` is checked against
the session. There is no endpoint that returns data without a family context.

**Visibility.** Every path that reads events goes through `VisibilityService`.
An endpoint that does not use it does not pass code review.

**Errors.**
```json
{ "error": { "code": "visibility_denied", "message": "...", "requestId": "req_..." } }
```

**How often.** The endpoints anybody can reach without signing in are counted,
per address and per account, and answer `429` with
`{ "code": "too_many_attempts", "retryAfter": <seconds> }` plus a `Retry-After`
header once they are over. Sign-in allows 10 attempts per address per 5 minutes
and 5 per account per 15 minutes; a correct password clears the account's count.
Registration allows 5 per address per hour, a provider token 20 per 5 minutes,
and refresh 120 per 5 minutes. The counter is per process and in memory
(`common/rate-limit.store.ts`) — a second API node needs it moved to Redis.

**Pagination.** A cursor, not an offset: `?cursor=<opaque>&limit=20`.

**Language.** `Accept-Language: en`. Server-generated text (notifications, AI
suggestions) comes back ready to display. The header is honoured now so that a
second language in V2 needs no client change.

---

## Auth ✅ implemented

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/auth/email/register` | Email + password → a session. `acceptedTerms` is the version of the terms and the privacy policy the sign-up screen showed (`"1.0"`); recorded with the time, and anything that is not a version is not recorded. Google and Apple take it too |
| `POST` | `/auth/email/login` | → `{ accessToken, refreshToken, user }` |
| `POST` | `/auth/google` | An ID token → a session |
| `POST` | `/auth/apple` | An identity token → a session |
| `POST` | `/auth/refresh` | Refresh rotation |
| `POST` | `/auth/logout` | Revokes the refresh token |
| `GET` | `/users/me` | The profile + the list of families, with `termsVersion` and `termsAcceptedAt` (null: none recorded) |
| `POST` | `/users/me/terms` | `{ version }` → `{ termsVersion, termsAcceptedAt }`: this person accepted that version (the app asks after sign-in when it publishes a newer one). Not a version: `400 invalid_version` |
| `PATCH` | `/users/me` | `displayName`, `avatarUrl`, `locale`, `shareUsageStats` (a real boolean; see Telemetry), `notifyEvents` / `notifyComments` / `notifyReminders` (booleans: a kind switched off is not written into that person's bell at all), `defaultReminderMinutes` (0 to 10080, or `null` for none; anything else is `400 invalid_reminder`), `healthConsent` (true gives consent to keeping health information now, false withdraws it; read back as `healthConsentAt`). `GET` returns them too |
| `POST` | `/families/{id}/members/{memberId}/password-reset` | Admin only: a one-time link for another adult in the family → `{ link, expiresAt }`. The person is notified |
| `GET` | `/auth/password-reset` | Public: `{ byEmail }` - whether "forgot your password?" can send a link by email on this server (a mail provider and an https `SITE_ORIGIN`), or only a family admin can make one |
| `POST` | `/auth/password-reset/request` | Public: `{ email }` → `202 { sent: true }` whether or not the address has an account - the lookup and the sending happen after the reply, so its timing says nothing either. One email per account per five minutes; five requests per address per 15 minutes. The link is `SITE_ORIGIN/reset/<token>`, never the request's Host, and works once for one hour. `400 invalid_email`, `503 mail_unavailable` |
| `GET` | `/auth/password-reset/{token}` | Public: `{ valid }`, nothing else about the account |
| `POST` | `/auth/password-reset` | Public: `{ token, password }` → 204. Every session ends |
| `POST` | `/users/me/devices` | `{ platform: "ios" \| "android", token, locale }` → 204. The phone's own push token (APNs hex, or FCM), after its person allowed notifications; a token already known moves to this account. `400 invalid_platform`, `400 invalid_token` |
| `DELETE` | `/users/me/devices/{token}` | 204. Signing out on that phone |
| `GET` | `/users/me/data-export` | Everything the account is, as a JSON download. Free on every plan |
| `DELETE` | `/users/me` | Account deletion → `{ deletedAt, purgeAt }`. A 30-day grace period; signing in inside it restores the account |

---

## Families ✅ implemented

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/families` | `{ name, locale?, birthDate?, interests? }` — creates the family + 3 system groups + the admin member. `birthDate` and `interests` are the creator's own, from onboarding. `name` is trimmed, 1–60 characters (`400 invalid_name`); `locale` is `lv` or `en` (`400 invalid_locale`) |
| `GET` | `/families/{id}` | The family with its members and groups, and `blockedMemberIds`: whom the reader blocked (Blocks, below) |
| `PATCH` | `/families/{id}` | `name`, `coverUrl`, `locale` — admin only, with the same rules for `name` and `locale` as above. The app renames the family from the Family tab |
| `DELETE` | `/families/{id}` | Soft delete — admin only |

### Members

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/families/{id}/members` | |
| `POST` | `/families/{id}/children` | Creates a child profile with no account |
| `PATCH` | `/families/{id}/members/{id}` | `role`, `displayName`, `managedByMemberId` |
| `DELETE` | `/families/{id}/members/{id}` | `status = removed`, the data stays |
| `PATCH` | `/families/{id}/me` | Your own `displayName`, `birthDate` and `interests` in this family. `interests` is a list of known keys (`common/interests.ts`); unknown ones are dropped, twelve at most, and anything that is not a list is `400 invalid_interests` |
| `PATCH` | `/families/{id}/members/{id}/interests` | `{ interests }` for a **child's** profile, by the adult who manages it or an admin (`403 not_a_child_profile`, `403 insufficient_role`). Audited as `child_profile.updated` |
| `POST` | `/families/{id}/me/seen` | A visit begins → `{ previousSeenAt }`, what "new since you last looked" counts from. Kept in its own table, never in a member listing |
| `PATCH` | `/families/{id}/members/{id}/memorial` | In memoriam, admins only: `{ diedOn }` marks, `{ diedOn: null }` takes it back. The profile stays; the account's sessions end and it can no longer open the family |
| `PUT` | `/families/{id}/members/{id}/avatar` | The photograph as the raw body (`image/*`, up to 10 MB) → `{ avatarUrl }`, a signed link to a 512px WebP square. Yourself, a child by the parent who manages it, anybody by an admin |
| `DELETE` | `/families/{id}/members/{id}/avatar` | Removes it, file included |

> A `PATCH` that changes a role **always** writes an `AuditLog` entry.
>
> Members leave the API with a signed, short-lived `avatarUrl` built from the
> stored `avatarKey`; the key itself never does. A child's face must not sit
> behind a permanent address.

### Wish lists

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/families/{id}/members/{id}/wishes` | The list as the caller may see it |
| `POST` | `/families/{id}/members/{id}/wishes` | `{ text, claim? }`, 2–200 characters. Anybody but a child profile. `claim: true` writes it already claimed by the caller - a gift idea taken - except on the caller's own list |
| `DELETE` | `/families/{id}/wishes/{wishId}` | Whoever wrote the line, or an admin |
| `POST` | `/families/{id}/wishes/{wishId}/claim` | "I'll get this", and pressing again lets go. 409 when somebody else has it |

> **The person a list is for sees only the lines they wrote, and never a
> claim** — filtered in the query, so the family's ideas are never loaded for
> them at all, and "not found" for a line they may not know exists. Reading a
> child's list writes an audit entry like the rest of a child's data.

### Groups

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/families/{id}/groups` | |
| `POST` | `/families/{id}/groups` | |
| `PATCH` | `/families/{id}/groups/{id}` | A system group cannot be renamed |
| `DELETE` | `/families/{id}/groups/{id}` | A system group cannot be deleted. Events that were visible only to this group become private to their author |

### Invitations

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/families/{id}/invitations` | `{ email?, role, groupIds }` → a code + a link |
| `GET` | `/families/{id}/invitations` | The active ones |
| `DELETE` | `/families/{id}/invitations/{id}` | Revocation |
| `GET` | `/invitations/{code}` | A public preview — the family name and the role, **nothing more** |
| `POST` | `/invitations/{code}/accept` | `{ birthDate?, interests? }` — the joiner's own birthday and interests, from onboarding. The body may be omitted |

> A `birthDate` anywhere (these two and `/children`) must be a real day between
> 1900 and today, or the request is refused with `400 invalid_birth_date` before
> anything is written. The app sends a picked day as local noon, so it reads as
> the same day for relatives in other time zones.

---

## Events ✅ implemented

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/families/{id}/events` | The timeline. Filters: `from`, `to`, `categoryId`, `participantId`, `milestonesOnly`, `repeating`, `onStoryShelf`, `q` (booleans are the text `true`) |
| `POST` | `/families/{id}/events` | An entry in the Health category (`categoryId: health`), or an edit that moves one there, needs the author's consent (`PATCH /users/me` `healthConsent`): `403 health_consent_required` without it. What is typed is checked first (`common/input.ts`): `title` 1–200 characters (`invalid_title`), `description` up to 20 000 (`invalid_description`), `categoryId` one of the ten the app draws (`invalid_category`), `startsAt`/`endsAt` dates (`invalid_date`), `tags` at most 30 of up to 40 characters (`invalid_tags`) - all `400`, the same on `PATCH` |
| `GET` | `/families/{id}/events/{id}` | |
| `PATCH` | `/families/{id}/events/{id}/visibility` | |
| `PATCH` | `/families/{id}/events/{id}` | Everything except visibility — see below |
| `DELETE` | `/families/{id}/events/{id}` | Soft delete → 204 |
| `POST` | `/families/{id}/events/{id}/restore` | Undo a delete, same id |

**`PATCH` cannot change visibility.** `UpdateEventDto` omits it and
`PATCH .../visibility` is the only way in, because that path writes the audit
entry. An edit that could quietly widen who sees a photograph of a child would
defeat the model this product is built on.

The one thing `PATCH` does change on its own: adding a **child** to the
participants of an event the whole family can see narrows it to the safe
default, exactly as creating one would, and audits the change. The client
already does this; the client is not the boundary.

**`DELETE` is soft.** The row survives so `restore` can bring it back under the
same id — a new one would orphan every comment, reaction and reminder pointing
at it. `eventFilter` excludes `deletedAt`, so one timestamp hides it from the
timeline, the calendar and a direct fetch at once.

The creation body:

```json
{
  "title": "Emily's first day of school",
  "description": "…",
  "startsAt": "2026-09-01T08:30:00Z",
  "endsAt": null,
  "allDay": false,
  "categoryId": "education",
  "isMilestone": true,
  "participantMemberIds": ["mem_...", "mem_..."],
  "visibility": { "kind": "groups", "groupIds": ["grp_..."] },
  "attachmentIds": ["att_..."],
  "reminder": { "minutesBefore": 1440 }
}
```

> `visibility` is optional. When it is absent the server applies the safe default
> itself — and with a child among the participants that default is "Parents only".
>
> A `custom` audience carries `groupIds` AND `memberIds`, and both are written.
> Ids that are not in this family are dropped; an audience with nobody left in
> it is saved as `private`, which is what it already was in effect.

**Repeating events** are one row with a rule, never one row per occurrence:

```json
{
  "repeat": "weekly",
  "repeatUntil": "2026-12-22T12:00:00Z",
  "repeatTimeZone": "Europe/Riga"
}
```

`repeat` is `daily`, `weekly`, `monthly` or `yearly` (anything else is a `400`,
not a one-off); `repeatUntil` is the last day an occurrence may start on;
`repeatTimeZone` is the zone the series is kept in, so 18:00 stays 18:00
through the clock changes. `PATCH` also takes `repeatSkips`, the whole list of
days (`YYYY-MM-DD`) taken out of the series. Occurrences are computed
(`common/recurrence.ts`, and the app's copy in `domain/recurrence.ts`): the 31st
is the last day of a shorter month, 29 February is the 28th in other years.

A reminder on a series walks along it: once an occurrence's reminder is sent,
or dropped as late, it points at the next one still ahead. Moving an event, or
changing its rule, moves its reminder too.

**Keepsakes** (docs/02-DATA-MODEL.md, "Keepsakes") are fields of the same body:

```json
{
  "sealedUntil": "2036-09-27T09:00:00Z",
  "surpriseFor": "mem_...",
  "revealAt": "2026-10-04T04:00:00Z",
  "onStoryShelf": true,
  "promptKey": "ls-met"
}
```

- `sealedUntil` makes a time capsule: ahead, and at most a hundred years
  (`400 invalid_seal`). Until then every reply to anybody but the author says
  `sealed: true` and carries no description, tags, attachments, reactions or
  reminders, and comments, reactions, uploads and guest links answer
  `403 { code: 'capsule_sealed', opensAt }`. Nobody else may `PATCH` it; only
  the author may move `sealedUntil` (`null` unseals it).
- `surpriseFor` + `revealAt` hide the event from that member until then:
  another member of the family, at most 400 days ahead (`400
  invalid_surprise`). Set at creation only - `PATCH` takes neither.
- `onStoryShelf` puts a told tale on the family's shelf; `promptKey` names the
  question an event answers.

> `GET /families/{id}/events` **never** returns events the caller cannot see. The
> filter is applied at `WHERE` level, not while processing the response —
> otherwise the event count in the pagination would leak information about the
> hidden ones.

### Comments and reactions ✅ implemented

| Method | Path |
|--------|------|
| `GET` / `POST` | `/families/{id}/events/{id}/comments` |
| `PATCH` / `DELETE` | `/families/{id}/comments/{id}` |
| `PUT` / `DELETE` | `/families/{id}/events/{id}/reactions` |

`PUT`, not `POST`, for a reaction: it is idempotent — one member, one reaction.

### Reports ✅ implemented

| Method | Path |
|--------|------|
| `POST` | `/families/{id}/reports` |

The body is `{ target, id, reason, note? }`:

- `target` is `event` or `comment`, and `id` is that event's or comment's id.
- `reason` is `inappropriate`, `harassment`, `spam` or `other`.
- `note` is at most 500 characters.

The answer is `201 { id }`.

How a report is checked:

- The event's visibility is asked first. An event the reporter cannot see,
  and a comment that does not exist, get the same `403 visibility_denied` as
  an event that does not exist.
- Your own entry or comment is `400 own_content`.
- Reporting the same thing again while the first report is open answers
  with the first report.
- More than 20 reports in an hour is `429 too_many_reports`.

The family's admins who can see the event get a `content_reported`
notification, without the reporter (docs/02-DATA-MODEL.md, Reports). The
operator reads every report with `npm --prefix apps/api run reports`.

### Blocks ✅ implemented

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/families/{id}/blocks` | `{ memberId }` → `201 { memberId }`. Twice is once |
| `DELETE` | `/families/{id}/blocks/{memberId}` | `204`, whether or not there was a block |

The list itself comes with the family, as `blockedMemberIds`.

- Yourself is `400 block_self`; a child profile is `400 block_child`.
- Somebody outside the family, removed, or not there at all is
  `403 member_not_found`, one answer for all three.
- Nobody is told, and nothing in any other reply says who blocked whom.

What a block hides, for the blocker only (docs/02-DATA-MODEL.md, Blocks): the
blocked member's events, everywhere `eventFilter` reaches, opening one by id
included (`403 visibility_denied`); their comments, and their reactions and
comments in every event's counts; and the bell's notifications about what
they did, the ones written before the block included.

### Files ✅ implemented

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/families/{id}/attachments/{attachmentId}/url` | A short-lived read URL **after the visibility check**. `?variant=thumb` for the thumbnail |
| `POST` | `/families/{id}/events/{eventId}/uploads` | `{ mimeType, sizeBytes, durationSec? }` → `{ attachmentId, uploadUrl, method, expiresIn, maxBytes }` |
| `PUT` | `/uploads/{attachmentId}/bytes?expires=&signature=` | The bytes themselves. Public, authorised by the signature on the URL |
| `POST` | `/families/{id}/uploads/{attachmentId}/complete` | Confirms; the server reads the dimensions and writes the thumbnail |
| `GET` | `/media/{key}?expires=&signature=` | Serves a stored file to a link that was signed for it. Public, same reason. Answers `Range` with `206` |
| `DELETE` | `/families/{id}/attachments/{attachmentId}` | Takes a photograph or a voice note out of its event - the row and the file. The rule for editing the event; audited |

> The read endpoint pins the attachment to the family, then runs the same
> visibility check the timeline uses, and only then produces a URL. That order
> is the point: `Attachment` stores a `storageKey` and never a URL, because a
> photo reachable through a permanent link would defeat the visibility model
> entirely.
>
> **The upload is shaped like a presigned S3 PUT on purpose** — ask, put the
> bytes where you were told, confirm — because that is what it becomes when a
> bucket exists. Today the bytes land on the server's own disk under
> `MEDIA_ROOT`; the client code is the same either way.
>
> The two byte-carrying endpoints take no session token. They are authorised by
> a signature that names one id (or one key) plus an expiry, compared in
> constant time, and minted only after an authenticated request has already
> passed the visibility check — exactly as a presigned URL is. Read links live
> 30 minutes, upload links 15.
>
> Photographs: `image/jpeg`, `png`, `webp`, `heic`, `heif`, up to 25 MB.
> **Voice notes** (2026-09-25): `audio/webm`, `ogg`, `mp4`, `mpeg`, `aac` -
> what browsers record into - up to 10 MB, with the recorder's `durationSec`
> kept for the player. A type's parameters (`;codecs=opus`) are dropped. A
> voice note gets no thumbnail and nothing decodes it; it is counted against
> its own per-event limit (2 free, 10 Premium), apart from the photographs, and
> never reaches a guest link. Video needs a frame grabbed for its thumbnail,
> which needs ffmpeg on the server - a different piece of work, and refusing
> clearly beats storing something the timeline cannot draw.
>
> `GET /media` answers a byte range: a player asks for the start of a
> recording and then wherever the listener drags to, and Safari plays nothing
> from a server that ignores `Range`.
>
> An attachment row is created when the upload is asked for and only becomes
> visible when the bytes arrive (`uploadedAt`). Every read filters on it, and
> an hourly sweep removes the ones that never completed.

### Guest links ✅ implemented

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/families/{id}/events/{id}/share-links` | `{ days: 1 \| 7 \| 30 }` or `{ heirloom: true }` → `{ id, url, expiresAt }`. The event's author or an admin. Refused for a sealed capsule (`capsule_sealed`) and an unrevealed surprise (`surprise_not_ready`) |
| `GET` | `/families/{id}/events/{id}/share-links` | The ones still open, with `viewCount` and `lastViewedAt` |
| `DELETE` | `/families/{id}/share-links/{linkId}` | Withdraw. Whoever made it, or an admin |
| `GET` | `/guest/{token}` | Public: the family's name, who shared it, and the event's title, date, description and photographs (signed). Nothing about who was there or who else can see it |

> The one deliberate way anything leaves the family. Only the token's hash is
> kept; a link dies when it expires, is withdrawn, the event is deleted or
> whoever made it leaves, and it does not open while its event is sealed or an
> unrevealed surprise. An **heirloom** link - the QR code on a printed sticker
> - lasts a hundred years and its page also plays the voice notes
> (`event.voiceNotes`, signed like the photographs); an ordinary one never does. Every link made — and every view of an event with a
> child in it — is in the audit log. Rate limited: 30 per 5 minutes per address.

### The calendar feed ✅ implemented

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/families/{id}/calendar-feed` | The caller's own address → `{ url, webcalUrl, createdAt, lastFetchedAt }` |
| `POST` | `/families/{id}/calendar-feed/reset` | A new address; the old one stops working |
| `GET` | `/calendar/{memberId}.{version}.{signature}.ics` | Public, `text/calendar`: what that member can see, through the timeline's own `eventFilter`, plus birthdays |

> The address is signed, not stored, so the app can show it again; it names a
> member and a version, and a reset bumps the version. A member who has left,
> died or is deleting their account reads nothing. Series go out as one
> `RRULE` in their own `TZID`, with the month-end and leap-day rules written out
> where RFC 5545's defaults differ. Rate limited: 60 per 5 minutes per address.

---

## Notifications ✅ in the app (push ⬜)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/families/{id}/notifications` | The caller's bell, newest first, 50 at most |
| `POST` | `/families/{id}/notifications/{notificationId}/read` | Scoped to the caller |
| `POST` | `/families/{id}/notifications/read-all` | Scoped to the caller |

Which kinds reach a person's bell are fields of `PATCH /users/me`
(`notifyEvents`, `notifyComments`, `notifyReminders`).

Seven kinds, one rule each for who hears about it: `event_created` — everybody
who can see the event except its author; `comment_added` — the people already
in that conversation except the one who replied; `event_reminder` — the
reminder's targets, or its author; `member_joined` — the admins;
`capsule_opened` — everybody who can see the capsule once it opens, except its
author; `surprise_ready` — the person the surprise is for, once however many
wishes were gathered. The worker tells each opening once (`unlockNotifiedAt`),
and all three event kinds follow `notifyEvents`. `special_day` — everybody who
can sign in and has `notifyReminders` on, three days before Mother's Day,
Midsummer, Christmas Eve and the rest (`common/special-days.ts`), once per
person and day; it carries `dayKey` and `dayOn` and no event.

> **A notification must never be where an event leaks.** Recipients are decided
> with the timeline's own `eventFilter`, run per recipient — not a second,
> simpler rule that could drift — and the list is filtered by it again when it
> is read, because visibility can narrow after a notification was written.
> Only members who can sign in are notified; a child profile has no account.
>
> The server sends facts (`kind`, `eventTitle`, `actorName`), not sentences: the
> app writes the sentence in the reader's language when it draws it.
>
> Reminders are delivered by an in-process worker once a minute, claimed with a
> conditional update so two runs cannot both send one. A reminder that comes
> due more than six hours after its event started is dropped rather than
> delivered. Push (FCM/APNs) is the next layer on the same rows.

---

## Subscription ✅ implemented (the stores, through RevenueCat)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/families/{id}/subscription/sync` | Any member, right after a purchase or a restore: the server reads the family's plan from RevenueCat and answers `{ plan, status, period, currentPeriodEnd, cancelAtPeriodEnd, store }` |
| `POST` | `/webhooks/revenuecat` | Public. `Authorization` must be the value set in RevenueCat's dashboard (`REVENUECAT_WEBHOOK_AUTH`); `401 webhook_unauthorized` otherwise. Answers `{ synced }` |

The family's own reply (`GET /families/{id}`) carries `plan`, the plan in
force now, and `subscription` with the fields above.

- The server never takes a purchase from a request body. Both endpoints only
  make it ask RevenueCat again, with `REVENUECAT_SECRET_KEY`
  (docs/02-DATA-MODEL.md, Subscriptions).
- Without that key: `503 purchases_unavailable`. RevenueCat not answering:
  `503 purchases_unreachable`, and RevenueCat retries its webhook.
- A webhook about an id that is not a family here (RevenueCat's test event)
  is `200 { synced: 0 }`.

Not built: Stripe for the web. The web app says Premium is bought in the
phone app.

---

## The AI layer ✅ implemented

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/families/{id}/ai/suggest-category` | `{ title, description }` → `Suggestion \| null` |
| `POST` | `/families/{id}/ai/detect-conflicts` | `{ startsAt, endsAt?, participantMemberIds, excludeEventId? }` → `Suggestion \| null`, payload `{ eventIds, memberIds }` |
| `POST` | `/families/{id}/ai/suggest-reminder` | `{ categoryId }` → `Suggestion \| null` |
| `POST` | `/families/{id}/ai/suggestions/{id}/accept` | |
| `POST` | `/families/{id}/ai/suggestions/{id}/reject` | |
| `GET` | `/families/{id}/insights` | Summaries (V2) ⬜ |

The MVP implementation is rule-based. The response shape is the same as an LLM
version would return, so the V2 transition changes neither the API nor the UI.

`accept` / `reject` are not decoration — without them there is no data on which
to decide whether the AI layer is worth monetising at all.

**Conflicts are built only from what the asker can see.** Both queries go
through `eventFilter`, like every other read of events: before 2026-09-24 the
check searched the whole family and returned the ids it found, so a
parents-only appointment reached a grandparent as "there is something here".
A repeating series conflicts at each occurrence and a skipped week is free;
all-day events never conflict; an event with no end holds an hour, on both
sides; `excludeEventId` is the event being edited. `memberIds` names which of
the chosen people are double-booked. The app works the same answer out
offline (apps/mobile/src/domain/conflicts.ts) and shows it in the composer
with "Change time" / "Keep it".

---

## Telemetry ✅ implemented

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/telemetry/events` | Signed in. `{ familyId?, events: [{ name, props?, at? }] }` → `204` |
| `POST` | `/telemetry/errors` | **Public.** `{ message, stack?, platform, route?, appVersion? }` → `204` |

Product events and error reports, kept by this server and nobody else's
(modules/telemetry). What is stored is defined by what is not:

- **Events** keep a name from the app's list (`known-events.ts`, the same as
  `AnalyticsEvent` in apps/mobile/src/domain/analytics.ts) and only the fields
  listed for it, each as a short word, a number or a boolean. No user, member,
  device or address; a `familyId` only when the sender is in that family. At
  most 50 per request; the device's own time is believed within a day. Nothing
  at all is kept for a user with `shareUsageStats: false` — enforced here, not
  trusted to the app. Kept 400 days.
- **Errors** are public because the app can break before sign-in, and so the
  report carries nobody — not even the family. Query strings, long tokens,
  email addresses and every path segment that names something are scrubbed
  before storage (`/guest/<token>` is kept as `/guest/:id`). 20 per address
  per five minutes. Kept 90 days.

Both answer `204` whatever was kept: the app has nothing to do differently,
and saying what was dropped would only teach a sender what gets through.

`npm --prefix apps/api run kpis` prints the KPI table of docs/00-PLAN.md
section 6 from these tables and the family's own, each row with its rule.

---

## Export (MVP+) ⬜ specification

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/families/{id}/exports` | `{ format: "pdf" \| "zip", from, to }` → a queued job |
| `GET` | `/exports/{id}` | The status + a download link |

An export contains **only what the caller can see**. An admin is no exception: a
private event stays private in an export too.
