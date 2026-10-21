# Data model

The canonical specification. When the code and this document disagree, **this
document is right**.

Implementations:
- server — `apps/api/prisma/schema.prisma`
- client — `apps/mobile/src/domain/types.ts`

---

## The founding principle

The study: *"the platform models the family as a system"* and *"the family as the
primary entity"*.

In practice that means: **almost every table has a `familyId`, and no query
starts without one.** A user can belong to several families, and in each of them
they have their own role and their own visibility context.

The data flow from the study:

```
User → Family → Members / Groups → Event → Visibility → Timeline / Calendar → Reminder / Comment
```

---

## Entities

| Entity | Its role in the system |
|--------|------------------------|
| `User` | An account. Can belong to several families. Also the person's own choices: whether they are counted (`shareUsageStats`), which kinds reach their bell (`notifyEvents`, `notifyComments`, `notifyReminders`, all on by default) and where a new event's reminder starts (`defaultReminderMinutes`, null for none). Which version of the terms and the privacy policy they accepted, and when (`termsVersion`, `termsAcceptedAt`): recorded at sign-up, asked again after a new version. Consent to keeping the health information they write (`healthConsentAt`, GDPR Art. 9): asked before their first entry in the Health category, withdrawable, and the server refuses a new one without it |
| `AuthIdentity` | An OAuth connection (Google / Apple / email) |
| `Device` | A phone's push token (Apple's or Google's), its platform and the app's language. One user — several devices. Registered after the person allowed notifications, again at each launch; removed on signing out on that phone, when Apple or Google says the token is gone, and 180 days after it was last seen. A push carries one generic line per kind and the event's id, never anything the family wrote |
| `Family` | **The centre of the system** |
| `Member` | A user inside one family, with a role. For a child `userId = null` |
| `Group` | A visibility group (Parents, Children, Grandparents, custom). The three system groups are stored under English names and cannot be renamed; the app names them in the reader's language by `icon` (`domain/groups.ts`) |
| `GroupMember` | The group ↔ member link |
| `Event` | An event with a date, a category and a visibility |
| `EventParticipant` | Who the event is **about** |
| `EventVisibility` | Who **sees** the event |
| `Attachment` | A photo, video, document - or a **voice note** (`kind = audio`, with `durationSec`). The app keeps voice notes in a list of their own (`FamilyEvent.voiceNotes`), because everything that draws a cover reads the first attachment |
| `Comment` | A comment on an event |
| `Reaction` | A reaction (heart, smile, applause, wow) |
| `Reminder` + `ReminderTarget` | A reminder and its recipients |
| `Invitation` | An invitation with a code and an expiry. **Until it is accepted, this is the whole of the person** — no `Member` row exists before acceptance, so "pending" is exactly the invitation list. `MemberStatus.invited` is in the enum and nothing sets it |
| `Subscription` | The family's plan, as the App Store or Google Play sold it through RevenueCat (see "Subscriptions" below) |
| `AuditLog` | The security log. Kept 24 months (`KEEP.auditDays`, the privacy policy's promise) |
| `Insight` | An AI-generated suggestion or summary |
| `Notification` | One thing that happened, for one person (the bell). A **special day** (`kind = special_day`) carries `dayKey` and `dayOn` instead of an event: which day, and its date - unique per (member, dayKey, dayOn), so it is written once however often the worker asks |
| `PasswordReset` | A one-time link an admin made for another adult |
| `MemberVisit` | When a person's latest visit began — what "new since you last looked" counts from. Its own table so no member listing carries it |
| `CalendarFeed` | A member's read-only calendar address: a version, not a secret (the address is signed) |
| `WishItem` | One line on a person's wish list, and who is getting it |
| `EventShareLink` | A link to one event for a guest outside the family: a hash, an expiry, a view count |
| `AnalyticsEvent` | One product event for the KPIs: a name, a few listed fields, a family — never a person |
| `ClientError` | One error the app ran into, scrubbed and tied to nobody |
| `ContentReport` | Somebody reported an entry or a comment (see "Reports" below) |
| `MemberBlock` | Somebody does not want to see what another member posts (see "Blocks" below) |

---

## Two concepts that must never be confused

### A participant is not a viewer

```
EventParticipant  →  who TAKES PART in the event  (Emily's first day of school → Emily)
EventVisibility   →  who SEES the event           (→ the Parents group)
```

A child can be a participant in an event they cannot see themselves. An example
from the mock data: "Meeting with the school counsellor" — participants Emily and
Anna, visibility Parents only.

Confusing these two concepts makes the product either leak children's data or
become unusable. That is why they are two separate tables and not one field.

### A role is not a visibility

```
MemberRole  →  what a member MAY DO   (a viewer may not add events)
Visibility  →  what a member SEES     (a viewer sees what they are allowed to)
```

---

## Roles

| Role | Can do | Cannot |
|------|--------|--------|
| `admin` | Everything: the family, members, roles, groups, any event, the subscription, exports | — |
| `member` | Add and edit their own events, comment, react | Manage members, groups or other people's events |
| `child` | React | Write, comment, manage. **No account of their own** — a parent manages the profile |
| `viewer` | See what is allowed, comment, react | Add events, manage anything |

Implementation: `apps/mobile/src/domain/visibility.ts` → `CAPABILITIES`.

---

## Visibility

```ts
type VisibilityKind = 'family' | 'custom' | 'groups' | 'members' | 'private';
```

| Kind | Who sees it | In the database |
|------|-------------|-----------------|
| `family` | Every active member of the family | No `EventVisibility` rows |
| `custom` | The members of the named groups AND the named people | One row per group (`groupId`) and one per person (`memberId`) |
| `groups` | The members of the named groups | One row with `groupId` per group |
| `members` | The named members | One row with `memberId` each |
| `private` | The author only | No rows |

`custom` is what the composer makes ("groups and people"). `groups` and
`members` are its degenerate cases, kept because older events use them. Ids
outside the family are dropped when an audience is saved, and an audience with
nobody left in it is saved as `private` — which is what it already was in effect.
(Until 2026-09-24 a `custom` audience was saved with no rows at all, so it
reached only its author; see docs/07-IMPROVEMENTS.md item 58.)

**The author always sees their own event**, whatever the kind.

### The algorithm (`canSee`)

```
1. Does the event belong to the viewer's family?   no → HIDDEN
2. Is the viewer an active member?                 no → HIDDEN
2a. Is it a surprise for the viewer, not yet revealed? yes → HIDDEN   (Keepsakes, below)
3. Is the viewer the author?                       yes → VISIBLE
4. family    → VISIBLE
   custom    → VISIBLE if the viewer is in one of the named groups OR on the named list
   groups    → VISIBLE if the viewer is in one of the named groups
   members   → VISIBLE if the viewer is on the named list
   private   → HIDDEN
   unknown   → HIDDEN
```

**The last line matters.** An unknown visibility kind means "do not show", not
"show". Fail closed. If a new kind is ever added and someone forgets to handle
it, the bug is "something is not visible" — not "everything is visible".

### The safe default for children

When a `child` is among an event's participants, a new event's visibility
automatically becomes "the Parents group only". The user can change it, but
**deliberately**, not by inattention.

The reasoning: the study's regulatory risk *"regulatory risk around children's
data"* — elevated level, with the mitigation "limit children's direct access,
introduce parental control mechanisms".

Implementation: `defaultVisibilityFor()`.

When there is no Parents group to narrow to — a state nobody planned for — the
default is `private`, never `family`.

### When a group is deleted

Events that were visible only to that group become **private to their author** —
not visible to everyone. Fail closed again: deleting a group never opens data
wider. A `custom` audience keeps its named people and loses only the group; one
left with nobody becomes `private`.

---

## Repeating events

A series is **one `Event` row** with a rule — never one row per occurrence:

| Field | Meaning |
|-------|---------|
| `repeat` | `daily`, `weekly`, `monthly`, `yearly`, or null for once |
| `repeatUntil` | The last day an occurrence may start on (its local day in the zone) |
| `repeatSkips` | Days (`YYYY-MM-DD`, local) taken out: "not this week" |
| `repeatTimeZone` | The IANA zone the series is kept in |

Occurrences are computed in that zone's wall-clock time, counted from the first
one every time: weekly keeps the weekday and the hour through the clock
changes; monthly on the 31st is the last day of a shorter month and returns to
the 31st; yearly on 29 February is the 28th in other years. The same algorithm
lives in `apps/api/src/common/recurrence.ts` and
`apps/mobile/src/domain/recurrence.ts`, and both test suites check the same dates.

A series has one `Reminder` row that walks along it: `scheduledFor` moves to
the next occurrence still ahead once the current one is sent or dropped.

---

## People over time

**In memoriam.** `Member.diedOn` marks the day somebody died. The row stays with
everything it is part of; what stops is what treats them as present — the
birthday strip, reminders and notifications, the calendar feed, and signing in
(`contextFor()` refuses the membership). An admin's act, reversible, never
about yourself, never the last living admin.

**Photographs.** `Member.avatarKey` is a storage key like an attachment's; the
API signs a short-lived `avatarUrl` on the way out. `avatarUrl` on the row is
the old free-text field and is cleared when a photograph is uploaded.

**Visits.** `MemberVisit` holds when a person's latest visit began. It is kept
out of `Member` on purpose: every family snapshot includes every member row,
and when somebody last opened the app is nobody else's business.

**What somebody likes.** `Member.interests` is a list of keys from a fixed
vocabulary (`apps/api/src/common/interests.ts`, mirrored in the app's
`domain/interests.ts`): `garden`, `baking`, `fishing` and seventeen more, at
most twelve, never free text. It rides on the member row like the birthday,
because the family reads it: the gift ideas before a birthday are worked out
on the device from it (docs/07-IMPROVEMENTS.md item 91). Your own are yours to
change; a child's are changed by the adult who manages the profile or an admin,
and written to the audit log (`child_profile.updated`). Anonymising a departed
account empties it.

---

## Wish lists

`WishItem` is a line on a person's list (`forMemberId`), written by anybody but
a child profile (`addedByMemberId`), optionally claimed (`claimedByMemberId`).
**The person it is for sees only the lines they wrote, and never a claim**; the
rest of the family sees everything. The server applies this in the query.

A line can be written already claimed (`claim: true`): that is how a gift idea
is taken - "I'll get this" puts the idea's words on the list as the taker's.
Never on your own list, where a claim could not be seen.

---

## The family's days

Mother's Day, Midsummer, Christmas Eve and nine more are **not stored**. They
are rules over the calendar - fixed dates, the nth Sunday of a month, Western
Easter - in `apps/api/src/common/special-days.ts` and the app's
`domain/special-days.ts`, which test the same dates. The worker writes one
`special_day` notification per member three days ahead (Riga's calendar, not
before 09:00), for everybody who can sign in and wants reminders; the app draws
the rest - the timeline card a week ahead, the calendar mark, the day's page.

---

## Keepsakes

Fields on `Event` for what a family keeps rather than plans
(docs/07-IMPROVEMENTS.md items 75-82):

| Field | Meaning |
|-------|---------|
| `sealedUntil` | A **time capsule**: until this moment everybody but the author sees the envelope only - title, date, who. The server strips the description, tags, attachments, reactions and reminders from every reply and refuses comments, reactions, uploads and guest links (`capsule_sealed`). At most a hundred years ahead |
| `hiddenFromMemberId` + `revealAt` | A **surprise**: hidden from that one member until `revealAt`, before every other rule (step 2a above). Never yourself, never outside the family, at most 400 days ahead. Set when the event is made and not changed after |
| `unlockNotifiedAt` | When the worker told the family a capsule opened or a surprise was ready - claimed once, so nobody is told twice. Moving `sealedUntil` clears it |
| `onStoryShelf` | A tale told in a voice note, on the family's **story shelf** - no longer shown in the app (2026-10-01) |
| `promptKey` | The question an event answers: the weekly question, or an `ls-` key of the **life story** (`domain/lifestory.ts`) |

**Both hiding rules are positive branches in the query**, never a `NOT`: the
columns are null on nearly every event, and SQL's `NOT` over a null is null,
which would have hidden every ordinary event from everybody
(`VisibilityService.eventFilter`).

A sealed capsule's author sees it whole - it is theirs - but nobody else may
edit it until it opens, and only the author may move the day.

---

## Leaving the family, deliberately

`EventShareLink` is the one way data leaves: one event, read-only, made by its
author or an admin, expiring after 1, 7 or 30 days, withdrawable, stored as a
hash. A guest sees the title, the date, the description and the photographs —
never the participants, the audience or the comments.

An **heirloom** link (`heirloom = true`) is the one on a printed sticker: it
lasts a hundred years and plays the event's voice notes as well. No link is
made for a sealed capsule or an unrevealed surprise, and an existing one
stops working while its event is either.

`CalendarFeed` is read by the member's own calendar app. The address is an
HMAC over the member and `version`; resetting bumps the version. It answers
with exactly what `eventFilter` gives that member.

---

## Reports

`ContentReport` is what App Review guideline 1.2 asks of an app whose people
post things: a way to say "this should not be here". It holds what was
reported, why, and who reported it:

- `target`: `event` or `comment`.
- `eventId`: always set. For a comment, it is the event the comment is on.
- `commentId`: set for a comment.
- `reason`: `inappropriate`, `harassment`, `spam` or `other`.
- `note`: optional, at most 500 characters.
- `reporterMemberId`: who reported it.

The rules:

- **Only what you can see can be reported.** The check is the same one that
  opening the event goes through, so a report can never be a way to learn
  that something exists.
- **Not your own.** You can delete what you wrote yourself.
- **Once.** A second report of the same thing by the same person, while the
  first is open, adds nothing.
- **The admins are told, not by whom.** A `content_reported` notification goes
  to the family's admins who can see the event, except the reporter, with no
  actor in it. It never goes to the author of what was reported.
- **The operator reads every open report** with `npm --prefix apps/api run
  reports`, which shows ids and reasons, not the content, and closes one by
  setting `resolvedAt`.

A report is kept for 12 months from when it was made, then the daily
housekeeping deletes it (`KEEP.reportDays`).

---

## Blocks

`MemberBlock` is the other half of what guideline 1.2 asks: a way to stop
seeing somebody. An admin can already remove a member from the family; a
block is what anybody can do for themselves, admin or not, about anybody,
admin or not. One row per pair: `blockerMemberId` blocked `blockedMemberId`,
both in `familyId`, since `createdAt`.

**What it does, for the blocker alone:**

- **The blocked member's entries leave the blocker's view**: the timeline, the
  calendar, search, the calendar feed, the bell, the AI's suggestions, opening
  one directly. The rule is in `eventFilter` itself, so every path that reads
  events has it. It is a positive branch like the others: "the author has no
  block from this viewer" is `NOT EXISTS`, which never meets a null.
- **Their comments and reactions** leave the entries the blocker still sees,
  and are not counted.
- **The bell** writes nothing for the blocker about what the blocked member
  does, and no longer lists what was written before the block.

**What it does not do:**

- The blocked member is not told, and sees nothing different. They still see
  the blocker's entries as the audience of each allows: who sees what you
  write is the audience's job, for anybody.
- They stay in the family: in the member list, on the birthday strip, as a
  participant in entries other people wrote. Their profile tells the blocker
  they are blocked, and unblocking is there.
- Nobody else is told, the admins included. A block has no reason and no note.

The rules:

- **Not yourself, and not a child profile.** A child has no account and
  writes nothing; what is about a child is written by an adult.
- **Only an active member of your own family.** Anything else is answered as a
  member who is not there.
- **Once.** Blocking again changes nothing, and so does unblocking somebody
  who is not blocked.
- **Your own.** The client learns its own list with the family
  (`blockedMemberIds`); nobody learns who blocked them. A person's export
  carries the people they blocked, and erasing an account deletes the blocks
  it made.

---

## Counting, without anybody in it

`AnalyticsEvent` is one product event from the app: a `name` from a fixed list,
`props` holding only the fields listed for that name (a short word, a number or
a boolean), `createdAt`, and `familyId` — the finest grain there is, because
"families with three events" is the finest question the KPIs ask. There is no
user, member, device or address column, on purpose. `User.shareUsageStats`
(default `true`) is the switch; when it is off the server keeps nothing.
Deleted after 400 days.

`ClientError` is one error the app ran into: the message and stack (scrubbed),
the platform, the screen as a pattern (`/event/:id`), the app version. It is
tied to nobody — not even a family — because it is accepted before sign-in.
Deleted after 90 days. See 05-API.md, Telemetry.

---

## Life-cycle categories

The study names them as a differentiator: no competitor (Cozi, FamilyWall,
Tinybeans, Life360, Todoist) offers a structured life-cycle model.

| ID | Label | Tone |
|----|-------|------|
| `development` | Development | growth |
| `education` | Education | learn |
| `milestone` | Milestone | landmark |
| `health` | Health | care |
| `celebration` | Celebration | joy |
| `travel` | Travel | journey |
| `activity` | Activity | routine |
| `chore` | Chore | task |
| `finance` | Finance | money |
| `other` | Other | neutral |

The tone key connects a category to `theme/tokens.ts` → `categoryTone`.

**A category is not a tag.** It is the basis for the archive, for yearly
summaries, for the timeline filters and for V2 AI classification.

---

## Files

`Attachment` stores a **`storageKey`, not a public URL**.

The public link is generated as a short-lived presigned URL at request time,
after the visibility check. If an image were reachable through a permanent link,
the event's visibility control would mean nothing — one forwarded link would be
enough.

---

## The indexes that matter

| Index | Why |
|-------|-----|
| `Event(familyId, startsAt DESC)` | The timeline's core query |
| `Reminder(scheduledFor, deliveredAt)` | The worker: what has to go out in the next minute |
| `Member(familyId, status)` | The list of active members |
| `EventVisibility(groupId)`, `(memberId)` | The visibility check without a full scan |
| `AuditLog(familyId, createdAt)` | Investigating a security incident |

The calendar's date range is served by the same `Event(familyId, startsAt DESC)`
index: PostgreSQL scans b-tree indexes in both directions, so a second ascending
index on the same columns would only cost write speed and give nothing back.

---

## Soft deletion

`User`, `Family`, `Event`, `Comment` — all of them have `deletedAt`.

GDPR requires deletion, but not immediate deletion. A 30-day window allows an
accidental deletion to be undone, and final anonymisation afterwards. See
[`06-PRIVACY-GDPR.md`](06-PRIVACY-GDPR.md).

A removed member is not deleted — `status = removed`. The events and comments
they added stay in the family chronicle. A person can leave a family; the family's
history does not leave with them.

---

## Subscriptions

`Subscription` is the family's plan: one row per family at most, and no row
is the free plan. Premium is bought in the App Store or Google Play; RevenueCat
checks the receipts and follows renewals, grace periods, refunds and
transfers, and **the family's id is RevenueCat's app user id**. So a purchase
belongs to the family it was made in, every member's app sees it, and the
payer's Apple ID or Google account is what renews or cancels it.

**Where the row comes from.** Never from what a request says. The app asks
the server to read the family again right after a purchase or a restore
(`POST /families/{id}/subscription/sync`), and RevenueCat's webhook asks for
everything the app never sees - a renewal at night, a cancellation in the
phone's settings, a refund. Both end in one step: the server calls RevenueCat
with its secret key and writes what it is told:

| Field | From RevenueCat |
|-------|-----------------|
| `plan`, `status` | `premium` + `active` while the entitlement runs; `past_due` while the store retries a payment inside the grace period; `free` + `expired` after |
| `period` | From the product's name: `monthly` or `annual` |
| `currentPeriodEnd` | The end of what is paid for, the grace period included. null = no end |
| `cancelAtPeriodEnd` | Renewal is turned off; Premium runs to the end and stops |
| `store` | `app_store`, `play_store`, `promotional` (granted in RevenueCat), `other` |
| `sandbox` | Bought in a test environment - TestFlight, App Review. It unlocks Premium and is never counted as revenue |
| `syncedAt` | When it was last read |

**Whether a family has Premium** is one function, `isPremium` in
`modules/subscriptions/premium.ts`, for every limit the server enforces and
for the `plan` the family's reply carries: `plan = premium`, `status` active
or past due, and `currentPeriodEnd` not passed. The date is checked, not only
the status, because a webhook can be late or lost.

**A plan set by hand** - a row with `store = null`, written by the operator
for the founder's family or a tester - is never overwritten by RevenueCat
saying it has nothing. A real purchase in that family replaces it.

**When a purchase moves.** Restoring purchases in another family moves the
subscription there (RevenueCat's transfer). The webhook names both families;
the old one finds nothing in RevenueCat and ends, the new one starts.

The old columns `stripeCustomerId`, `stripeSubscriptionId`,
`appleOriginalTxId` and `googlePurchaseToken` are for paying without
RevenueCat (Stripe on the web, the stores directly) and stay empty.
