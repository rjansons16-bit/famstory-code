# FamStory — development plan

> Source: *A technical and economic feasibility study for the development of the
> FamStory mobile application*.
> This document translates the study into concrete development steps.

---

## 1. What we are building

**FamStory** — a family life management platform. Not a calendar. Not a photo
gallery. A system where **the family is the primary entity**, and events,
members, roles, visibility and a long-term archive are structured around it.

**In one sentence:** a place where family life is written down so that it can
still be read in ten years.

**Positioning (critical in every text and in the design):**
- ✅ "a family life management and memory platform"
- ❌ "a family calendar" / "a family chat" / "a photo album"

The study singles this out as an **elevated market risk** — if the product looks
like a calendar, it competes with Cozi and loses.

---

## 2. The MVP boundary

The study warns: *"exceeding the MVP scope — medium likelihood, high impact"*.
So the boundary is strict and written down.

### Core MVP — without this there is nothing to validate

| # | Feature | Status in the repo |
|---|---------|--------------------|
| 1 | Registration (email, Google, Apple) | email ✅ end to end; Google/Apple need a native build |
| 2 | Family creation + the digital space | ✅ against the live API |
| 3 | Inviting members (email / link / code) | foundations ✅ |
| 4 | Roles: admin, member, child, viewer | foundations ✅ |
| 5 | Groups (parents, children, grandparents, custom) | foundations ✅ |
| 6 | Adding an event (date, description, photo/video, participants, category) | ✅ photos upload to the server's disk and get thumbnails; video still ⬜ |
| 7 | **Visibility control** for every event | foundations ✅ |
| 8 | Timeline (a chronological stream + filters) | ✅ against the live API |
| 9 | Calendar (month + day list) | foundations ✅ |
| 10 | Comments and reactions | ✅ against the live API |
| 11 | Push reminders | ✅ delivered in the app by a worker, and to the phone straight through APNs and FCM (`modules/push`) - live once the server has the keys from the developer accounts |

### MVP+ — monetisation and retention, after the first beta

- Data export (a PDF/ZIP family chronicle)
- Extended reminders (repeating, anniversaries)
- Simple monthly summaries (no AI — aggregation only)
- Premium limits and the paywall
- Basic analytics for the admin

### V2 / scaling — after product-market fit

- AI summaries and automatic categorisation
- Personalised suggestions, a family year in review
- Photo books / Memory Print
- Google/Apple calendar integration
- Multi-language expansion beyond Latvian and English

> **Pulled forward, 2026-09-24, by the owner's decision** ("build everything
> that does not need my help", after reading docs/08-LAUNCH-PLAN.md): the
> launch plan's Wave 3 is built ahead of the beta, because the study's critical
> risk is retention and these are the features aimed at it. From the lists
> above that means **repeating events** (MVP+ "extended reminders") and a
> **read-only calendar feed** — not the V2 two-way Google/Apple integration,
> which stays V2. Not in the study at all and added from the launch plan:
> "what changed since you last looked", wish lists, in memoriam, a guest link
> to one event, profile photographs. Still out: Premium and payments (need
> accounts), the printed chronicle, and everything in the list below.

> **Pulled forward again, 2026-09-27, by the owner's decision** ("add all the
> features you came up with"): eight keepsakes, docs/07-IMPROVEMENTS.md items
> 75-82 - time capsules, birthday surprises, a grandparent's life story,
> heirloom stickers, growing up, traditions and the year as a
> one-minute film. The film is V2's "family year in review" without the AI:
> the year's own photographs and voices in order, nothing written by a model.
> None is on the explicit no list below. With them, the web app became
> installable from the browser and findable by a search engine (items 83-84);
> the App Store and Google Play still need the owner's developer accounts.

> **Pulled forward, 2026-09-28, by the owner's decision** ("collect what people
> like at the start, suggest a present before somebody's birthday, and remind
> about Mother's Day and the other days"): V2's **personalised suggestions**,
> as rules and not a model - docs/07-IMPROVEMENTS.md items 91-92. What
> somebody likes is a pick from a fixed list, asked in onboarding; gift ideas
> are lines from the app's own list, worked out on the device from what the
> viewer can already see; the family's days (Mother's Day, Midsummer,
> Christmas Eve...) are computed from Latvia's calendar and announced three
> days ahead. Nothing is predicted and nothing acts by itself - an idea is
> taken with a press, onto the wish list. A link to a web search is the reader
> opening their own browser, not an integration.

### Out of the MVP (an explicit no)

A full analytics system · AI prediction · broad external integrations · a
household accounting module · geolocation · chat.

> **Geolocation and chat are especially dangerous** — they pull the product into
> competing with Life360 and WhatsApp, where there is no differentiation.

---

## 3. AI at the MVP stage — deliberately small

The study's risk: *"overestimating AI features"*. At MVP level the AI may do
exactly three things:

1. **Suggest a category** from the event title/description (the user confirms).
2. **Suggest a reminder time** based on how the family usually sets them.
3. **Identify schedule conflicts** (two events, one participant, overlapping times).

Conflict detection (3) is **pure logic, not AI** — it can be written without a
model and is the first to ship. See `apps/api/src/modules/ai/` — the AI layer
sits behind an interface so it can start rule-based and later be swapped for an
LLM without any UI change.

**The UI rule:** AI suggestions always appear as *a suggestion with a
confirmation*, never as an automatic action. The legal reasoning is the study's
regulatory risk "misinterpretation of AI suggestions".

---

## 4. The implementation roadmap (from the study)

| Phase | Period | Result |
|-------|--------|--------|
| 1. Requirements | 0–2 months | An approved specification, the MVP list, the architecture decision |
| 2. UX/UI prototype | 2–4 months | A clickable prototype, validated flows |
| 3. MVP development | 4–10 months | A working MVP |
| 4. Closed beta | 10–12 months | 50–200 families, usage data |
| 5. Public launch | 12–15 months | App Store + Google Play, Premium |
| 6. Optimisation | 15–24 months | Retention, conversion, referral |
| 7. Scaling | 24+ months | AI, export, new markets |

**This repo closes phase 1 and starts phases 2 and 3 at the same time.**

### Decision points (go / no-go)

| When | Question |
|------|----------|
| Months 3–4 | Do users understand the value and the flows? |
| Months 9–10 | Is the system stable enough for a beta? |
| Month 12 | Does retention justify a public launch? |
| Months 15–18 | Do CAC and Premium conversion allow scaling? |
| Month 24 | Are there PMF signals for expanding AI/Premium? |

---

## 5. The concrete development plan (at code level)

### Stage A — foundations ✅ *(done in this repo)*

- [x] Repo structure (`apps/mobile`, `apps/api`, `docs`)
- [x] The full data model in the Prisma schema (19 models)
- [x] Visibility logic as a separate, testable module
- [x] A NestJS module skeleton split by domain
- [x] An Expo + expo-router app with every MVP screen
- [x] A mock data layer — the app works without a backend
- [x] The design token system — `apps/mobile/src/theme/tokens.ts`, one file for design to rewrite
- [x] A locale-shaped text layer from day one (English-only for the MVP)
- [x] A screen specification for the design handoff

### Stage B — design 🎨 *(implementing the delivered design)*

The design arrived as `Fam Track.fig` (exported 2026-08-27): direction
**"saite — 01 · minimal"**, tagline "Moments, tied together". Five swatches and
two faces, reproduced exactly — see `04-DESIGN-BRIEF.md`.

- [x] Palette: Ink · Paper · Evergreen · Jade · Stone, both modes, every pair AA
- [x] Fraunces (display) and Inter (interface), loaded and gated
- [x] "+" in the middle of the tab bar; the floating button removed
- [x] Timeline: audience filters (All · Mine · one per group), relative sections
- [x] Visibility: `custom` — groups and people in one audience, with a live count
- [x] Calendar: the day cell carries the photograph; a dot only for reminders
- [x] Tags alongside the event type — the family's own words
- [x] Profile: the design's row list with values on the right
- [x] Onboarding: About you → the family → Add your people → the first event,
      with a step counter written out and not only drawn; the join branch ends
      after the family, because a family that exists already has both
- [x] How a photograph meets the card: it bleeds to the edges and **keeps its
      own shape** — square at the tallest in the timeline so the chronicle stays
      scannable, its own 4:5 once opened, 16:9 at the widest in both
- [x] Every screen the design draws, implemented from the file itself: the
      `.fig` stores them as images, so they were extracted to `design/screens/`
      (a Kiwi decoder — see `design/screens/README.md`) and built against
- [ ] Iconography — still Ionicons behind a semantic map. Recommended: leave it.
      Swapping the set without a designer'''s direction is taste, not a decision
- [x] Motion — the character written down in `04-DESIGN-BRIEF.md` § 7 and applied
      from one place: `lib/motion.ts` decides the durations and curves,
      `components/ui/touchable.tsx` is the only pressable in the app. Reduced
      motion removes movement rather than shortening it
- [x] **Resolved 2026-09-08, reopened and settled 2026-09-21:** the design's
      Profile shows "Language — Latviešu". It was built as a dead row reading
      "English", because the plan put multi-language in V2. That reading was
      wrong about which families this is for: the pilot family is Latvian, and
      an English-only chronicle keeps out exactly the grandparents the
      visibility model exists to include. Latvian is in the MVP; the row is a
      working switch (`apps/mobile/src/i18n/lv.ts`). Further languages stay in
      V2 — the difference is that the second language proves the machinery, and
      the tenth only costs translation.
- [x] **Resolved 2026-09-08:** the design's wordmark reads "saime". The product
      keeps the name **FamStory**; the mark is set in the same serif.

### Stage C — a live backend 🔨 *(partly)*

- [x] The Prisma schema validated, the client generated, the SQL migration prepared
- [x] Auth: registration, sign-in, JWT + refresh with rotation and theft detection
- [x] Google/Apple ID token verification against the provider's JWKS
- [x] A global auth guard — authentication is the default, `@Public()` is the exception
- [x] Families, members, child profiles, groups, invitations
- [x] Events with the visibility filter at `where` level
- [x] An audit log for role changes, visibility changes and access to children's data
- [x] AI endpoints (rule-based)
- [x] docker-compose for the local PostgreSQL + Redis environment
- [x] **Migrations run against a live database** — PostgreSQL 18 in WSL Ubuntu; no drift
      between the hand-written migration and the schema
- [x] The comments and reactions module
- [x] Attachment reads behind the visibility check (`modules/media`)
- [x] Editing, deleting (soft) and restoring an event, with the audit entries
- [x] **The app talks to the API.** `EXPO_PUBLIC_API_URL` switches the store
      between `mock.ts` and the server; writes are optimistic with a rollback
      and an error bar. Without the variable the app still runs on mock data
      with no backend at all, which is what design review uses
- [x] File upload in the shape of a presigned S3 PUT, to the server's disk for now (`common/storage`); the S3 driver waits for a bucket
- [x] Reminders delivered by a worker in the API process (not Redis + BullMQ — see `reminders.worker.ts`)
- [x] Notifications, written through the timeline's own visibility filter
- [x] Password reset through the family admin; email waits for a sender
- [x] Nightly backup with a restore check (`tools/lan-host/backup.ps1`)
- [ ] FCM/APNs push
- [ ] Subscriptions (Stripe / App Store / Play Billing)

### Stage D — beta readiness

- [x] Unit tests: visibility, roles, passwords, the HTTP client, categories,
      plans, dates, API mapping, comments, families, events, AI, media, undo,
      onboarding, the photograph rule, motion, prices, editing and deleting an
      event, registration validation, the date picker, the onboarding birthday,
      form messages, dark mode, the refresh, birthdays, the login rate limit,
      the account export and erasure, the request deadline, the Latvian
      dictionary (453 tests: 252 mobile, 201 API)
- [x] ESLint clean; TypeScript strict clean on both sides
- [x] The API smoke test against a live database — 45 checks, real HTTP and real SQL
- [ ] Integration tests inside the test suite (the smoke test runs separately)
- [ ] E2E tests for the main flows (registration → family → event → visibility)
- [ ] A load test (the study's technological risk)
- [ ] Sentry EU
- [ ] GDPR: consent, data export, deletion
- [ ] A legal review of the children's-data design **before** the public launch

---

## 6. Validation KPIs (the beta stage)

| KPI | Target |
|-----|--------|
| Beta families | 50–200 |
| Families with ≥3 events | >50% |
| Events per family per month | 5–10 |
| 7-day retention | >45% |
| 30-day retention | >35–40% |
| Families with >1 active member | >40% |
| Use of the visibility/group features | >25% of active families |
| Free → Premium conversion | 3–7% |
| NPS | >30 |

**The analytics events that measure these KPIs are defined in
`apps/mobile/src/domain/analytics.ts`.** They go into the code straight away,
not after the beta — otherwise there is no data at the month-12 decision point.

---

## 7. Monetisation

| Plan | Price | Contents |
|------|-------|----------|
| Free | EUR 0 | A limited number of events, the basic timeline and calendar, a limited amount of images |
| Premium Monthly | ~EUR 4.50 / month | Unlimited events, more images, extra groups, exports, extended reminders |
| Premium Annual | ~EUR 45 / year | A yearly price with a discount, lower churn |
| AI Add-on (V2) | +EUR 1–3 / month | AI summaries, categorisation, the year in review |
| Memory Print | one-off | A PDF/print family chronicle, a photo book |

**The paywall rule:** Premium appears only once the user **has already
accumulated value** — events, photos, comments, members. Never during onboarding.
The concrete limits: `apps/mobile/src/domain/plans.ts`.

---

## 8. Risks that shape the code and the design

| Risk | Level | What the repo does about it |
|------|-------|------------------------------|
| **Retention below forecast** | Critical | Onboarding with immediate value; reminders; monthly summaries planned for MVP+ |
| **High CAC** | Critical | Referral and invitation links are in the data model from the start |
| **Insufficient differentiation** | Elevated | The timeline, not the calendar, is the home screen. Categories and the archive are visible immediately |
| **Regulation of children's data** | Elevated | A child profile with no account of its own; `managedByMemberId`; the audit log; a viewer role that cannot write |
| **A data security incident** | Critical impact | Encryption, role-based access, the audit log, data minimisation |
| **Vendor lock-in** | Manageable | No Firebase. Our own PostgreSQL schema, migratable |

---

## 9. Budget and infrastructure (from the study)

- MVP development: **EUR 140,000 – 255,000**, planning base **EUR 190,000 – 220,000**
- Cloud infrastructure at the start: **EUR 200 – 1,300 / month** (planning assumption ~EUR 750)
- Technical maintenance: **EUR 3,000 – 8,000 / month**

---

## 10. The next step

**The sequenced version of this is [`08-LAUNCH-PLAN.md`](08-LAUNCH-PLAN.md)** —
what has to be true before families who are not us can use the app, what is
worth building after that, and what it costs. The list below is what was next
when this document was written.

1. Run the app on mock data — see `README.md`
2. Read `docs/04-DESIGN-BRIEF.md` and hand it to Claude Design
3. When the design is ready — rewrite `apps/mobile/src/theme/tokens.ts` and the screen components
4. In parallel — stage C (a live backend)
