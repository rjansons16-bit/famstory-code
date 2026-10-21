# Screen specification

Every screen is built and runs on mock data. This document says **what each
screen has to do** and **which states it must cover** — so design does not
forget the empty, error and restricted-role views.

Paths are relative to `apps/mobile/src/app/`.

---

## Authentication

Which of the two comes first depends on how FamStory was opened (`app/index.tsx`):
as an app - a phone build, the web app installed, the phone view's app - on the
sign-in, the way apps open; in a browser on the welcome page, which is also what
a search finds.

### `(auth)/welcome.tsx` — Welcome
The browser's front door, and the only screen where the product explains itself:
the mark, one sentence and the privacy promise, two ways in (**Get started**,
**I already have an account**), what a family keeps here, and **Get FamStory** -
installing it from the browser on a computer (a button where the browser can,
the steps where it cannot) and on a phone; the stores later.

**States:** default · loading after a button press · installable here · installed

### `(auth)/sign-in.tsx` — Email sign-in
Email and password. Below them, **"No account yet? Create account"** — the only
route into onboarding. Opened as an app it is the front door itself: the mark and
the name above the form, the language at the top, nothing to go back to. On the
demo the sample family's address is filled in and no password is asked for.

**States:** empty · filled · invalid email · loading · server error

---

## Onboarding

Reached by tapping "Create account" on the sign-in screen. A new account starts
with no family, which is what sends the user here.

Five steps, and the head of every screen says which one you are on — in words as
well as in the segmented rule, because a shape may never be the only carrier of
meaning (`components/onboarding/step-header.tsx`).

```
about-you ──> interests ──> family-choice ──┬── create-family ──> people ──> first-event ──> timeline
                                            └── join-family ─────────────────────────────────> timeline
```

Somebody who arrived with an invitation link goes from `interests` straight to
`join-family`.

### `(onboarding)/about-you.tsx` — Step 1
One field: the name the family will see. It is written to the session before the
family exists and lands on the member row when the family is created.

With a real provider this arrives from the Google/Apple profile and the field is
prefilled.

**States:** empty (Next disabled) · filled

### `(onboarding)/interests.tsx` — Step 2. **Skippable.**
"What do you like?" — twenty chips from a fixed list (`domain/interests.ts`), at
most twelve; the count under them says why a thirteenth does nothing. The
subtitle says the family sees it and that it helps them find a present. Kept in
`pendingProfile` until the family exists, like the birthday.

**States:** nothing chosen (the button reads "Skip for now") · some chosen ·
twelve chosen

### `(onboarding)/family-choice.tsx` — Step 3
Two cards: create a family / join a family. The branches part here and do not
rejoin.

### `(onboarding)/create-family.tsx` — Step 3
One field — the family name. Also creates the three system groups
(Parents, Children, Grandparents).

### `(onboarding)/join-family.tsx` — the join branch, and the end of it
Invitation code. Uppercase, autocorrect off. **No step counter:** the family
being joined already has its people and its chronicle, so there is nothing left
to ask, and a counter would promise steps that never arrive.

### `(onboarding)/people.tsx` — Step 4. **Skippable.**
Two different acts, kept apart:

| | What happens | Result |
|---|---|---|
| **Add a child** | Nothing is sent anywhere | A member with `role: child`, `userId: null`, `managedByMemberId` set, placed in the Children group |
| **Invite an adult** | An invitation with a code | A pending invitation; they sign in as themselves |

Roles offered for an invitation are `member` and `viewer` only — `child` is the
other button, and `admin` is not something to hand out before the family exists.

The list above the buttons grows as the screen is used. It is the only feedback
that an invitation went anywhere. Empty, it is a line of text and not a card: an
empty white slab above two white buttons reads as a third button.

> KPI link: "families with more than one active member >40%". That is why this
> step is in onboarding. But forcing an invite puts people off, so "Skip" is
> equally visible.

**States:** only you · children added · invitations pending · both

### `(onboarding)/first-event.tsx` — Step 5. **Skippable.**
Title, date, category. Not the composer: photos, participants, reminders, tags,
milestones and the visibility sheet all stay in `event/new.tsx`. A first-run
screen asking seven questions is how a chronicle turns back into paperwork.

Everything else takes a default, and one of them is stated on screen rather than
asked: the event is visible to the whole family, and the screen says so above
the Save button. The other two are all-day (the only time question a memory
needs is which day) and no participants (at this point the family is usually
just you).

> KPI link: "families with 3 or more events >50%". A family that leaves
> onboarding with an empty timeline mostly never comes back to fill it.

**States:** empty (Save disabled) · filled · skipped

---

## Main tabs

### `(tabs)/index.tsx` — Timeline ⭐ home screen
A chronological stream grouped by **how recent** — Coming up · Today ·
Yesterday · Earlier this month · then by month name. "Today" is how a person
remembers; "September 2026" is how an archive is filed.

Filters are an **audience**: All · Mine · one chip per group. In the header: the
family name, search, notifications (with a dot when unread). The "+" sits in the
middle of the tab bar, not as a floating button.

A card's photograph bleeds to the card's edges and keeps its own shape, square
at the tallest (`media.card` in `tokens.ts`).

Above the stream, **"On this day"** — a horizontal strip of events from the same
calendar day in earlier years (`components/event/on-this-day.tsx`).

> It must NOT look like a timeline card. A card there reads as a new event and
> breaks the chronology. The year gap is the message — "1 year ago" carries the
> feeling, the date does not.

**States:**
- with events (mock: 13 visible to Anna)
- **empty** — icon, headline, explanation, "Add an event" button
- filtered with no results
- viewer's view (a grandparent sees fewer events; no "+" button)
- "On this day" with one entry, with several, and absent (it renders nothing
  when there is no anniversary — an empty strip would be a daily reminder of
  absence)
- a **special day** within a week (Mother's Day, Midsummer...) — one card,
  opening `special-day/[key]`
- **gift ideas** for the nearest birthday in the next two weeks that is not
  your own — one card, opening that person's page; never for a child's profile

### `(tabs)/calendar.tsx` — Calendar
Month grid (always 6 weeks so the height never jumps) plus the selected day's
list. The dots under a date carry the **category colour**, three maximum.

A special day has its own mark in the cell's top-left corner (a birthday's is
top-right) and a row at the head of the day's list, opening its page.

**States:** day with events · empty day · dense day (3+) · days from other months ·
a special day

### `(tabs)/family.tsx` — Family
Members with role badges · invitations sent · groups.

**States:** admin (sees "Invite", "New group") · member · viewer (no management)

### `(tabs)/profile.tsx` — Profile
Avatar, name, role · stats (events, milestones) · plan bar · links to settings.

**States:** free with a usage bar · free near the limit (bar in the warning
colour at >=80%) · premium

---

## Events

### `event/new.tsx` — Event composer ⭐ the most important flow
Order follows user flow 3 in the study:
title → description → date → category → participants → photos → **visibility** →
reminder → milestone.

**Also the edit screen.** `?edit=<id>` prefills every field, changes the header
to "Edit event", skips the AI suggestion, and saves in place instead of creating
a new event. One composer, two modes — a separate edit screen would drift out of
sync the first time a field was added.

Photos are picked with the system picker and appear as a horizontal row of
thumbnails, each with a remove button, under a counter showing how many of the
plan's allowance are used.

**States:**
- empty (save disabled)
- with the AI category suggestion (type "birthday" and the banner appears)
- with a child among the participants → visibility narrows to "Parents"
- free limit reached → save opens the paywall
- edit mode (prefilled, no suggestion banner)
- **draft restored** — a banner saying so, with "Discard". Restoring text
  silently would read as the app typing by itself
- **photos picked** — one thumbnail, several, and at the plan limit (the button
  then opens the paywall)

### `event/[id].tsx` — Event detail
Category and milestone mark · title · time · visibility · photographs ·
description · participants · reminder · reactions · comments · comment input.

One photograph takes the full width at its own shape; several become a strip of
one height where each still keeps its own shape (`media.detail` in `tokens.ts`).

**States:**
- one photograph · several · a portrait among landscapes · none
- text only, no comments
- the author's view (sees edit and delete)
- a viewer's view (no editing, can comment)
- a child's view (no comment input — the role does not allow it)

### Pickers — `components/event/pickers.tsx`

| Sheet | What it does |
|-------|--------------|
| `DatePickerSheet` | Month grid plus hour and minute chips. Time is hidden for an all-day event |
| `CategoryPickerSheet` | A grid of the ten category chips |
| `ParticipantPickerSheet` | Active members with checkmarks |
| `VisibilityPickerSheet` ⭐ | Four options; groups and people expand in place; a warning when a child is among the participants |

---

## Family management

### `family/invite.tsx`
Email (optional) · role · groups · three ways to send (email / link / code).
After sending, the code appears in large type.

### `family/groups.tsx`
Group list with member avatars. System groups carry a shield icon and cannot be
deleted. A sheet for creating a new group.

### `family/member/[id].tsx`
Profile · role · groups · **what they like** · stats · wish list · **gift
ideas** · role change (with permission) · removal.

What they like: chips. Yourself — "Change" opens your profile; a child's
profile — the adult who manages it (or an admin) changes them in place; anybody
else only reads them, and with nothing chosen the section is not there.

Gift ideas (`components/family/gift-ideas.tsx`): on everybody's page but your
own, not for a child's profile to act on. Each idea says where it came from
(their interests, the family's entries, their age) and has two presses: "I'll get
this" — onto the wish list, claimed — and the cart, a web search for the words.

**States:** child profile (shows who manages it) · adult · yourself (no "remove",
no gift ideas) · a birthday within two weeks (the ideas say so) · nothing
chosen (ideas from entries, age, or ones that suit anybody)

### `special-day/[key].tsx`
One of the family's days: its name and date, how far off, a line about it,
three ideas, and — on a day with presents — whose pages to look at. Christmas
Eve's first idea opens the wish lists, New Year's Eve's the year in a minute.

**States:** a day with presents (Mother's Day, Christmas Eve...) · a day
without (18 November) · an unknown key (nothing to show)

---

## The rest

### `notifications.tsx`
A list with an icon per kind. A dot on unread ones. A conflict notification is
shown in the danger tone. "Mark all" in the header.

**States:** with notifications · empty · all read

### `search.tsx`
Text search plus a category filter. Results as compact rows.

**States:** empty query · with results · no results

### `premium.tsx` — Paywall
Benefit list · the yearly plan as the default with a saving badge · the monthly
plan · CTA.

> It appears **only** in response to an action that hit a limit, or from the
> profile. Never during onboarding.

### `settings/index.tsx`
Notification switches · privacy statement · data export · account deletion.

> There is no language switch: the app is English-only in the MVP, and
> multi-language sits in V2. See `apps/mobile/src/i18n/index.ts` for the
> requirement whoever adds it has to meet.

---

## Summary for design

| Category | Count |
|----------|-------|
| Screens | 18 |
| Sheet components | 5 |
| UI primitives | 14 (`components/ui/`) |
| Domain components | 4 (`components/event/`, `components/calendar/`) |
| Category tones | 10 |
| Role badges | 4 |
| Empty states | 4 |

### Components added after the first pass

| Component | Where | Note |
|-----------|-------|------|
| `event/on-this-day.tsx` | Timeline header | Horizontal strip, not a card |
| `ui/feedback.tsx` → `UndoBar` | Root layout, over every screen | Sits above the tab bar, never over it |
| Photo row | Composer | Thumbnails + remove + plan counter |
