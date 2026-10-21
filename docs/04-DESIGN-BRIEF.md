# Design brief — FamStory

> **Hand this file to the designer.** Everything else is already built: the
> screens work, navigation works, there is real data.

---

## 1. Where this stands

The design was delivered as `Fam Track.fig` (exported 2026-08-27) and is being
implemented. Direction **"saite — 01 · minimal"**, tagline *"Moments, tied
together"*. The file also carries a second direction (`02 · playful` — "saime",
Coral/Honey/Leaf/Berry, Fredoka + Nunito) which the screens do not use, and a
Research page of competitor screenshots.

**The brand page, reproduced exactly:**

| | |
|---|---|
| Ink | `#17160F` |
| Paper | `#F4F1EA` |
| Evergreen | `#234E42` |
| Jade | `#3DBB8C` |
| Stone | `#A8A296` |
| Display | Fraunces |
| Interface | Inter — "set quietly with generous spacing" |

**Two places the implementation departs from the file, both deliberate:**

- **A second grey.** Stone on Paper is 2.25:1 — below AA, and unreadable for the
  grandparents this product is explicitly for. The screens themselves use a
  darker grey (`#6E6A61`) wherever text has to be read, so Stone stays
  decorative and that darker grey became `textMuted`.
- **A dark palette.** The file's dark screens belong to an earlier blue-accent
  exploration, so dark mode is derived from the same five swatches — Ink as the
  ground, Paper as the text, Jade taking over from Evergreen, which is too dark
  to carry a button on a dark ground. The Profile screen has a Dark mode row, so
  the surface is intended even though it was not drawn.

**Done:** palette, both faces, the centre "+", audience filters, relative
timeline sections, `custom` visibility with a live reach count, photo-carrying
calendar days, tags, the Profile row list, onboarding.

**A third departure, in onboarding.** The file carries a user-flow diagram whose
Onboarding node reads "create / join family · first run" — no screens were
drawn. So the four steps were built in the design's own vocabulary (Paper, one
question per screen, Inter for the titles, the primary pinned to the bottom) and
one device was added that the file does not contain: a step counter, written out
in words above a four-segment rule. The rule alone would be decoration, and this
app is read by grandparents.

**How a photograph meets the card, also not in the file.** Decided and written
down as `media` in `tokens.ts`: it bleeds to the card's edges — the plate on the
page, not an illustration set into it — and it **keeps its own shape** instead
of being cropped into a fixed band. Cropping a portrait of a child to a
letterbox damages the one thing the family came to keep. Two different limits,
for two different reasons: in the timeline a cover is square at the tallest
(a chronicle is read by running down it, and one 4:5 photograph with a title and
a description fills two-thirds of a phone), and once opened it keeps its own
shape down to 4:5 (nothing to scan past — the photograph is the content). Both
are capped at 16:9. Opened, one photograph takes the full width; several become
a strip of one height where each keeps its own shape.

The "On this day" rail is the deliberate exception: those tiles stay a fixed
height, because a rail of uneven tiles is not a rail.

**Still open:** iconography — still Ionicons behind a semantic map, and the
recommendation in [`00-PLAN.md`](00-PLAN.md) is to leave it there. Motion is
written down in section 7.

**Two questions the design raised, both now answered (2026-09-08):** the Profile
shows "Language — Latviešu" — the product stays **English-only** for the MVP and
multi-language remains a V2 item, so that row reads "English". And the welcome
screen's wordmark reads "saime" — the product keeps the name **FamStory**, set
in the same serif.

---

## 2. What this product is

**FamStory is a family life management and memory platform.**

The family — not the individual user — is the centre of the system. Events are
saved with a date, a description, photos, participants, a category and
**visibility control**: for every event you decide who in the family can see it.

### What it is NOT

| Not | Why that matters for design |
|-----|-----------------------------|
| A family calendar | If the home screen looks like a grid, the product competes with Cozi and loses |
| A photo album | Pictures are part of an event, not the content in themselves |
| A productivity tool | No checkbox aesthetic, no "productivity blue", no dashboards |
| A social network | No like counts as status, nothing public, no infinite feed |
| A children's app | The user is a parent aged 25–45. No cartoons, no bubbly rounded graphics |

The feasibility study rates "insufficient differentiation" as an **elevated
market risk**. The visual language is the first place that risk is either
removed or confirmed.

---

## 3. What the product feels like

Three things that should land from the first screen:

**1. It lasts.** What is written here will still be readable in fifteen years.
It is not a feed that scrolls away. It is a chronicle. → Visually: substance,
not lightness. Materiality. Not "trendy 2026 gradient".

**2. It is closed.** Family only. No strangers, no algorithm, no ads.
→ Visually: warmth and privacy. Not corporate, not public.

**3. It is simple.** Grandparents use it too. → Visually: large type, high
contrast, obvious actions. No hidden gestures, no unlabelled icons.

---

## 4. Concrete requirements

### Colour

- A full light palette and a full dark palette. Dark mode is not optional —
  a lot of this app is used in the evening once the children are asleep.
- Text contrast >= 4.5:1, large text >= 3:1. No exceptions.
- **Ten category tones** (`categoryTone` in `tokens.ts`). They appear as a chip
  on every card and as dots in the calendar, so they must be:
  distinguishable side by side, legible at 5px, and coherent as a set.
  Tone keys: `growth`, `learn`, `landmark`, `care`, `joy`, `journey`,
  `routine`, `task`, `money`, `neutral`.

### Typography

- Nine levels: `display`, `title`, `cardTitle`, `heading`, `read`, `body`,
  `caption`, `button`, `label`. Fraunces carries `title` and `cardTitle` — an
  event's own words — and nothing else. Everything structural is Inter.
- Body copy must not go below 15px.
- If a custom face is introduced, load it in `app/_layout.tsx` via `expo-font`
  and record it in the `tokens.ts` typography block.

### Photographs

`media` in `tokens.ts` — a photograph keeps its own shape between two limits
that differ by where it is shown. The reasoning is in section 1; the numbers are
in the token, and `lib/media.ts` is the only place that applies them.

### Icons

Currently Ionicons behind a semantic map. Swap the set for anything — but a swap
should only touch `icon.tsx`, never the screens. An icon must never be the only
carrier of meaning: a label or an accessibility label is required.

### Touch targets

48×48 minimum. This is `size.touchTarget` in `tokens.ts` and it must not shrink —
grandparents are in the audience.

---

## 5. Screen priority

If time is short, design in this order:

| # | Screen | File | Why |
|---|--------|------|-----|
| 1 | **Timeline** | `app/(tabs)/index.tsx` + `components/event/event-card.tsx` | The home screen. This is where the product either reads as a chronicle or as a list |
| 2 | **Event composer** | `app/event/new.tsx` | The most important flow. Should feel like a note, not a form |
| 3 | **Visibility picker** | `components/event/pickers.tsx` → `VisibilityPickerSheet` | The differentiator. Every option must show its CONSEQUENCE, not just its name |
| 4 | **Event detail** | `app/event/[id].tsx` | Where a memory is consumed |
| 5 | **Welcome** | `app/(auth)/welcome.tsx` | First impression, App Store screenshot |
| 6 | **Calendar** | `app/(tabs)/calendar.tsx` + `components/calendar/month-grid.tsx` | Second most-used |
| 7 | **Family** | `app/(tabs)/family.tsx` | Roles, groups, invitations |
| 8 | **Paywall** | `app/premium.tsx` | Monetisation |
| 9 | The rest | settings, notifications, search | Consistency |

Three elements were added after the first screen pass and have no visual
language yet — they are plain and waiting:

| Element | File | What it is |
|---------|------|------------|
| **"On this day"** | `components/event/on-this-day.tsx` | A strip above the timeline showing the same day in earlier years. Must not read as a timeline card |
| **Undo bar** | `components/ui/feedback.tsx` → `UndoBar` | Appears after a delete, over any screen. Above the tab bar, never covering it |
| **Photo row** | `app/event/new.tsx` | Picked photos with a remove button and a plan counter |

Full screen-by-screen spec with states: [`03-SCREENS.md`](03-SCREENS.md).

There is also a design canvas in `../design/` — eight screens drawn in one
direction ("the family chronicle"), two alternative directions with an honest
for and against, and the token system as a single board. It is a proposal, not a
constraint: take it, argue with it, or ignore it.

---

## 6. Card hierarchy — do not change

The timeline card (`event-card.tsx`) has this order, and the order is a product
decision, not a design choice:

```
1. Photo (if any)          — the emotional hook
2. Category chip + time    — context
3. Title                   — what happened
4. Description (2 lines)   — the story
5. Participant avatars     — who
6. Visibility badge        — who can see it        <- must not disappear
7. Reactions + comments    — engagement
```

**The visibility badge is always visible, with no tap.** If the user does not
know who can see an event, privacy control does not exist — even when it
technically works.

---

## 7. Motion

**The character in one sentence: nothing announces itself.** Motion answers a
finger and carries you between places. It never celebrates. This is a chronicle
— it should feel like paper being turned, not like an app pleased with itself.

The numbers live in `theme/tokens.ts` under `motion`. `lib/motion.ts` is the
only file that turns them into curves and durations, and
`components/ui/touchable.tsx` is the only pressable in the app — which is what
makes the rules below hold everywhere instead of on the screens someone
remembered.

### Three speeds

| Speed | ms | What moves at it |
|-------|----|------------------|
| `fast` | 150 | The answer to a touch. A control that lags behind the finger feels broken. |
| `normal` | 240 | Anything arriving or leaving — a screen, a sheet, a released press. |
| `slow` | 380 | A photograph fading in once it has decoded. It is the content, not chrome. |

### Four rules

1. **Press down snaps, release eases.** Pressing is the user's action and has to
   be immediate. Releasing is the app letting go, and letting go abruptly is
   what makes an interface feel brittle.
2. **How far a thing gives depends on what it is.** A card is a surface and
   barely moves (1.5%). A row has no surface of its own, so dimming is its whole
   signal. The round buttons give 6%, because at 56px anything less does not
   read. The table is `motion.press`; a screen picks a name from it, never a
   number.
3. **One direction per gesture.** Forward slides in from the right and Back
   reverses exactly that. The composer and the paywall rise from the bottom:
   they interrupt rather than continue.
4. **Only content photographs fade in** — an event's cover, the hero on an
   opened event, the "On this day" tiles. Not avatars, not the calendar grid,
   not the thumbnails you have just picked. Thirty small pictures fading at once
   is a flicker, not calm.

### Reduced motion is not a slower version

iOS "Reduce Motion", Android "Remove animations" and `prefers-reduced-motion` on
the web all arrive as `useReducedMotion()`. When it is on, durations become
**zero** and nothing translates or scales. Opacity still changes — a control
that answers nothing at all reads as broken rather than as calm.

---

## 8. What to work against

The app already runs on real mock data — the Berg family — with all the edge
cases deliberately included:

- an event with 3 photos, with 1 photo, with none
- a long title that wraps to two lines
- events visible to the whole family / parents only / one person / the author only
- a milestone next to an ordinary day
- two events on the same day (calendar density)
- an empty state (sign out, then "Create account")

Run it:

```bash
npm --prefix apps/mobile run web
```

Sign in with any button on the welcome screen — authentication is mocked.

---

## 9. What not to do

- ❌ Do not put colours or sizes directly in screens — only in `tokens.ts`
- ❌ Do not delete `categoryTone` keys — they come from `domain/categories.ts`
- ❌ Do not leave dark mode half-done — every light token needs a dark one
- ❌ Do not reduce `size.touchTarget` below 48
- ❌ Do not move the visibility badge "under the three dots"
- ❌ Do not add a celebratory animation on save — this is a note, not an achievement
- ❌ Do not animate anything without going through `Touchable` or `lib/motion.ts` —
  a hand-rolled animation is one that forgets reduced motion

---

## 10. When the design is ready

1. `tokens.ts` rewritten with the real palette and typography
2. Components in `components/ui/` and `components/event/` styled
3. `npm --prefix apps/mobile run typecheck` passes
4. The app has been run in both light and dark mode and on a narrow screen
5. Tick off Stage B in [`00-PLAN.md`](00-PLAN.md)
