# From one family to other people's families

Written 2026-09-22. `00-PLAN.md` says what the product is and where the MVP
boundary runs; `07-IMPROVEMENTS.md` keeps every known defect with its reasoning.
This document answers three different questions that kept getting mixed up:

1. **What has to be true before somebody who is not us can use this** — section 2.
2. **What is worth building** — sections 3 to 5, features, fixes and design.
3. **In what order, and what it costs** — sections 6 and 7.

Sizes are for one person working with an assistant, not for the study's agency
team: **S** ≈ a day, **M** ≈ two to four days, **L** ≈ a week or two, **XL** ≈ a
month or more. They are honest guesses, not commitments.

---

## 0. Where this stands

Working, today, on a laptop in a living room: registration and sign-in, a
family with roles and groups, events with visibility control that is enforced in
SQL, comments, reactions, undo, the calendar, birthdays, search, two languages,
dark mode, an account export and a real account deletion. 453 tests, a smoke
test of 45 checks against a live PostgreSQL, and no lint or type errors.

Not working, and everybody who tries it will find these in the first hour:
photographs do not leave the phone, reminders never arrive, a forgotten
password is permanent, and the whole thing is served by a laptop that somebody
closes at night.

That list is the reason section 2 exists and is first.

**Update, 2026-09-24.** Wave 1 is built as far as it goes without accounts
outside this house: photographs upload (to the server's own disk for now),
an invitation is a link and a QR code, a profile can be edited, the bell
shows real notifications and reminders arrive inside the app, a forgotten
password is reset through the family's admin, and the database and the
photographs are backed up every night with a restore check. 521 tests, a smoke
test of 75 checks. Still true from the list above: nothing reaches a phone
that does not have the app open (push), nothing is sent by email, and it is
still the laptop.

---

## 1. Two launches, and they are not the same project

| | **A. Invited families (web)** | **B. Public launch (app stores)** |
|---|---|---|
| Who | 5–50 families you know, or who know somebody | Anybody |
| How they get it | A link and an invitation code | App Store, Google Play |
| What it runs on | One small server in the EU | The same, plus scale headroom |
| Payments | None — free while it is a beta | Premium, via Apple/Google on mobile and Stripe on the web |
| Legal | A privacy policy, terms, a records-of-processing entry, a DPIA | All of that, plus an entity that can invoice, VAT through OSS, store data declarations |
| Native app | Not needed — the web app works on a phone | Required |
| Realistic distance | **weeks** | **months** |
| Cost | ~EUR 20–40 / month | the same plus EUR 99/year (Apple) and USD 25 once (Google) |

**Do A first, and do not treat it as a rehearsal for B.** Everything in A is
needed by B anyway, and A is the only way to find out whether anyone outside
this house wants the thing before paying for a native build, a company and a
review process.

The study's roadmap puts a public launch at months 12–15 and prices the
infrastructure at ~EUR 750/month. That is an agency building for scale from day
one. Fifty families on one small European VPS is an order of magnitude cheaper
than that, and the difference is worth knowing before anybody budgets from the
study's table.

---

## 2. Before anybody outside this house can use it

Nine things. The first four are not negotiable; the rest are the difference
between a beta and an embarrassment.

### 2.1 It must not run on this laptop — **M**, item 36

A personal machine that sleeps, updates, runs games and gets carried to school
is not a server, and every other item here assumes a machine that is awake.

Concretely: a small VPS in the EU (Hetzner CX22 in Falkenstein or Helsinki,
~EUR 4/month, or Fly.io / Railway if managing a machine is not interesting),
PostgreSQL either on the same box or managed (Supabase Pro at USD 25/month has
a Paris region; a free tier that sleeps after a week is not suitable for this),
Caddy or nginx in front for automatic Let's Encrypt HTTPS, and a domain
(~EUR 12/year). Deployment stays what it is now — build, copy, restart — with a
`docker-compose.yml` that already exists in the repo as a starting point.

What moves with it: `tools/lan-host` becomes a deployment script rather than a
laptop supervisor, `CORS_ORIGINS` gets the real domain, and the rate limiter's
`trust proxy` setting has to match the new proxy (`common/rate-limit.guard.ts`
explains why that is not cosmetic).

### 2.2 Photographs must upload — **L**, items 6, 16, 57

The picker works, the plan limit is enforced, and the file never leaves the
phone. A family memory product whose photographs live on one device is a
demonstration.

Needed: an S3-compatible bucket in the EU (Cloudflare R2 has no egress charges
and costs about USD 1.50/month for 100 GB; Hetzner Storage Box and Backblaze B2
are the alternatives), the presign endpoints that `05-API.md` already specifies,
upload with progress and retry in the composer, a thumbnail pipeline (a 12 MP
phone photograph is 4 MB and the timeline shows twenty of them), and the read
path signed per request so that visibility still means something.

Decide at the same time: what happens when a free family hits its limit, and
whether video is in the beta at all. Video triples the storage bill and the
thumbnail work.

### 2.3 A forgotten password must be recoverable — **M**, item 35

Today it is not. One person forgetting their password loses a family archive,
and there is no support desk to ask.

Needed: a single-use token with an expiry (the refresh-token table is the
pattern), an email to send it through (Resend or Postmark, free at this volume),
two screens, and the same rate limit as sign-in. Verifying the address at
registration belongs in the same piece of work — without it the recovery
address can be a typo nobody notices until it matters.

### 2.4 Something must send the reminders — **L**, items 7, 37

Reminders are stored and nothing delivers them. The calendar is half a product
until they arrive, and the notification is also the thing that brings somebody
back into the app.

Needed: the BullMQ queue that is already a dependency, a Redis to hold it, a
worker that wakes for due reminders, push credentials (FCM is free; APNs needs
the Apple developer account, which also belongs to launch B), and an email
fallback for whoever has not installed anything. Start with three kinds only:
your reminder, somebody added an event, somebody commented on yours.

### 2.5 The data must be backed up, and the backup restored once — **S**, item 34

There is no backup of anything. The first family to lose a year of photographs
to a disk failure is also the last family.

Needed: `pg_dump` nightly to the object store, seven daily and four weekly
copies, the bucket's own versioning on, and — the part everybody skips — one
restore into a scratch database, with the date it was done written down. A
backup nobody has restored is a belief, not a backup.

### 2.6 Somebody has to know when it breaks — **S**, item 9

Right now the app logs to a console nobody reads. Two separate needs: errors
(Sentry's free tier, EU region, or a self-hosted GlitchTip) and product
analytics for the KPIs in `00-PLAN.md` §6 (PostHog EU). The analytics events
already exist in `domain/analytics.ts` and go nowhere.

**Mostly done without an outside service, 2026-09-24** (docs/05-API.md,
Telemetry). The KPI events go to our own API in batches and are kept with no
person in them, behind a switch the server enforces; `npm run kpis` prints the
§6 table. The app's errors — window errors, unhandled rejections, the native
handler and a new root error screen — go to the same API, scrubbed. What is
still open: somebody being *told* (a daily look at `npm run kpis`, or a
hosted tracker with alerts once the server is off the laptop), and the uptime
check below. PostHog or Sentry can still be added later; nothing here needs an
account today.

Add an uptime check that texts somebody — a free Uptime Kuma on the same VPS, or
any of the hosted pingers.

### 2.7 The paperwork — **M**, and some of it is not ours to write

This product holds children's data, which is the category a regulator looks at
first. `06-PRIVACY-GDPR.md` has the analysis; what is missing is the documents.

- A **privacy policy** and **terms of service**, in Latvian and English, that
  match what the code actually does (the export and the deletion do now).
- A **record of processing activities** (Art. 30) — a document, not code.
- A **DPIA** — with children's data it is very likely mandatory rather than
  advisable.
- **Data processing agreements** with every processor: the host, the object
  store, the email sender, the push provider, the error tracker, the analytics.
- An **age rule** for who may create an account, and how a parent's consent for
  a child profile is recorded. The GDPR default is 16, member states may lower
  it to 13, and Latvia is one of the states that did — but this specific
  question deserves a lawyer rather than a paragraph in a repository document.
- A **breach procedure**: who is told within 72 hours, and how.

Budget a lawyer's afternoon for the policy and the DPIA review. It is the
cheapest insurance on this list.

### 2.8 A way in that a grandmother can follow — **M**, items 38, 55

An invitation is currently a code to type on a screen nobody has open yet.
Needed: a link that opens the app or the web build with the code in it, a QR
code beside it for the same code, and an email invitation with both. This is
also the growth loop: every family that invites four people is the entire
marketing plan for launch A.

### 2.9 What launch A actually costs

| | Monthly | Notes |
|---|---|---|
| VPS (2 vCPU, 4 GB) | EUR 4–8 | Hetzner, EU |
| Managed PostgreSQL | EUR 0–25 | Free on the VPS if you own the backups |
| Object storage, 100 GB | EUR 1–4 | Cloudflare R2 / B2 / Hetzner |
| Redis (queue) | EUR 0–5 | Same VPS is fine at this size |
| Email | EUR 0 | Free tiers cover a beta |
| Error tracking + analytics | EUR 0 | Free tiers, EU regions |
| Domain | ~EUR 1 | EUR 12/year |
| **Total** | **~EUR 10–45 / month** | plus the laptop staying switched off |

Launch B adds EUR 99/year for Apple, USD 25 once for Google, and the 15–30% cut
Apple and Google take on Premium sold inside a mobile app — which is the reason
the web app is worth keeping even after the native one ships.

---

## 3. Features worth building

Ordered within each group by what would change the outcome, not by cost. The
item numbers point at `07-IMPROVEMENTS.md`.

### 3.1 Keeping people coming back

This is the risk the study rates **critical**, and the one an app with no
notifications cannot fight at all.

| Feature | Size | Why |
|---|---|---|
| Push, and the three notifications above (2.4) | L | The only thing that reaches somebody who is not in the app |
| **What changed since you last looked** (53) | S | A line in the timeline and a count on the tab; the refresh already knows |
| **A question a week** (52) | M | A prompt — "Where did you live when you were ten?" — whose answer becomes an entry. It is how a chronicle gets the stories nobody would otherwise write down, aimed at the invited relative who never posts |
| **Monthly and yearly recap** (10) | M | "Your September, in nine photographs." Rule-based, no model needed |
| "On this day" ✅ | — | Done. Worth a push notification once push exists |

### 3.2 Getting in, and bringing others

| Feature | Size | Why |
|---|---|---|
| Invitation links and QR (38, 55) | M | See 2.8 |
| **A guest link to one event** | M | View-only, expiring, no account: the grandmother who will never install anything still sees the birthday. Also the cheapest growth loop there is |
| Email invitations | S | Needs the mail sender from 2.3 |
| Referral counting | S | The data model already carries invitations; this is analytics on top |

### 3.3 What goes into an event

| Feature | Size | Why |
|---|---|---|
| Photo upload (2.2) | L | The product |
| Several photos with captions | M | A memory is usually more than one frame |
| **Voice notes** ✅ | M | A grandparent will talk for four minutes and never type four sentences. Fits "the family story that stays" better than any other input. **Built 2026-09-25, with dictation** (docs/07 item 68); needs https, which the LAN address is not |
| Video | M | After photographs, and it costs storage |
| **A wish list per person** (51) | S | A list on a profile that the person it belongs to cannot see. The visibility model already does exactly this and nothing uses it |
| Better search | S | Filter by person, year and tag; the screen exists |

### 3.4 The calendar, and the logistics half of family life

| Feature | Size | Why |
|---|---|---|
| **Recurring events** | L | A weekly practice is currently thirty rows. The schema has no recurrence at all — this is the largest single gap in the data model |
| **A calendar feed** (54) | S | One signed URL returning `text/calendar` and the family's events appear in whatever calendar they already use. Nine tenths of "Google Calendar integration" for a fraction of it |
| Conflict detection, extended | S | The rule-based check exists; it should cover people, not just times |
| Shared to-do or "who collects the children" | M | Cozi's territory. Do it only if beta families ask — the differentiator is the chronicle, not the chore list |

### 3.5 The family, and time passing

| Feature | Size | Why |
|---|---|---|
| **Edit your own profile** (29) | S | You cannot change your own name or photograph after onboarding. Embarrassing, small |
| **In memoriam** (56) | M | A chronicle outlives people. The birthday strip will otherwise announce a dead grandmother's birthday to her children |
| A child becoming an account holder (19) | L | The open question from `06-PRIVACY-GDPR.md`, legal before technical |
| More than one family | M | The data model supports it; the UI assumes one |

### 3.6 Premium, when there is something to sell

| Feature | Size | Why |
|---|---|---|
| **The printed chronicle** (PDF, and later a book) | L | The one thing a family would actually pay for, and the study's "Memory Print" line |
| Stripe on the web | M | Outside Apple's and Google's cut |
| Apple / Google in-app purchase | M | Mandatory for digital goods inside a mobile app |
| Gifting a year to a parent | S | The natural purchase in this product is by an adult child for their parents |

Not before the beta. The paywall rule in `00-PLAN.md` — Premium appears only
after the family has accumulated something worth keeping — is worth defending.

### 3.7 AI, kept small and in the EU

The MVP's "AI" is rules, deliberately: no data leaves, nothing surprises
anybody, and the study rates overestimating AI as a risk. Keep it that way for
the beta. Afterwards, in order: automatic tagging from words already typed (S),
the yearly recap's text (M), and only then anything involving a model — with a
processor agreement, EU hosting, and a switch a family can turn off.

### 3.8 Deliberately not building

Worth writing down so it stops coming back:

- **Offline reading.** The family's data is not cached on the device on
  purpose — a removed member would keep a copy of everything.
- **Streaks, badges, engagement games.** This is a family archive; a guilt
  mechanic is the wrong instinct entirely.
- **A public or social layer.** No feeds, no discovery, no sharing outward
  beyond a deliberate guest link.
- **Ads, ever.** It is in the privacy note on the welcome screen.

---

## 4. Improvements — correctness, robustness, debt

| Item | Size | What and why |
|---|---|---|
| Password reset (35) | M | See 2.3 |
| Backups (34) | S | See 2.5 |
| Analytics sink (9) | S | ✅ First-party, 2026-09-24 — see 2.6 |
| **Shared domain package** (11) | M | Visibility and plan rules exist twice, in the app and the API, and have already drifted. One package, imported by both |
| **Integration and end-to-end tests** (12) | M | 453 unit tests and one smoke script. The seam between app and API is tested by hand, which is where the last three bugs lived |
| Duplicate pending invitation (28) | S | One invitation shows as two |
| Attachment URL endpoint (16) | S | Falls out of 2.2 |
| gzip / brotli on the web build (44) | S | A 4 MB bundle on a phone over mobile data |
| Accessibility pass | M | Screen-reader labels are done in places; a full pass with the reader on, plus dynamic type and a contrast audit in both themes |
| Performance pass | M | List virtualisation, thumbnail sizes, and the cost of the first load |
| English date order (42) | S | Latvian is right now; whether English should read "26 September" is a decision |

---

## 5. Design

The screens exist and are consistent. What is missing is not decoration — it is
the four places where the product currently looks like software rather than a
family's book.

### 5.1 The five design jobs

1. **The desktop and tablet layout (39) — L.** On a computer the phone layout is
   stretched across the window: line lengths nobody can read and a tab bar the
   width of a monitor. The web build is what a beta family will open first, on a
   laptop. This needs a real second layout — a centred column, the timeline in
   two columns past a breakpoint, and the tab bar becoming a side rail.
2. **The type scale for the people who are actually reading it (43) — S.**
   Chips, tab labels and badges are 12 px in a product whose audience explicitly
   includes grandparents. The brief says 15 px minimum for body text. Re-check
   the whole scale against a 68-year-old's phone, not a designer's.
3. **The mark and the first screen (40) — M.** The welcome screen still carries
   a placeholder. It is the first impression, the App Store screenshot, and the
   thing an invited relative sees before they trust the product with their
   grandchildren's photographs.
4. **Empty states with a next action (41) — S.** "On this day" shows an empty
   square for a memory without a photograph; several screens say nothing when
   they are empty. Every empty state should say what to do next.
5. **The photograph, made the point — M.** The card hierarchy in the brief says
   the picture is the tile. Once uploads exist, the timeline should be laid out
   for photographs at real sizes: full-bleed cards, a proper aspect ratio, and a
   grid view for a month.

### 5.2 Decisions still open

- **Iconography.** Still Ionicons behind a semantic map. Either commit to it or
  pick a set — but a swap is one file (`components/ui/icon.tsx`), so it is not
  urgent.
- **Category colours.** Ten hues that have to be distinguishable at 5 px and in
  dark mode. Worth a proper audit, or fewer categories.
- **The motion character** is written down and implemented; it needs a pass on a
  real phone rather than in a browser.

### 5.3 What launch needs that does not exist yet

An app icon, a splash screen, store screenshots (six per platform, per device
size), a short store description in two languages, and a one-page website that
explains the product and links to the privacy policy. **M**, and it is usually
underestimated.

---

## 6. The order I would do it in

### Wave 0 — get it off the laptop (a week or two)

2.1 the server, 2.5 backups, 2.6 error tracking and analytics, 44 compression.
**Done means:** the app answers on its own domain over HTTPS, the laptop can be
switched off, a backup has been restored once, and a crash reaches somebody.

### Wave 1 — the four things a stranger would hit in the first hour (three to four weeks)

2.2 photographs, 2.3 password reset and email verification, 2.4 reminders and
push, 2.8 invitation links and QR. Plus two small ones that make the product
feel finished: profile editing (29) and "what changed since you last looked"
(53).
**Done means:** a family you do not live with can sign up, invite each other,
put photographs in, and be reminded of something — without you in the room.

### Wave 2 — the beta itself (a month, mostly not coding)

The paperwork (2.7), five to ten invited families, a feedback channel that a
human reads, and the KPIs from `00-PLAN.md` §6 actually being measured. Build
only what the families ask for; the backlog will be wrong in ways this document
cannot predict.
**Decision point:** does anybody open it in week three without being asked? If
not, nothing further on this list matters yet.

### Wave 3 — the things that make it worth keeping (two to three months)

Recurring events, the calendar feed, the weekly question, the recap, the wish
list, in memoriam, the guest link, and the design work in section 5. Then, and
only then, Premium and the printed chronicle.

### Wave 4 — the public launch

Native builds, store accounts, review, in-app purchase, an entity that can
invoice, VAT through OSS, and the store assets. Months, and the decision to
start it belongs after Wave 2's answer.

---

## 7. What could stop this

| | Why it would stop |
|---|---|
| **Nobody comes back** | The critical risk in the study, and the reason Wave 2 is a decision point rather than a milestone |
| **The paperwork** | Children's data with no DPIA is not a launch, it is a liability |
| **Storage cost** | Photographs are the product and the bill. Thumbnails, limits and a free-tier cap are a design decision, not an optimisation |
| **One person** | Every estimate here assumes attention that a school year competes for. The order above is chosen so that stopping after any wave leaves something that works |
