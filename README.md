> **A published copy of FamStory's code** (2026-10-21). The demo: https://rjansons16-bit.github.io/
>
> Publicēta FamStory koda kopija. Demo: https://rjansons16-bit.github.io/

# FamStory

A family life management and memory platform. The family — not the individual
user — is the centre of the system.

Based on *A technical and economic feasibility study for the development of the
FamStory mobile application*.

> **Paused on 2026-10-13.** Where it stands, and where to start again:
> [`docs/13-PAUSED.md`](docs/13-PAUSED.md).

---

## Run the app

The app has **two backends**, and which one it uses is one environment variable.

### On mock data — nothing else needed

```bash
npm --prefix apps/mobile install
```

```bash
npm --prefix apps/mobile run web
```

It opens at `http://localhost:8081`. Sign in with any button on the welcome
screen: with no server configured, authentication is mocked. Inside, the Berg
family is waiting with 13 events that cover every edge case.

This is the mode design review runs on, and it is deliberate rather than a
fallback — nobody should need PostgreSQL to look at a screen.

On a phone: `npm --prefix apps/mobile start`, then Expo Go and the QR code.

### Against the real server

Point the app at an API and the same actions talk to it. For a web build served
to other devices, use a **relative** address:

```bash
echo 'EXPO_PUBLIC_API_URL="/v1"' > apps/mobile/.env
```

`/v1` means "wherever this page came from", so the bundle carries no IP address
and survives the router handing this machine a new one. A native build has no
page to be relative to and needs an absolute URL instead. Expo inlines
`EXPO_PUBLIC_*` at build time, so changing it needs a rebuild.

Google and Apple say they need a native build rather than pretending; email works
end to end.

### For other computers and phones on the same network

```powershell
powershell -ExecutionPolicy Bypass -File tools\lan-host\install.ps1
```

A scheduled task keeps the database, the API and the web build up from logon,
restarts whatever falls over, and serves everything on one port — the page, with
`/v1` passed through to the API. Other devices open `http://<this machine>:8081`.
Next to it, `:8090` serves the same app on the sample Berg family, and `/phone`
on either shows the app inside a phone frame for looking at it from a computer.
What it does not survive, and why: [`tools/lan-host/README.md`](tools/lan-host/README.md).

---

## Status

| Part | Status |
|------|--------|
| Plan, architecture, data model | ✅ done |
| Mobile app — 18 screens, navigation, mock data | ✅ works |
| Visibility and role logic | ✅ implemented on both sides |
| Latvian and English (UI); code and docs in English | ✅ A switch on the Profile screen; the dictionaries are type-checked against each other |
| **Visual design** | ✅ Every screen the delivered `.fig` draws, plus a written motion character. Iconography is the one thing left open. See [`docs/04-DESIGN-BRIEF.md`](docs/04-DESIGN-BRIEF.md) |
| Backend — auth, families, events, AI | ✅ built and compiles |
| Backend against a live database | ✅ PostgreSQL 18 in WSL; migrations applied, seeded, **smoke test 156/156** |
| **The app talks to the API** | ✅ registration, family, events, comments and reactions verified end to end against PostgreSQL |
| Tests | ✅ **1,057 green** (492 mobile, 565 API), plus 10 that read the live API through the app's own client (`npm --prefix apps/mobile run test:integration`); smoke 156/156. Checks that press through the running app: [`tools/checks`](tools/checks/README.md) |
| Lint + types | ✅ clean on both sides |
| Photos | ✅ upload, thumbnails, signed links — on the server's disk until there is a bucket |
| Notifications and reminders | ✅ in the app, and on phones by push once the keys exist (below) |
| Backups | ✅ nightly, with a restore check (`tools/lan-host/backup.ps1`) |
| Voice notes and dictation | ✅ recorded in the browser and, with expo-audio, in the phone app; kept with the event. Dictation through the browser, with a notice. In a browser they need https or localhost - not the plain LAN address |
| Usage counts and error reports | ✅ first-party, no person in them, a switch in the profile; `npm --prefix apps/api run kpis` |
| Keepsakes | ✅ time capsules, birthday surprises written in secret, a grandparent's life story, heirloom QR stickers, growing up, traditions, the year as a one-minute film ([items 75-82](docs/07-IMPROVEMENTS.md)) |
| Gift ideas and the family's days | ✅ onboarding asks what you like (a pick from twenty, never free text); gift ideas on everybody else's page, worked out on the device, taken onto the wish list with one press; Mother's Day, Midsummer, Christmas Eve and nine more on the timeline, the calendar and in the bell three days ahead ([items 91-92](docs/07-IMPROVEMENTS.md)) |
| Installable, and findable | ✅ the web app installs as an app of its own on a computer or a phone (Chrome, Edge, Safari) - on https or localhost; only the welcome page is open to a search engine. Being found on Google waits for the domain and Search Console ([`tools/deploy/README.md`](tools/deploy/README.md), "Being found") |
| A server of its own | ⬜ the kit is ready ([`tools/deploy/`](tools/deploy/README.md)); needs a VPS and a domain |
| Push, payments, password links by email | ✅ in the code: pushes straight to Apple and Google with nothing the family wrote in them, Premium through the stores and RevenueCat, reset links by SMTP. ⬜ Live once the accounts exist ([`docs/12-LAUNCH-RUNBOOK.md`](docs/12-LAUNCH-RUNBOOK.md)) |

---

## Documents

| # | File | For |
|---|------|-----|
| 00 | [Plan](docs/00-PLAN.md) | The MVP boundary, phases, KPIs, risks, budget |
| 01 | [Architecture](docs/01-ARCHITECTURE.md) | The stack, and why exactly this one |
| 02 | [Data model](docs/02-DATA-MODEL.md) | Entities, visibility, roles — **the canonical specification** |
| 03 | [Screens](docs/03-SCREENS.md) | Every screen and its states |
| 04 | [**Design brief**](docs/04-DESIGN-BRIEF.md) | 👉 Hand this one to Claude Design |
| 05 | [API](docs/05-API.md) | The endpoint contract |
| 06 | [Privacy and GDPR](docs/06-PRIVACY-GDPR.md) | Children's data, the requirement list |
| 07 | [Improvements](docs/07-IMPROVEMENTS.md) | A ranked list of what to fix and build next |
| 08 | [Launch plan](docs/08-LAUNCH-PLAN.md) | What has to exist before other families can use it, what to build, and in what order |
| 09 | [App stores](docs/09-APP-STORES.md) | What the App Store and Google Play ask, and the owner's decisions for them |
| 10 | [The company](docs/10-COMPANY.md) | The SIA behind the app: why, the 2026 numbers, the order of steps |
| 11 | [Marketing](docs/11-MARKETING.md) | How an app like this gets found; videos and press texts in `docs/marketing/` |
| 12 | [**Launch runbook**](docs/12-LAUNCH-RUNBOOK.md) | 👉 Every step from the day the company exists to the stores |
| 13 | [**Paused**](docs/13-PAUSED.md) | 👉 Where it stands at the pause, and where to start again |

---

## Structure

```
famstory/
├── docs/                 the plan and the specifications
├── apps/
│   ├── mobile/           Expo + TypeScript  ← works
│   └── api/              NestJS + Prisma    ← skeleton
└── packages/             reserved for shared code
```

Inside the mobile app:

```
apps/mobile/src/
├── app/            expo-router routes — 18 screens
├── components/     ui/ · event/ · calendar/
├── data/           store.ts (zustand) · mock.ts
├── domain/         types · visibility · categories · plans · analytics
├── i18n/           strings.ts
├── lib/            date.ts
└── theme/          tokens.ts  ← THE DESIGN HANDOFF FILE
```

---

## Three things not to break

**1. The timeline is the home screen, not the calendar.**
The study rates "insufficient differentiation" as an elevated market risk. If the
product looks like a calendar, it competes with Cozi and loses.

**2. The visibility badge is on every card.**
Privacy control that is not visible does not exist — even when it technically
works.

**3. Fail closed.**
An unknown visibility means "do not show". Deleting a group makes events private,
not public. A child among the participants narrows visibility automatically.

---

## Checks

```bash
npm --prefix apps/mobile run typecheck && npm --prefix apps/mobile test
```

```bash
npm --prefix apps/api run typecheck && npm --prefix apps/api test
```

## The backend with a live database

```bash
docker compose up -d
```

```bash
npm --prefix apps/api install && npm --prefix apps/api run prisma:migrate && npm --prefix apps/api run dev
```

### If PostgreSQL lives in WSL instead of Docker

Two things bite, and neither is obvious from the error:

**The listener.** WSL2 forwards the host's `127.0.0.1` to a guest service only
when that service is bound to all interfaces. A default Debian PostgreSQL
listens on `localhost` *inside the distro*, which is a different address — so
`nest start` dies with Prisma `P1001` while `pg_isready` inside WSL says
everything is fine. Set `listen_addresses = '*'` in
`/etc/postgresql/<version>/main/postgresql.conf` and add one `pg_hba.conf` line
for the famstory database and user from the WSL subnet only.

**The idle timeout.** WSL shuts the distro down when nothing holds it open, and
PostgreSQL goes with it. Everything works, you look away for a minute, and the
next request is `ECONNREFUSED`. Hold it open for the length of a session:

```bash
wsl -d Ubuntu -- sleep 7200
```

Then the end-to-end check, which needs the API running in another window:

```bash
npm --prefix apps/api run smoke
```
