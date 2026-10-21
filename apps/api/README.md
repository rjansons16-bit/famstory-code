# FamStory API

NestJS + Prisma + PostgreSQL. A modular monolith.

---

## Running it

A PostgreSQL is needed. `docker compose up -d` is the intended way:

```bash
docker compose up -d
```

If Docker will not start (it does not on this machine), Postgres in WSL works
just as well — install once, then start it whenever you need the database:

```bash
wsl -d Ubuntu -u root -- service postgresql start
```

> WSL shuts a distro down as soon as nothing holds it open, and that takes
> Postgres with it. Hold it open while you work — `wsl -d Ubuntu -- sleep 3600`
> in another window — or start the service again before each run.
>
> Use `127.0.0.1` and not `localhost` in `DATABASE_URL`: on Windows `localhost`
> resolves to IPv6 first, and the WSL relay only forwards the IPv4 bind.

```bash
npm --prefix apps/api install && cp apps/api/.env.example apps/api/.env
```

```bash
npm --prefix apps/api run prisma:migrate && npm --prefix apps/api run prisma:seed
```

```bash
npm --prefix apps/api run dev
```

Put a real `JWT_SECRET` in `.env` before starting — the server crashes on
purpose if the default is still there.

### Checks

```bash
npm --prefix apps/api run typecheck && npm --prefix apps/api test
```

The smoke test against a live server — real HTTP, real SQL, no mocks:

```bash
npm --prefix apps/api run smoke
```

It walks the whole chain: registration → family → child profile → invitation →
events with different visibility → the check that a viewer does not see the
parents' events, neither in the list nor by requesting the id directly.

---

## What is built

| Module | Contents |
|--------|----------|
| `identity` | Registration, sign-in, JWT + refresh with rotation and theft detection, Google/Apple ID token verification against JWKS, a global auth guard |
| `families` | Families, members, child profiles, system and custom groups, invitations |
| `events` | Events with the visibility filter, plan limits, visibility changes with an audit log |
| `comments` | Comments and reactions — every path goes through the event visibility check |
| `ai` | Category suggestion, schedule conflicts, reminder time (rule-based) |
| `visibility` | The visibility WHERE builder, role capabilities, the safe default for children |
| `common` | The Prisma connection, the audit log with IP hashing |

**Data model:** `prisma/schema.prisma` — 19 models with indexes and a comment on
every decision. The initial migration is prepared:
`prisma/migrations/00000000000000_init/`.

## What still has to be built

`media` (presigned S3 upload, thumbnails) · `notifications` (BullMQ reminder
queue, FCM/APNs) · `subscription` (Stripe / App Store / Play Billing) ·
`export` (PDF/ZIP family chronicle)

---

## Two rules that must not be broken

**1. No path that reads events goes around `VisibilityService`.**

The filter is applied at the Prisma `where` level, not while processing the
response. Filtering in the response leaks the existence of hidden events through
the pagination counters.

**2. Authentication is the default.**

`JwtAuthGuard` is registered globally. Public endpoints are marked explicitly
with `@Public()`. The other way round — a guard only where we remember to put
one — means a forgotten decorator opens data silently.

Full specification: [`docs/02-DATA-MODEL.md`](../../docs/02-DATA-MODEL.md) ·
[`docs/05-API.md`](../../docs/05-API.md)

---

## Seed data

`prisma/seed.ts` creates the Berg family — the same data as the mobile app's
mock layer. If the app connects to the API and a screen looks different from the
mock version, that difference is a bug, not data.

Accounts (password `FamStory2026!`):

| Email | Role |
|-------|------|
| `anna.berg@example.com` | administrator |
| `martin.berg@example.com` | family member |
| `vera.berg@example.com` | viewer |

Vera is the living visibility test: she must see the school concert and the
birthday, but must **not** see the meeting with the school counsellor or Anna's
private notes.
