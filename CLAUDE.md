# FamStory — rules for Claude sessions

## Language

Documentation, code comments and code identifiers — **English**.

**UI text is English and Latvian.** English is the reference dictionary
(`apps/mobile/src/i18n/strings.ts`); Latvian (`lv.ts`) is typed as
`typeof strings`, so a key added to one and not the other stops the build.
Never add a string to only one of them.

The switch is reactive, and the way it is made reactive is load-bearing: the
locale lives in a store (`data/locale.ts`) and `t()` reads it synchronously,
because `t()` is also called from places that cannot hold a hook — date
formatting, error mapping, the category names. What re-renders the screens is
the root: `app/_layout.tsx` keys the tree on the locale, so a change mounts a
fresh tree and every memoised `t()` runs again (React Compiler memoises it as a
pure call, so a plain re-render is not enough).

The rule that follows: **never call `t()` at module level.** A constant built at
import time keeps the language it was imported in. `i18n.test.ts` parses the
source and fails if one appears.

Latvian counts differently: a number ending in 1 — but not 11 — takes the
singular, and zero takes the genitive. `lv.ts` has the helpers; use them rather
than writing the rule again.

## Before writing code

1. `docs/00-PLAN.md` — what is inside the MVP boundary and what is not
2. `docs/02-DATA-MODEL.md` — the canonical data specification

If the code and `02-DATA-MODEL.md` disagree, **the document is right**.

## Rules that must not be broken

**Visibility.** Every path that reads events goes through the visibility check.
On the server — `VisibilityService.eventFilter()` at the Prisma `where` level,
not while processing the response. On the client — `canSee()`, but only for UX;
a client-side check is not a security boundary.

**Fail closed.** An unknown state means "do not show". Never the other way round.
Deleting a group makes events private, not public.

**Children's data.** `role = 'child'` → no account of their own,
`managedByMemberId` required. An event with a child among the participants is
visible to Parents only by default. Every access to a child's data writes an
`AuditLog` entry.

**Design goes through tokens.** No screen contains a hardcoded colour or size.
Everything through `useTheme()`. The single source of colour is
`apps/mobile/src/theme/tokens.ts`.

**AI suggests, it never acts.** The AI never performs anything automatically.
Always a banner with "Accept" and "No thanks". The legal reasoning is in
`docs/06-PRIVACY-GDPR.md`.

**Analytics events go in immediately.** Every new flow that touches a KPI
(`docs/00-PLAN.md`, section 6) gets its `track()` call in the same commit.
Without them there will be no data at the month-12 decision point.

## The MVP boundary

The study flags exceeding the MVP scope as an elevated financial risk.

Before adding a feature — check section 2 of `docs/00-PLAN.md`. If it is on the
MVP+ or V2 list, it is **not** built now.

Explicitly out of bounds: geolocation, chat, household accounting, AI
prediction, broad external integrations.

## After a change

```bash
npm --prefix apps/mobile run typecheck
```

Text lives in `apps/mobile/src/i18n/strings.ts`. TypeScript derives the key
union from that file, so a typo in a `t()` call is a compile error rather than a
blank label at runtime.

## Where things are

| You need | File |
|----------|------|
| Colours, fonts, spacing | `apps/mobile/src/theme/tokens.ts` |
| Visibility logic (client) | `apps/mobile/src/domain/visibility.ts` |
| Visibility logic (server) | `apps/api/src/modules/visibility/visibility.service.ts` |
| The data model | `apps/api/prisma/schema.prisma` |
| Mock data | `apps/mobile/src/data/mock.ts` |
| State and actions | `apps/mobile/src/data/store.ts` |
| Session and drafts on disk | `apps/mobile/src/data/persist.ts` |
| Text | `apps/mobile/src/i18n/strings.ts` |
| Dates, week start | `apps/mobile/src/lib/date.ts` |

## Two things that look optional and are not

**Persisted state is credentials.** Tokens go in `expo-secure-store`, never in a
plain key-value store, and never anything else on the device: the family and its
events come from the server on every launch. Caching them locally would leave a
removed member holding a copy of everything.

**Deleting holds.** `deleteEvent` keeps the event and its comments so undo can
put them back unchanged — same id, same comments. A new id would silently orphan
every reaction and notification pointing at it. `signOut` must clear that buffer;
it is still family data.
