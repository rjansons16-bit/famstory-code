# Record of processing activities (GDPR Art. 30)

> **DRAFT, 2026-09-24; completed for the launch 2026-10-08**, written from
> the code (apps/api/prisma/schema.prisma, docs/06-PRIVACY-GDPR.md). To be
> kept current: a new table, a new provider or a new purpose is a new line
> here in the same change.

**Controller:** the company in `facts.json` (name, registration number,
address); privacy@famstory.lv.
**Data protection officer:** none appointed; the DPIA says why, and the
lawyer confirms it.
**Where all of it is:** one server and its backups, at the hosting provider in
`facts.json`, in an EU country. One transfer outside the EU/EEA: RevenueCat,
for Premium (section 3e), under the standard contractual clauses.

Security measures that apply to every line below, rather than repeated in
each: HTTPS only; passwords as scrypt hashes; access tokens short-lived,
refresh tokens stored as hashes and rotated; every read of events filtered by
audience in the database query (`VisibilityService.eventFilter`), failing
closed; photographs only through signed links valid 30 minutes; sign-in and
public endpoints rate limited; an audit log of sensitive actions; nightly
backups with a tested restore. Encryption at rest: none beyond the hosting
provider's own measures (docs/12-LAUNCH-RUNBOOK.md has disk encryption as an
option).

---

### 1. Accounts and sign-in
- **Purpose:** to let a person sign in and act as themselves.
- **Basis:** contract (6(1)(b)).
- **Data subjects:** account holders.
- **Data:** email, password hash, display name, photograph (optional),
  language, usage-counts switch, created/updated times, the version of the
  terms and the privacy policy accepted and when; Google/Apple account id
  when that sign-in is used (not active yet).
- **Recipients:** none outside the controller.
- **Retention:** until deletion; 30-day grace; then deleted (section 13).

### 2. Sessions and rate limiting
- **Purpose:** keeping accounts safe; stopping password guessing.
- **Basis:** legitimate interest (6(1)(f)); security (Art. 32).
- **Data:** refresh-token hash, device/browser name, salted hash of the
  network address; attempt counters by address and account (in memory only,
  lost on restart).
- **Retention:** a session until it expires (30 days) or is revoked, then
  deleted a week later (modules/housekeeping); counters minutes.

### 3. The family chronicle
- **Purpose:** the service — a family's shared record and calendar.
- **Basis:** contract with the account holder who writes; legitimate interest
  for what it says about others; **Art. 9 condition for health information
  — open (README.md question 4).**
- **Data subjects:** account holders; family members without accounts,
  including **children**; anyone a family writes about.
- **Data:** events (title, description, dates, category, tags, repeat rule,
  participants, audience), photographs and videos, comments, reactions,
  reminders, notifications, wish lists (and who is buying what), the family's
  name, cover and groups.
- **Recipients:** the audience each entry names, inside the family.
- **Retention:** until deleted by the family; after an author leaves, kept
  under "Former member" (section 13).

### 3a. Voice notes
- **Purpose:** a family story told instead of typed, kept with its event.
- **Basis:** as the chronicle (3).
- **Data subjects:** whoever speaks - often a grandparent, sometimes a child.
- **Data:** the recording (WebM/Ogg/MP4 audio), its length, the event it
  belongs to.
- **Recipients:** the event's audience inside the family; **excluded from
  guest links**.
- **Retention:** until removed from the event; removal deletes the file and is
  audited.

### 3b. Dictation - not FamStory's processing, but FamStory's button
- **What happens:** the browser's speech service turns speech into text -
  Google (Chrome, Edge) or Apple (Safari) receive the sound under the person's
  own browser terms. FamStory receives only the text (processed as 3).
- **Measures:** a notice before the first use on each device; only on a press,
  never listening by itself; unavailable where the browser has no such service.

### 3c. Reports of an entry or a comment
- **Purpose:** dealing with what breaks the terms (App Review 1.2).
- **Basis:** legitimate interest.
- **Data:** which entry or comment, the reason, the reporter's note, who
  reported it. The family's admins learn that something was reported, not by
  whom.
- **Retention:** 12 months from the report (`KEEP.reportDays`).

### 3d. Blocks
- **Purpose:** not seeing what one family member posts.
- **Basis:** contract.
- **Data:** who blocked whom, since when. Nobody else is told.
- **Retention:** until unblocked; deleted with the account that made it.

### 3e. Premium
- **Purpose:** selling and keeping the family's subscription.
- **Basis:** contract.
- **Data:** the plan, its status, period and end, the store, whether it was a
  test purchase; the family's id is RevenueCat's customer id.
- **Recipients:** Apple and Google sell the subscription as independent
  controllers; RevenueCat, Inc. (USA) checks the purchases as our processor
  and sees the family's id, the store's receipt and the phone's network
  address, never names or content. Transfer: the 2021 standard contractual
  clauses, module two, in RevenueCat's DPA.
- **Retention:** with the family.

### 4. Family members, roles and child profiles
- **Purpose:** who is in the family and what they may do.
- **Basis:** contract; legitimate interest; for children, the parent's
  management of the profile (**open question 5**).
- **Data:** display name, role, status, birth date (optional), photograph
  (optional), the managing adult for a child, date of death if marked.
- **Recipients:** the family.
- **Retention:** until removed; anonymised on the person's erasure.

### 5. Invitations and password-reset links
- **Purpose:** bringing people into the family; letting an admin help a
  member who forgot their password.
- **Basis:** legitimate interest.
- **Data:** invitee email (when invited by email), code, intended role and
  groups, who invited; for resets, a token hash, who made it, expiry.
- **Retention:** an invitation never accepted is deleted 90 days after it
  expired or was withdrawn; an accepted one stays (who invited whom); reset
  links work 24 hours, once, and are deleted 30 days after they expire.

### 6. The audit log
- **Purpose:** being able to say who saw or changed what — above all for
  children's data (docs/06-PRIVACY-GDPR.md §1).
- **Basis:** legitimate interest; security.
- **Data:** actor, action, the entity acted on, structural metadata (never
  content), salted address hash, device name.
- **Retention:** 24 months, then deleted by the daily housekeeping
  (`KEEP.auditDays`).

### 7. Visits
- **Purpose:** "new since you last looked".
- **Basis:** contract.
- **Data:** when a member's latest visit began. Seen only by that member.
- **Retention:** until the account is erased.

### 8. Guest links
- **Purpose:** showing one event to someone outside the family, chosen by a
  member.
- **Basis:** the member's choice under the contract; legitimate interest of
  the family (**DPIA risk R4** for events with children).
- **Data:** the event's title, date, description and photographs, shown to
  anyone holding the link; the link's hash, expiry, view count, who made it.
- **Recipients:** whoever the member gives the link to.
- **Retention:** 1, 7 or 30 days, or until withdrawn.

### 9. Calendar feeds
- **Purpose:** a member's own events in their phone's calendar.
- **Basis:** contract.
- **Data:** what that member can see, and birthdays; a version number (the
  address is signed, not stored).
- **Recipients:** whoever holds the member's address — normally their own
  calendar application and its provider (e.g. Apple, Google), **chosen by the
  member**.
- **Retention:** until reset; ends when the member leaves or is erased.

### 10. Suggestions
- **Purpose:** suggesting an event type or a reminder time; warning of a
  clash — and measuring whether suggestions help.
- **Basis:** legitimate interest.
- **Data:** the suggestion, its confidence, whether it was accepted, the
  family. Rules on our server; no external AI service.
- **Retention:** a suggestion expires after 7 days; the row, with whether it
  was accepted, is deleted after 400 days.

### 11. Usage counts
- **Purpose:** the product's KPIs (docs/00-PLAN.md §6).
- **Basis:** legitimate interest; objection by the switch in Profile.
- **Data:** event name, listed structural fields, time, family id. **No
  person.** Pseudonymous through the family id.
- **Retention:** 400 days, deleted automatically.

### 12. Error reports
- **Purpose:** fixing what breaks.
- **Basis:** legitimate interest.
- **Data:** message, stack, platform, screen pattern, app version — scrubbed
  of addresses, tokens, emails and ids; tied to nobody.
- **Retention:** 90 days, deleted automatically.

### 13. Account deletion
- **Purpose:** erasure (Art. 17) with a 30-day grace.
- **Data:** the deletion time; afterwards the member rows stripped to "Former
  member" and the account, identities, sessions, devices, photograph file,
  visits and calendar feed deleted. A family left with nobody who can sign
  in is closed, and deleted with its photographs 12 months later
  (`KEEP.closedFamilyDays`).

### 14. Data export
- **Purpose:** access and portability (Art. 15, 20).
- **Data:** everything the account is, as JSON, to the person themselves.

### 15. Backups
- **Purpose:** restoring after a failure or a mistake.
- **Basis:** legitimate interest; security.
- **Data:** a full copy of the database and the photographs.
- **Retention:** 7 daily and 4 weekly copies (about 35 days).
- **Where:** on the same server; a copy elsewhere is the owner's choice
  (tools/deploy/README.md, "Backups"), and goes into section 19 when made.

### 16. Push notifications (2026-10-12)
- **Purpose:** telling a person's phone that the bell has something new for
  them - the same people, for the same reasons, as the bell (section 8).
- **Basis:** contract (Art. 6(1)(b)); the phone's own permission, asked when
  a reminder is first set or in Settings, and withdrawn in the phone's
  settings.
- **Data:** the phone's push token (Apple's or Google's), its platform and the
  app's language (`Device`). What travels with a push: one generic line per
  kind ("you have a reminder") and the event's id - **no title, name or
  anything the family wrote** (`apps/api/src/modules/push/push-messages.ts`).
- **Recipients:** Apple (APNs) and Google (FCM), which deliver to the phone.
- **Transfers:** USA - Apple Inc. and Google LLC, EU-U.S. Data Privacy
  Framework (Art. 45); only the token and the generic line.
- **Retention:** until the person signs out on that phone, the phone refuses
  pushes, or 180 days after the app last used the token
  (`KEEP.deviceDays`).

### 17. Emails the server sends (2026-10-12)
- **Purpose:** a link to set a new password, asked for by the person
  ("Forgot your password?").
- **Basis:** contract (Art. 6(1)(b)).
- **Data:** the account's email address, the account's language, and a
  one-time link; the link's hash is kept (`PasswordReset`), it works for one
  hour, and the record goes 30 days after it expired (`KEEP.passwordResetDays`).
- **Recipients:** the email provider (`facts.json`, `mailer`), in the EU.
- **Audit:** `account.password_reset_email`.

### 18. Not active yet — to be added when it is
An outside error tracker, if one is chosen.

### 19. Processors
Each needs its Art. 28 agreement before it receives any data, at the launch:

- the hosting provider (`facts.json`, `hosting`): its data processing
  agreement, accepted in its console;
- the mailbox provider (`facts.json`, `mailbox`): the same;
- the email provider (`facts.json`, `mailer`), when it is not the mailbox's
  own company: the same;
- RevenueCat, Inc. (USA): its DPA is part of its terms, with the standard
  contractual clauses;
- Apple and Google for pushes: Apple's under the Apple Developer Program
  License Agreement; Google's Firebase Data Processing and Security Terms,
  accepted in the Firebase console.
