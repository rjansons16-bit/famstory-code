# Privacy, children's data and GDPR

> ⚠️ **This document is not legal advice.** It is a list of technical
> requirements prepared by the development side. The study states plainly:
> *"have the solution reviewed legally before the public launch"*. A lawyer does
> that, not this file.

---

## Why this is a document of its own

From the study's risk analysis:

| Risk | Likelihood | Impact | Level |
|------|------------|--------|-------|
| Non-compliance with personal data protection | Low/medium | **Critical** | Manageable |
| Regulatory risk around children's data | Medium | High | **Elevated** |
| A data security incident | Low/medium | **Critical** | Manageable |
| Lack of trust in a new family-data product | Medium | High | **Elevated** |

The product holds photos of children, medical appointments, school events and a
family's internal correspondence. That is the most sensitive set of personal data
a private app can carry.

---

## 1. Children's data

### The principle: a child has no account

`Member.role = 'child'` → `userId = null`, and `managedByMemberId` points at a
parent.

A child profile is **a record in the family system**, not a user account. No
password, no sign-in, no email. That removes most of the complexity of
children's-data regulation: there is no question of a minor's consent, because
the minor is not a user.

### The safe default

An event with a child among its participants is visible to **the Parents group
only** by default. The user can widen it, but by a deliberate action.

Code: `defaultVisibilityFor()` in `apps/mobile/src/domain/visibility.ts` and in
`apps/api/src/modules/visibility/visibility.service.ts` — the server applies it
too, because an API call can come from anywhere.
UI: a warning at the top of the visibility sheet.

### The audit log

Every access to a child profile and every change to one writes an `AuditLog`
entry. Without it, after an incident, there is no way to say who saw what.

### When a child grows up

Still **unresolved**. The questions that need answering before the public launch:

- Can a profile become an account at 16?
- What happens to events the child is a participant in — do they gain access
  retrospectively?
- Can they demand deletion of their data from a parent's chronicle?

The third question is the hard one: a child's right to erasure collides with a
parent's right to their own family memory. That is a legal question, not a
technical one.

---

## 2. GDPR requirements and their status

| Requirement | Status | Where |
|-------------|--------|-------|
| Data minimisation | ✅ Followed | Analytics events carry no content, only structural facts |
| Privacy by design | ✅ Followed | Visibility is a required field, not an option; fail closed |
| Encryption in transit | ⬜ Stage C | TLS 1.3, HSTS |
| Encryption at rest | ⬜ Not provided | Only what the hosting provider does; encrypting the server's disk is an option in `12-LAUNCH-RUNBOOK.md`. The privacy policy says no more than that |
| Right of access (Art. 15) | ✅ Implemented | `GET /users/me/data-export` |
| Portability (Art. 20) | ✅ Implemented | JSON. Photographs are listed by storage key; the ZIP that carries the files themselves waits for the bucket |
| Erasure (Art. 17) | ✅ Implemented | `DELETE /users/me`, a 30-day grace period, then `AccountService.purgeExpired` anonymises the member rows and deletes the account |
| Consent | ✅ Implemented | At registration, versioned: `User.termsVersion` and `termsAcceptedAt` from the version in `docs/legal/facts.json`; asked again after sign-in when a new version is published (`app/terms.tsx`) |
| A record of processing | 🟡 Draft | [`legal/record-of-processing.md`](legal/record-of-processing.md), for the controller and a lawyer |
| DPIA | 🟡 Draft | [`legal/dpia.md`](legal/dpia.md) — one risk still high: health data needs an Art. 9 condition |
| Data processing agreements | ⬜ At the launch | Hosting, the mailbox, the email sender (`mailer`) and RevenueCat (its DPA carries the standard contractual clauses); Firebase's terms for Android pushes, Apple's developer agreement for iPhone pushes - pushes carry no family content (`legal/record-of-processing.md` §16). No AI provider. `12-LAUNCH-RUNBOOK.md` lists them |
| Incident procedure | 🟡 Draft | [`legal/incident-response.md`](legal/incident-response.md) — the 72 hours, step by step |

### An important nuance about exports

The Premium plan limits **the designed family chronicle** (PDF, photo book) —
that is a product.

The **data retrieval** GDPR requires (Art. 15 and 20) must not sit behind a
paywall. It is available to everyone, free users included.

That is marked in the code: `apps/mobile/src/app/settings/index.tsx`, in the
comment next to the export row — which until 2026-09-21 sent a free user to the
paywall, in contradiction of this page. The row is now open to every plan, and
`PlanLimits.canExport` says in its own comment that it governs the designed
chronicle and nothing else.

### What erasure actually removes

The account, its identities, its sessions and its devices are deleted. The
**member row stays, stripped**: name replaced with "Former member", no
photograph, no birthday, no account behind it. That row is what a family's
events, comments and photographs hang from, and deleting it would take a shared
chronicle apart in order to remove one person from it — the collision named at
the top of this document, resolved in favour of the family for content and in
favour of the person for everything personal.

A family with nobody left who can sign in is closed (`deletedAt`), not
shredded: "the last adult deleted their account" and "these memories should be
destroyed" are different statements, and only one of them can be taken back.

The purge also removes the person's **photograph file** (not only the pointer
to it), when they last opened the app (`MemberVisit`) and their calendar
address (`CalendarFeed`).

### Processing added on 2026-09-24, for the privacy policy and the DPIA

Each of these is a new purpose or a new way data can move, and each belongs in
the record of processing activities before the beta:

| What | Personal data | Who sees it | Retention |
|------|---------------|-------------|-----------|
| **Visits** ("new since you last looked") | When a member's latest visit began | Only that member — kept out of every member listing on purpose; in their own export | Until the account is erased |
| **Profile photographs** | A face, including a child's | The family, through links that expire after 30 minutes | Replaced on change; removed on erasure |
| **Wish lists** | Lines about a person's wishes, and who is buying what | The family, except the person the list is for, who sees only their own lines | Until removed; a child's list is audited when read |
| **In memoriam** | The date a person died | The family | Until taken back. GDPR protects the living, but the family's grief is still the reason to treat this carefully: admins only, reversible, audited |
| **Guest links** | One event's title, date, description and photographs | **Anybody holding the link** — the one path out of the family | 1, 7 or 30 days; withdrawable; every link made and every view of an event with a child in it is audited |
| **Calendar feed** | The events a member can see, and birthdays | Whoever holds that member's address — normally their own calendar app | Until reset; the address dies when the member leaves, dies or deletes the account |
| **Usage counts** (`AnalyticsEvent`) | None directly: an event name, a few structural fields from a fixed list, a time, and the family's id — no user, member, device or address | The team, as totals (`npm run kpis`) | 400 days. Nothing kept for a user who switched "Share usage counts" off; the server enforces it |
| **Voice notes** (2026-09-25) | A recording of somebody's voice, often telling a family story; sometimes a child's | The event's audience, like its photographs; **never a guest link** | Until removed - deleting one removes the file, and it is audited |
| **Dictation** (2026-09-25) | The sound of what is dictated - **sent by the browser to Google (Chrome, Edge) or Apple (Safari)**, not to us; FamStory receives only the resulting text | The browser's maker, under the person's own browser terms | Not kept by us at all; the text becomes part of the entry |
| **Error reports** (`ClientError`) | None intended: what broke, the stack, the platform, the screen as a pattern. Scrubbed of query strings, tokens, email addresses and ids before storage; accepted without a session and tied to nobody | The team | 90 days |
| **Interests** (2026-09-28) | What a person likes, as keys from a fixed list of twenty ("gardening", "fishing") - never free text; a **child's are set by the adult who manages the profile** | The family, on the member row, like the birthday | Until changed; emptied when a departed account is anonymised; in the person's export. Changing a child's is audited |
| **Gift ideas** (2026-09-28) | Nothing new is stored: the ideas are worked out **on the viewer's device** from the interests and the events that viewer can already see. "I'll get this" writes the idea as a wish-list line - see Wish lists. "Search" opens the idea's own words in the reader's browser - never a name, never who it is for | The viewer; never the person the ideas are for | Not kept |
| **Special days** (2026-09-28) | Which day (Mother's Day, Christmas Eve...) and its date, in a member's bell. Nothing about the person beyond that they are in the family | That member | Like every notification |

**The basis for the last two** is legitimate interest (Art. 6(1)(f)): knowing
whether the product works and is used is necessary to run it, the data is
built so that it identifies nobody, and the switch in the profile is the
objection (Art. 21) made effective rather than a form to fill in. The family id
is what keeps the counts from being anonymous in the strict sense — it links
back to a family's rows — so they are treated as pseudonymous personal data:
in the record of processing, in the DPIA, kept no longer than the 400 days,
and never joined back to a person. The privacy policy has to say all of this,
and that nothing is sent to an outside analytics service.

**Interests are chosen from a list on purpose.** A text box would invite
sentences about a person - and a child - that the family's records have no need
to keep; a key says "baking" and nothing else. The ideas built on them are rules
over what the viewer already sees, which is why they send nothing anywhere and
need no model: the same reason the MVP's AI is rule-based (section 3).

The guest link and the calendar feed are the two places where an address is
itself the permission, so both are narrow (one event; one person's own view),
both can be cut off at once (withdraw; reset), and neither ever shows who can
see what. The privacy policy has to say so in these words, and the DPIA has to
weigh the guest link for events with children in them — the app already warns
before a link is made for one.

---

## 3. Where the data lives

- **All in the EU.** Database, files, logs, monitoring (Sentry EU).
- **The AI service** — if an external LLM is used, the data transfer has to be
  assessed. The study does not mention this, but the MVP AI is rule-based and
  **sends data nowhere**. That is one of the reasons to start with rules rather
  than a model.

---

## 4. What the product does not do

These promises are the basis of the product's communication, and therefore also
technical constraints:

- ❌ Does not sell data
- ❌ Does not build advertising profiles
- ❌ Shows no advertising (on the free plan either — unlike Cozi)
- ❌ Makes nothing public
- ❌ Does not use family content to train models

The study's risk *"lack of trust in a new family-data product"* comes with the
mitigation: *"show clearly that the data is not made public or used to build
advertising profiles."* This list is what has to be shown.

---

## 5. Mandatory before the public launch

1. A legal review of the children's-data design (**an explicit requirement of the study**)
2. A DPIA
3. A privacy policy and terms of use — drafts in [`legal/`](legal/README.md), with
   the questions only a lawyer can answer collected at the top
4. An AI limitation clause in the terms — *"position AI suggestions as supporting
   recommendations, not as legal, medical or psychological advice"*
5. Data processing agreements with every provider
6. A security audit with a penetration test
7. An incident response procedure
