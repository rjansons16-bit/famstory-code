# Improvements

Written after a full pass through every screen and every function in the running
app. Ordered by what would actually change the outcome of the project, not by
how easy each item is.

**The numbers are stable ids, so the order below is not numerical.** Items move
between sections as they are done; the number stays with the item so a
conversation about "item 11" still means the same thing next month.

Fixed items keep their full reasoning rather than being deleted. The point of
this document is not the checklist — it is why each thing mattered.

Legend: ✅ done · ⚠️ partly done, with the gap named · no mark: open.

---

## Done

### 1. The language switch did nothing ✅

Settings offered Latvian / English. Tapping either changed no text at all.

The locale lived in a module-level `let current` with a `setLocale()` function.
React never learned the value changed — and with React Compiler enabled
(`app.json` → `experiments.reactCompiler`), `t('some.key')` is memoised as a pure
call and never re-evaluates.

**Fix:** the app is English-only for the MVP, which is also where the plan puts
multi-language (V2). The `t` / `tf` API stays locale-shaped so a second language
is a mechanical change, and `src/i18n/index.ts` now carries the requirement in
writing: **a language switch has to be reactive** — put the locale in the store
and read it through a hook.

**Superseded on 2026-09-21 by item 50.** The switch is real now, and the
language is Latvian. The requirement above turned out to be half right: the
locale does belong in the store, but a hook cannot be the whole answer.

### 2. Onboarding was unreachable ✅

Four screens — choose, create family, join family, invite — existed and worked
when opened directly, but no user path reached them. `signIn()` always set
`onboardingComplete: true`.

**Fix:** `signIn(method, { newUser: true })` signs in with no family, and the
sign-in screen now has **"No account yet? Create account"** as the route in.

### 3. The edit button was inert ✅

Event detail rendered an edit button with no `onPress`, and there was no edit
screen at all — while `event.edit_own` was a capability the roles already granted.

**Fix:** `?edit=<id>` turns the composer into the edit screen — prefilled, header
changes, AI suggestion skipped, plan limit not counted, saves in place. One
composer in two modes; a separate screen would have drifted apart at the first
new field.

---

### 4. The visibility filter had never executed a single SQL query ✅

This was the most important item on the list.

`VisibilityService.eventFilter()` is the core of the product and its riskiest
code. The unit tests check the **shape** of the Prisma `where` object; they do
not check what PostgreSQL does with it. Until that ran against a live database,
"privacy control works" was an assumption, not a fact.

**Now done.** PostgreSQL 18 runs in WSL Ubuntu (Docker Desktop still does not
start on this machine, so the database was installed directly instead). The
migration applied with **no drift** from the schema, the seed loaded, and
`apps/api/test/smoke.ts` passes **30 of 30** against real HTTP and real SQL —
including the two checks that matter: a viewer does not see a parents-only event
in the list, and gets 403 when requesting its id directly.

The generated SQL was inspected as well. All four OR branches reach PostgreSQL —
author, family, groups (`EXISTS` against `EventVisibility.groupId`), members
(`EXISTS` against `EventVisibility.memberId`) — and `private` is absent, which is
what makes it fail closed. Of 7 events in the family, the viewer's query returns 4.

Running it again needs the database up first (WSL shuts the distro down when
nothing holds it open):

```bash
wsl -d Ubuntu -u root -- service postgresql start
```

That line is necessary and, as of 2026-09-09, no longer sufficient — see item 30.

### 5. Nothing survived an app restart ✅

The user was signed out every time they killed the app.

**Now done.** `src/data/persist.ts` stores the session in `expo-secure-store` —
the iOS Keychain and the Android encrypted store, because a token is a
credential and not a preference. The root layout rehydrates before anything
decides where to navigate; without that gate the router redirects to the welcome
screen for one frame and the user is bounced out of the app they were signed
into.

On web there is no secure storage, so `localStorage` is the fallback. That is
acceptable only because web is the design and development target — the plan
ships iOS and Android. If web ever ships, tokens have to move to an httpOnly
cookie.

What is deliberately NOT cached: the family and its events. Those come from the
server on every launch. Caching them on the device would leave a removed member
holding a copy of everything.

### 6. Photos — picking works, uploading does not ✅

Core MVP item 6 says "photos and video". The composer used to answer the photo
button with an alert.

**The picking** was written first: `expo-image-picker` runs, the chosen images
appear immediately, the plan limit is enforced (and opens the paywall when
reached), each photo has a remove button, and a counter shows how many of the
allowance are used.

**Done, 2026-09-22.** Three steps in the shape a presigned S3 upload has — ask
where to put it, PUT the bytes there, confirm — with the bytes landing on the
server's own disk under `MEDIA_ROOT` rather than in a bucket, because the
server is a machine in this house and a bucket is a credit card away.
`common/storage` is the seam: the client code is the same code that will PUT to
a bucket, and the S3 driver is one file when there is one to point at.

The two endpoints that carry bytes take no session token, exactly as a
presigned URL does not — they are authorised by a signature naming one id or
one key plus an expiry, minted only after an authenticated request has passed
the visibility check.

The server makes the thumbnail (480px, orientation applied), because the
phone's copy is the one thing it cannot check and a timeline of twenty 4 MB
photographs is the difference between a product that opens and one that does
not. A format it cannot decode completes without one and falls back to the
original rather than losing the upload.

Video is still refused: its thumbnail needs a frame, which needs ffmpeg.

### 8. "On this day" ✅

**Now done.** A horizontal strip at the top of the timeline showing the same
calendar day in an earlier year. It turns the archive from something you store
into something that visits you — and it was the cheapest answer on this list to
the study's critical retention risk: no new table, no endpoint, no notification
infrastructure.

Details worth keeping:
- It runs through the same `canSee()` as everything else. A hidden event does
  not become visible because it has an anniversary.
- It renders only when there is something to show. A daily "nothing happened on
  this day" would be a reminder of absence.
- It appears only on the unfiltered timeline; under "Milestones" or "Mine" it
  would contradict the filter the user just chose.
- 29 February returns only on a leap year, never folded onto 1 March — moving
  somebody's memory to a day it did not happen on is worse than silence.
- `mock.ts` carries two anniversary events computed from today, so the state is
  visible on any day of the year rather than on one.

### 20. `Alert.alert` was a silent no-op on web ✅

Found while verifying the undo bar in the browser. React Native Web does not
implement `Alert` — no warning, no fallback, nothing happens. Every confirmation
written with it was a dead button on the web build, **including "delete event"**.

That mattered more than it sounds: the web build is what design and review run
against, so a flow that only worked on a device was a flow nobody would look at
until the beta.

**Fixed** with `src/lib/dialog.ts` — `confirm()` and `notify()`, promise-based on
both platforms so the callback/synchronous difference never reaches a call site.

The same session turned up a second one: the undo bar was painted above the
navigator but not hit-testable, so tapping "Undo" fell through to the card behind
it and opened an event instead. An explicit `zIndex` fixed it. Visible and
clickable are two different things on react-native-web.

### 22. "Coming up" listed the furthest-away event first ✅

The timeline sorts newest first, which is right for a chronicle and exactly
wrong for the one section that looks forward. "Coming up" opened three weeks
out and counted backwards towards tomorrow — so the thing most likely to need
doing sat at the bottom of the section.

**Fix:** `timelineSection` now says whether a section is in the future, and the
timeline reverses that one bucket. The flag rather than a string comparison on
the section key: a screen should not have to know that `'0-upcoming'` means
something.

### 23. Two screens counted the same group differently ✅

The Family tab said "Grandparents · 2 members" over a group the Groups screen
drew with one face in it. Both were reading the same `memberIds`; the Groups
screen resolved them through the member list and kept only active people, while
the Family tab counted the raw ids — and an invited person is in a group before
they are in the family.

**Fix:** the count resolves the same way the list does. Worth noting that the
symptom was cosmetic and the cause was not: two screens answering "who is in
this group" with different code is the same shape of bug as two screens
answering "who can see this event".

### 24. Four buttons a screen reader could not name ✅

The reactions under an event carry an icon and a number and nothing else, so
`accessibilityLabel` was the only thing that could name them. Without it they
announced as "button, 1" — on the screen where a family says the only thing it
came to say.

The "…" button next to it was announced as **"Edit"**, which is one of the two
things inside the menu it opens, not what the button does.

**Fix:** both named. The reaction label carries the count with it, so the
button reads "Love · 2" rather than leaving the number to be found separately.

### 25. Labels that still shouted ✅

`SectionHeader` and six hand-written labels still rendered in capitals — "PLAN",
"SETTINGS", "NOTIFICATIONS", "GROUPS", "PARENTS". The design sets every label in
sentence case, and the composer had already been brought over; these were the
screens the design does not draw, so nothing forced the question.

One of them was worse than shouting: the label above the role chooser on the
invite screen read **"Family member"** — the name of one of the options, used as
the heading for choosing between them. It now reads "Role".

### 26. The price was written with a Latvian keyboard ✅

The paywall printed `4,50 €`: a comma decimal and a trailing symbol, produced by
`.toFixed(2).replace('.', ',')`. The interface is English and its dates are
formatted with the en-US locale, so the money disagreed with everything around
it.

**Fix:** `formatPrice()` in `domain/plans.ts`, and it does not use
`Intl.NumberFormat` — that would make the output depend on the ICU data the
engine happens to carry, so a test could pass in Node while the device printed
something else. When a second language lands, this reads the locale from the
store like everything else.

### 27. The reminder was a row of chips in a screen of fields ✅

The composer had been rewritten as the design draws it — the event type and the
date are fields holding the current answer — and the reminder was left as six
pills in a horizontal scroll, the shape the whole screen had moved away from.

**Fix:** a `SelectBox` and a `ReminderPickerSheet`, like the other two.

### 21. The app had never talked to the API ✅

`api.ts` was written, typed against `docs/05-API.md` and covered by tests, and
**nothing imported it**. Every screen read `mock.ts` through the store. The two
halves of this project had never met, and every assumption at the seam was
unverified.

**Now done.** `src/data/backend.ts` is the switch, and it is one environment
variable:

```
EXPO_PUBLIC_API_URL="http://192.168.120.231:3000/v1"
```

Unset, the app behaves exactly as it did — mock data, no database, every screen
works. That is not a fallback to apologise for; it is what design review and the
browser build run on, and the plan lists it as a deliverable. Set, the same
actions talk to the server.

**What the seam turned out to hide.** Three things the app does had no endpoint
behind them, which is the real reason this had never been finished: editing an
event, deleting one, and undoing the delete. They are now on the server, with
the audit entries and the soft delete that undo needs — see the API commit and
item 16's neighbours in `05-API.md`. A fourth, reactions, needed only a verb:
the client was sending `PATCH` where the server had always offered `PUT`.

**How a write behaves.** The local state changes first and the request follows.
A family app is used on a phone on a train, and waiting for a round trip before
a tapped heart turns red would make the product feel broken on exactly the
connection it will mostly meet. When the server refuses, the change is rolled
back and an error bar says why — mounted at the root next to the undo bar, and
for the same reason: the write may have happened on a screen the user has
already left.

Three things are deliberately **not** optimistic, because everything after them
depends on ids the server makes: signing in, creating the family, accepting an
invitation. Those await.

**What is still mock-shaped when live:**

- **Notifications are empty.** There is no endpoint and no table — `Notification`
  is not in `schema.prisma`. Mock rows against a real family would be a lie, so
  the screen is honestly empty until the model exists.
- **Google and Apple sign-in say they are unavailable** rather than pretending.
  They need an id token from a native SDK, which a web build cannot produce.
- **Photos are still local URIs** (item 6). Nothing was going to fix that here.

### 30. The database could not be reached from the Windows side ✅

`apps/api/.env` pointed at `127.0.0.1:5432` and PostgreSQL in WSL was listening
on `127.0.0.1` **inside the distro** — which, in the default NAT networking
mode, is not the same address. `nest start` died on boot with Prisma `P1001`.

**Fixed on the machine**, not in the repo, because the fix is a listener:

- `listen_addresses = '*'` in `/etc/postgresql/18/main/postgresql.conf`. WSL2
  forwards the host's `127.0.0.1` to a guest service only when that service is
  bound to all interfaces, which is why `localhost` was not enough — and why
  `DATABASE_URL` still gets to stay `127.0.0.1`.
- One `pg_hba.conf` line for the **famstory database and user only**, from the
  WSL subnet only. Tighter than the default `all all 127.0.0.1/32` it joins.

Both files were backed up as `*.famstory.bak` first.

**The part that is not a config change and will bite again:** WSL shuts the
distro down when nothing holds it open, and Postgres goes with it. Symptom:
everything works, you look away for a minute, and the next request is
`ECONNREFUSED`. Hold it open for the length of a session with

```bash
wsl -d Ubuntu -- sleep 7200
```

or raise `vmIdleTimeout` in `%USERPROFILE%\.wslconfig`.

### 31. Every adult's birthday was dropped during onboarding ✅

"About you" asks for a birthday, and it is the first screen after registering —
before any family exists. `updateMyProfile` wrote the birthday onto the member
list, which for a new account is empty, and neither `POST /families` nor
`POST /invitations/{code}/accept` had a field to carry it. The picker worked,
the field showed the date, and the value was gone by the next screen. The
photograph went the same way. The name never did, because it lives on the
account.

**Now:** the store keeps both in `pendingProfile` until a member row exists;
creating and joining send `birthDate`, and the server writes it onto the new
row (checked first: `invalid_birth_date` for a string that is not a date, a
date in the future, or a year before 1900). The photo stays on the device, as it
does everywhere until uploads exist (item 6).

Still true: a birthday cannot be **changed** after onboarding — that is item 29.

### 32. The date picker and four buttons that said nothing ✅

A first-time user reported both in one sentence.

**The date picker** was the calendar tab's month grid inside a sheet. Its cells
were a share of the width, so in a browser on a computer six weeks grew taller
than the window and Done went off the bottom. It also showed the calendar's
"memory / reminder" legend, ringed a made-up default date as if already chosen,
and reached 1970 one "previous year" press at a time. It is now its own control
(`components/calendar/date-picker.tsx`): days, months and years behind one
heading, one fixed height, a birthday variant that opens on the years and
refuses the future, and sheets capped at `size.sheetMaxWidth` on wide screens.

**The buttons.** About you, the family name, the invitation code and both
event composers disabled their button until a length rule was met and said
nothing else — so a one-letter name looked like a Continue button that had
stopped working. The same defect the sign-in screen had. They stay pressable
now and the press puts the rule under the field (`lib/form.ts`). Creating and
joining a family also stopped moving on to the next screen when the server had
refused.

### 33. Dark mode could not be switched, and the tab labels were cut off ✅

**Dark mode.** The Profile screen had a Dark mode row that read "Follows your
device" with nothing to press — deliberately, because a switch that is not
reactive state does nothing, which is how the language switch once shipped.
It is a real switch now. The choice lives in its own store
(`data/appearance.ts`) and is kept on the device; `hooks/use-color-scheme` —
the only thing the theme reads — resolves it against the device, so every
screen changes at once. The switch shows the theme the app is in; once flipped
it holds regardless of the phone, and "Follow the device again" sits under it
until it is used. On the web the choice is read before the first render, and
during hydration it reads as "follow the device", the same way the device's
own scheme already did, so the pre-rendered HTML still matches.

**The tab bar** kept the navigator's default height of 49 — iOS's height for a
10px label. Ours is 12px on a 16px line, and the 10px left for it cut the lower
half off "Timeline", "Calendar", "Family" and "Profile" on every phone size. The
bar is `size.tabBar` (58) plus the bottom inset now.

### 45. The screen never showed what anybody else had added ✅

The snapshot was read once, at launch, and never again. Everything this device
did appeared immediately — writes are applied locally — so the app looked right
to whoever was holding it, while a photograph somebody else added an hour ago
simply was not there. Closing the app and opening it again was the only way to
see it, which on a shared family timeline is the whole product.

The mechanism already existed: `store.refresh()` reads the whole snapshot and
ran exactly once, from `hydrate()`. What it lacked was a trigger.

**Fix:** two triggers, because they are two questions. Pulling down on the
timeline, the calendar, the family screen or the notifications is "is there
anything new?" asked deliberately. Coming back to the app is the same question
asked by having put the phone down, so it refetches only past a minute of
staleness — a trip to the camera and back costs nothing. `syncNow()` wraps
`refresh()` with one request for two callers, a refusal that lands in the
banner instead of an unhandled rejection, and the timestamp the foreground
check reads. A failed refresh keeps what is on screen: rows from an hour ago
that a person can read beat an empty screen that is technically up to date.

### 46. Birthdays were collected and never mentioned ✅

Onboarding asks every adult for a birthday (item 31) and every child profile
carries one. The app did nothing with them: the date sat on a profile page,
which you only open if you already remembered. A family calendar that knows
everybody's birthday and never says so is worse than a paper calendar with
pencil marks on it.

**Fix:** three places, from one derived list (`domain/birthdays.ts`) — the next
month's birthdays at the top of the timeline with the days left, a gift mark on
the calendar day, and the person with the age they reach under that day next to
its events. Derived rather than stored: a birthday is a fact about a person
that repeats, so it is computed from the member list wherever it is shown, and
cannot drift, be deleted by accident, or need a migration when recurring events
arrive.

29 February is decided the opposite way from memories, deliberately. A memory
must not move — a photograph taken on 29 February did not happen on 1 March
(`isAnniversaryOfToday`). A birthday must not disappear, so it is celebrated on
the 28th rather than skipped three years out of four.

**Still open:** recurrence proper. An event that repeats — a weekly practice, a
name day somebody types in — is still a single row with a single date.

### 47. Passwords could be guessed at, forever ✅

`POST /v1/auth/email/login` took guesses as fast as they arrived, with no limit
of any kind. Two things followed, and the second is easy to miss: a password
can be guessed, and every guess costs the server ~100 ms of scrypt — the cost
that makes the hashing safe — so a few hundred requests a second is also a way
to take the machine down. On this deployment the machine is a laptop in a
living room.

**Fix:** counted per address *and* per account (`common/rate-limit.guard.ts`).
Per address alone leaves one account open to a botnet; per account alone lets
one address spray a family's worth of addresses. Sign-in allows 10 per address
per 5 minutes and 5 per account per 15; registration 5 an hour; a provider
token 20 per 5 minutes; refresh 120. Attempts count whether they succeed or
fail, because the CPU does not care about the outcome — but a correct password
forgives the account's window, so somebody who mistypes three times and then
gets it right is not left three attempts from a lockout.

The address had to become real first: every request arrives through the static
server on the same machine, so the API saw `127.0.0.1` for the whole house, and
so did the audit log. The proxy sets `X-Forwarded-For` — overwriting, since it
is the edge — and Express trusts that header from loopback only.

In-memory fixed windows rather than Redis: this protects one process on one
machine, and needing a second service to be running in order to have any
protection at all is how protection ends up switched off. Moving it when the
API runs on more than one node is one file.

### 48. "Export my data" and "Delete account" were dialogs saying "later" ✅

Neither did anything, and neither is a feature: access (Art. 15), portability
(Art. 20) and erasure (Art. 17) are obligations, and this product holds
children's data.

**Export.** `GET /v1/users/me/data-export` returns the account as a JSON
download — profile, family profiles, and the events, comments, reactions and
invitations this person wrote. Other people appear only as a display name on an
event they were in; their addresses and birthdays are theirs to export, not
this user's. Photographs are listed by storage key rather than embedded, which
is also what a later ZIP will walk. Free on every plan: the row used to send a
free user to the paywall, which is the one thing `06-PRIVACY-GDPR.md` forbids
by name.

**Deletion.** `DELETE /v1/users/me` revokes every session, drops every push
token and marks the account; `AccountPurge` erases it 30 days later. Member
rows keep their place in the family's chronicle with the person stripped out of
them — "Former member", no face, no birthday, no account — because deleting the
row would take the family's own events and comments with it. A family with
nobody left who can sign in is closed, not shredded.

The grace period is not hedging: this is a family's only copy of years of
photographs, deleted from a phone, possibly by somebody upset, and there is no
support desk behind this product. Signing in during those 30 days brings the
account back, and a wrong password never restores anything.

### 49. A request that was never answered was waited on forever ✅

`fetch` had no deadline. A phone that loses signal mid-request left a spinner
turning over nothing, and from the outside that is indistinguishable from slow,
so the person waits and then closes the app. The other half was the wording: a
failed connection rejects with the engine's own sentence — "Failed to fetch",
"Network request failed" — and that string went straight into the banner.

**Fix:** fifteen seconds, after which the request fails like anything else, and
a connection that never became a response becomes an `ApiError` with status 0
and a code the UI already knows how to phrase. An `AbortController` with a
timer rather than `AbortSignal.timeout`, which is not in every engine this app
runs on and would have thrown on the first request instead of the first
timeout.

### 50. The app spoke only English ✅

Item 1 was closed by removing the switch, because multi-language sat in V2.
That was a decision about scale applied to a pilot family that is Latvian: a
grandmother invited into a family chronicle does not read "Coming up", and the
person the visibility model exists to include is the person least likely to
read a foreign interface.

**Fix:** a full Latvian dictionary (`i18n/lv.ts`), typed as `typeof strings` so
a key added to one language and forgotten in the other stops the build, and a
switch on the Profile screen where each language names itself — "Latviešu", not
"Latvian", because whoever needs that row cannot read the language it is
currently in.

**How it is made reactive**, since the last attempt shipped dead. The note item
1 left behind prescribed a `useT()` hook. That cannot be the whole answer:
`t()` is also called from date formatting, error mapping and the category
names, none of which can hold a hook, so half the app's text would have had to
move first. Instead the locale lives in a store — the part of the old note that
was right — `t()` reads it synchronously so it works from anywhere, and the
root keys the tree on the language: switching mounts a fresh tree, so every
call React Compiler memoised is computed again.

That leaves exactly one way to break it: `t()` at module level, which keeps the
language it was imported in. A test parses every source file and fails if a
call is found outside a function.

Latvian counts differently — a number ending in 1, but not 11, takes the
singular, and zero takes the genitive — so two helpers do it once, and the
tests pin 1, 11, 21 and 0 rather than the numbers that happen to work.

---

## Tier 1 — blocking the beta

### 7. Reminders are stored but nothing sends them ✅ *(push: item 119)*

Core MVP item 11, and it is the retention mechanism. The schema has `Reminder`
with a `scheduledFor` index built for exactly this query. Missing: the BullMQ
worker and FCM/APNs.

**Half done, 2026-09-23.** A worker in the API process (`reminders.worker.ts`)
wakes once a minute and turns every reminder that has come due into a
notification in the bell — for its targets, or its author. A timer rather than
BullMQ and Redis, because a reminder that only fires if a second service
happens to be running is a reminder that will not fire. Each one is claimed
with a conditional update before it is sent, so two runs cannot both send it,
and one that comes due more than six hours after its event started is dropped:
"in one hour" about yesterday's appointment is worse than nothing.

**Still blocked: push.** A reminder that arrives only when somebody opens the
app is a list, not a reminder. FCM needs a Firebase project and APNs an Apple
developer account — neither can be created from here.

### 34. Nothing backs up the family's data ✅ *(on this machine)*

The whole chronicle — events, comments, members, the children's profiles — lives
in one PostgreSQL database in WSL on one laptop, and nothing copies it anywhere.
A failed disk, a Windows reinstall or a `wsl --unregister` ends the family's
archive. For a product whose promise is "still readable in fifteen years", this
is the one failure that cannot be apologised for.

A nightly `pg_dump` to a second place — an external disk, or an encrypted copy
in a cloud folder — is an afternoon. **So is one tested restore, and that is the
part that matters:** a backup nobody has restored is a hope. Once photos upload
(item 6), the bucket belongs in the same backup.

**Done, 2026-09-23.** `tools/lan-host/backup.ps1`, every night at 03:00 as the
scheduled task "FamStory backup" (and at the next wake-up if the laptop was
asleep): a `pg_dump` of the database, a mirror of the photographs, the newest 7
dumps plus the newest of each of the last 4 weeks — and then a restore of the
dump it just made into a scratch database, with the row counts of the family's
tables compared against the live ones. A backup nobody has restored is a
belief; this one is restored every night, and `last-restore-check.txt` says
when and whether it matched.

Two things found while building it, both of which would have produced a
backup that looked fine: PowerShell 5.1 turns PostgreSQL's harmless NOTICEs
into terminating errors, and it drops the double quotes around `"User"` on
the way into WSL — so the check first reported a database with exactly one
user in it, because unquoted `User` is PostgreSQL's `current_user`.

**Still open: off this disk.** The backups live in `%USERPROFILE%\FamStory
backups` on the same drive as the database, which protects against a bad
migration or an accidental delete, not against the disk dying or the laptop
being stolen. `-Target` points it anywhere — another drive, or a folder inside
OneDrive for a copy off the machine — and that is a decision about where the
family's photographs go, so it is not made in code.

### 35. A forgotten password locks somebody out for good ✅ *(through the family admin; email later)*

There is no reset. A family member who forgets their password loses their own
family's chronicle, and the only way back is somebody editing the database.
Needed: a "Forgot password?" link, a single-use short-lived token stored hashed
(as refresh tokens already are), an email to send it, and a screen to set the
new one. The email is the part that needs an account — an EU transactional
email provider.

**Done, 2026-09-23, without email.** The usual "we sent you a link" had
nothing to send with, so the answer is the one families use for everything
else: ask the person who set it up. A family admin opens the member and makes
a one-time link — 24 hours, single use, only its hash stored — and hands it
over in a message or as a QR code across the table. Using it sets the password
and signs the account out everywhere. The email flow, when there is a sender,
uses the same rows.

**What it is, said plainly:** a way for an admin to set another adult's
password, which is a way into their account. The defences are the ones that
work in a family rather than a bank: it cannot happen quietly (the person gets
a notification naming who made the link, and using it signs them out of every
device, so a taken account is one they notice they cannot reach), it is in the
audit log, and it reaches only adults with an account in the admin's own
family — never a child profile, never another family. "Forgot your password?"
on the sign-in screen says who to ask.

### 36. The server is a busy personal laptop

On 2026-09-15 the laptop hosting FamStory sat at 100% CPU with under a gigabyte
of memory free, and the page took 19–31 seconds to arrive. It also stops when
the laptop sleeps, and nothing starts until somebody logs in to Windows. The
supervisor keeps the processes alive; it cannot make a busy machine fast.

Options, cheapest to run first: an otherwise unused PC or a used mini PC
(about 10 W, the same setup moved across), a Raspberry Pi 5 with an SSD, or a
small EU VPS — always on, but then the family's data sits with a provider, which
`06-PRIVACY-GDPR.md` has to cover. **Considered and rejected: a PS4.** It runs
only Sony's system software; a server on it means jailbreaking an old firmware
and running an unsupported Linux, against Sony's terms, at several times the
power draw of a mini PC.

---

## Tier 2 — cheap moves against the critical business risk

### 9. A real analytics sink, before the beta and not after

The events are defined and firing — into `console.log`. The month-12 decision
point asks "does retention justify a public launch?" and that question has no
answer without a sink. PostHog EU or an own endpoint; roughly a day.

Getting this wrong is expensive in a way that is invisible at the time: you only
discover the data is missing at the moment you need it.

**Blocked on an account.** The sink is one function — `installConsoleSink()` in
`domain/analytics.ts` is already the seam, and swapping it for a PostHog client
is a few lines. What is missing is a PostHog EU project and its key.

### 10. Monthly summary

MVP+ in the plan. It is the second re-engagement loop and the natural bridge to
Premium — a summary is exactly the kind of thing worth paying for once a family
has a year of history.

### 37. Nobody hears that something happened ✅ *(in the app; push is item 7)*

A grandparent sees a new photograph only by opening the app on the right day.
Against the real server the notification list is empty — no table, no endpoint
(item 21) — and push waits on item 7's accounts. That works directly against
the retention KPI.

The cheapest honest version needs no push at all: a `Notification` row written
when an event or a comment is created, and the existing screen reading it.
**It must go through visibility:** a notification about an event you cannot see
is a leak, however small. Email or push can come later, on top of the same rows.

**Done, 2026-09-23, exactly that way.** One row per recipient, written when an
event is created (everybody who can see it), a comment is added (the people
already in that conversation) or somebody joins (the admins). Recipients come
from the timeline's own `eventFilter` run per member — there is still only one
implementation of "who can see what" in the codebase — and the bell is filtered
by it again when it is read. The smoke test checks the part that matters: a
parents-only event and a private one never reach the grandmother's bell.

The server sends facts rather than sentences, and the app writes the sentence
in the reader's language as it draws it.

### 38. An invitation is a code to type, not a link ✅ *(email invitations wait for a mail sender)*

Sharing an invitation sends "Join our family on FamStory: FAM-J4K7", and the
person then has to register, find "Join a family" and type the code. On the web
a link can carry it — `/join/FAM-J4K7`, then sign in or register, then joined,
with nothing to type. The native deep link (`famstory://join/…`) is already a
TODO in `family/invite.tsx`.

**Done, 2026-09-23.** `app/join/[code].tsx` answers `/join/<code>` on the web
and `famstory://join/<code>` natively: it shows the family's name before asking
anything, remembers the code through registration (`pendingInviteCode`, cleared
on sign-out) and ends in the family with nothing typed. The invitation screen
shares the link rather than the bare code, with a QR code beside it (item 55).
The link carries the host's address, so it breaks when that changes — the
domain in item 36 is what makes it permanent.

---

## Tier 3 — technical debt that will bite

### 11. Domain logic is duplicated between app and API — and it has already diverged

`visibility`, `categories` and `plans` exist on both sides. `docs/01-ARCHITECTURE.md`
flags this as a deliberate MVP trade-off.

It stopped being theoretical: during the English conversion the category keyword
lists in `apps/mobile/src/domain/categories.ts` and
`apps/api/src/modules/ai/ai.service.ts` drifted apart, and for a while the app
and the server suggested different categories for the same title.

They have been brought back in line, and `ai.service.spec.ts` now runs the app's
own test titles through the server so a future divergence fails a test. But a
test that catches drift is not a structure that prevents it — the two lists are
still two lists.

Extract to `packages/shared` before adding another rule to either side.

### 12. No integration or end-to-end tests inside the suite

260 unit tests, none of which sends a real request. `smoke.ts` now does cover the
API against a live database, but it runs separately and by hand — it is not part
of `npm test` and nothing runs it in CI, so it will rot the first time somebody
forgets. The app has no equivalent at all: no test opens a screen and taps a
button.

**Half done, 2026-09-24.** `apps/mobile/src/data/api.integration.test.ts` reads
the live API through the app's own `FamStoryApi` and `HttpClient` - the half of
the seam the smoke test cannot see - and checks what comes back in the app's
types: tags, repeat rules and skips, audiences, reminders, comments, reactions,
a child narrowing an event, wishes, search, the export. Its first run found
item 67. `npm --prefix apps/mobile run test:integration`, skipped by `npm
test`. Still open: nothing runs either test on its own (no CI), and no test
opens a screen.

### 13. Undo on delete ✅

**Now done.** Deleting holds the event and its comments, and an undo bar appears
over whatever screen the user landed on — mounted once at the root, because the
delete happens on the event detail screen and the user is already back on the
timeline by the time the offer shows.

The comments travel with the event. Restoring an event without the conversation
that hung off it would be a quieter kind of data loss, and restoring it under a
new id would orphan every reaction and notification pointing at it. Both are
covered by tests in `src/data/store.test.ts`.

Writing those tests found a real leak: sign-out did not clear the held event, so
the next person to sign in on the same device could restore someone else's
memory. Fixed.

### 14. Draft persistence in the composer ✅

**Now done.** The title and description are written on every keystroke and
restored when the composer reopens, with a banner that says so and offers to
discard. Restoring text silently would read as the app typing by itself.

Only the text comes back. Restoring the pickers would mean silently re-applying
a visibility the user cannot see on screen, and visibility is the one thing in
this product that must never be a surprise.

### 15. Week start is hardcoded to Monday ✅

**Now done.** `WEEK_STARTS_ON` in `src/lib/date.ts`. Monday stays the default —
the study puts the EU first — but the grid and the weekday header now read the
same constant instead of each assuming Monday separately. A test asserts they
agree, because the failure mode is a header saying Monday over a grid starting
on Sunday.

It belongs to the locale. When a second language lands, this moves next to the
date-fns locale and both are read from the store.

### 16. Attachment URLs pointed at an endpoint that did not exist ✅

`api.ts` builds `/attachments/{id}/url`, and the route did not exist.

**The read path is now written** — `apps/api/src/modules/media/`. It does the
part that carries the risk: pin the attachment to the family, then run the same
visibility check the timeline uses, and only then produce a URL. A photo reached
through a permanent link would defeat the whole visibility model, which is why
`Attachment` stores a `storageKey` and never a URL.

**Done, 2026-09-22 with item 6.** The signing lives in `common/storage`: an
HMAC over the key and an expiry, half an hour, and the links now arrive already
signed on the events that carry them rather than one request per photograph.

What it used to do, and why that was right at the time: it failed loudly with
`storage_not_configured` rather than returning something URL-shaped — a broken
image in a family chronicle reads as
lost data, and somebody would spend a day looking for a missing photo instead of
a missing config value.

### 28. One pending invitation shows as two ✅

The Family screen lists invited members and outstanding invitations under one
"Pending invitations" heading, and for a named invitation both exist — so James
appears twice: once as a person waiting to accept, once as an email and a code.

It cannot be fixed in the screen. `Invitation` has no link to the `Member` row
its acceptance will fill (`schema.prisma`, `domain/types.ts`), so the two lists
cannot be correlated at all. The choice is a model decision, and it belongs in
`02-DATA-MODEL.md` before either side is changed:

- **Link them** — `Invitation.memberId`, nullable, set when an invitation
  creates a placeholder member. Keeps a name against an unaccepted invite.
- **Or do not create the member until acceptance** — then "pending" is exactly
  the `Invitation` list, and a group's membership never contains someone who has
  not joined. This also removes the cause of item 23.

The second is cleaner and is probably right; it needs a decision, not a patch.

**Decided and done, 2026-09-24: the second.** It turned out to be what the
server already did — `invite()` creates an `Invitation` and nothing else, and
no code path sets `MemberStatus.invited`. The two rows came from the sample
family, where James was both an invited member (in the Grandparents group)
and an invitation, and from the Family screen reading both lists. James is
now only an invitation, the screen lists invitations only, and 02-DATA-MODEL
says so. The group count of item 23 has nothing left to disagree about.

### 44. The web build is sent uncompressed ✅

`tools/lan-host/static-server.mjs` sends the 4 MB JavaScript bundle as it is.
After the first load it is cached for a year, but that first load — a phone over
Wi-Fi, or anything through Tailscale — is the slowest moment the app has, and on
a busy host (item 36) it is slower still. Pre-compressed gzip or brotli brings it
to roughly a quarter.

**Done, 2026-09-24.** `precompress.mjs` writes a `.br` and a `.gz` beside every
page, bundle and font at publish (brotli at its best setting — seconds per
megabyte, which is why it happens there and not per request), and the static
server sends the smallest one the browser accepts. The bundle leaves as 693 KB
instead of 4.2 MB. A compressed copy older than its file is ignored, so the
moment a publish replaces a page and its `.br` a second apart never serves
yesterday's app. Hashed assets are cached for a year, like the bundle.

### 29. You cannot change your own name or photo after onboarding ✅

`about-you.tsx` asks for a first name, a last name, a birth date and a
photograph, and that is the only time the app ever asks. The design draws a
pencil next to the name on the Profile screen; the implementation points it at
Settings, which offers notifications, privacy and account deletion — not you.

`updateMyProfile()` already exists in the store and does the work. What is
missing is a screen, and the composer's own pattern (one screen in two modes)
suggests reusing `about-you.tsx` rather than writing a second one.

**Half done, 2026-09-23.** The pencil opens `app/profile/edit.tsx`, which
changes the name and the birth date and saves them to the server
(`PATCH /v1/families/:familyId/me`), so the rest of the family sees the change.

**The photograph, 2026-09-24.** `PUT /families/:id/members/:id/avatar` takes the
image as the body, turns it the right way up, cuts a 512px square around what
matters in it and keeps it as a key; members leave the API with a signed link.
Your own from Profile → edit, a child's by the parent who manages it, anybody's
by an admin — and the one picked on "About you" is finally uploaded instead of
staying on the phone that picked it.

---

## Design — the running app next to the delivered file

From a pass on 2026-09-15 comparing every main screen with `design/screens/`.
Event detail, Family, Calendar and About you already follow the file closely;
these are the places that do not, or that the file never had to answer.

### 39. On a computer, the phone layout is stretched across the window ✅

The family uses the web build on computers, and every screen is the phone
layout at the window's width: text fields 1,250px wide, a timeline cover the
width of a monitor, five tabs spread across it. A centred column — roughly
480–600px, paper on either side — fixes every screen at once from one place.
A real two-column layout for wide screens (timeline beside the calendar) is a
design decision for later. The sheets already stop at `size.sheetMaxWidth`.

**Done, 2026-09-23 — the first step.** Every screen and the tab bar now sit in
a centred column (`size.contentMaxWidth`, 720px) instead of the window. On a
phone nothing changes; on a laptop a timeline card is no longer 1,400px wide
and the four tabs are no longer a hand's width apart. The second step — the
timeline in two columns past a breakpoint, the tab bar as a side rail — is
design work rather than a fix, and is still open.

**Second step done, 2026-09-24.** From 1024px the tabs are a rail down the
left (232px, with "New event" in it), and from 1280px the timeline pairs its
cards two to a row within each section, in a wider column
(`size.contentMaxWidthWide`). The navigator gives a labelled rail the Material
drawer's 360px minimum; the rail overrides it.

### 40. The welcome screen still carries a placeholder mark ✅

`welcome.tsx` shows a clock icon in a tile — commented as a placeholder — above
three sign-in buttons. The file draws the wordmark in Fraunces with the tie mark
under it (dot, line, dot), one line of copy ("Private by default — shared only
with the people you choose") and two actions: "Get started" and "I already have
an account". On the web, Google and Apple only lead to the email sign-in, so
they are two buttons doing what the third does.

**Done, 2026-09-24.** The wordmark and the tie mark, the one sentence, "Get
started" and "I already have an account" — as the file draws it.

### 41. "On this day" shows an empty square for a memory without a photograph ✅

The rail's tile keeps its fixed height, and with no picture it is a plain tinted
square — which reads as an image that failed to load. It should say what it is
without one: the category's tone and icon.

**Done, 2026-09-23.** The plate now carries the year the memory happened in,
large, in the category's own ink. An empty coloured square read as a picture
that had not loaded; a year reads as the point of the strip, which is how long
ago.

### 42. Dates are written the American way ✅

`lib/date.ts` uses date-fns `enUS`: "March 14, 1990", "September 21". The file
writes "12 April 1990" and "Sun, 15 Mar 2026", and the study puts the EU first.
The day-first order is a locale choice in that one file, plus its tests.

**Half done, 2026-09-21.** With the Latvian language (item 50), dates follow the
language: `lib/date.ts` picks the date-fns locale and the pattern at the moment
it formats, so Latvian reads "26. septembrī" and "1990. gada 14. martā". A
translated interface with American dates underneath is the half of a second
language that a reader notices first.

**Still open:** English itself. "September 26" is correct for English, so the
question is narrower than it looked — whether an English-speaking family in the
EU should be shown "26 September" (en-GB) rather than the American order. That
is one more entry in the pattern table, and a decision nobody has made yet.

**Decided, 2026-09-24: day first.** The design file writes "12 April 1990", and
an English-reading family in the EU reads that order; "26 September" it is.

### 43. Chips and tab labels are 12px, for an audience that includes grandparents ✅

Filter chips, tab labels and badges use `typography.label`. The brief puts body
text at 15px at the least because grandparents read this app, and the file draws
the chips and tab labels visibly larger than these. 13–14px, rechecked against
the tab bar height from item 33.

**Done, 2026-09-23.** `typography.label` is 13px on an 18px line, and the tab
bar grew to 60 to keep the same 8px to spare that fixed the cut-off labels.
Quiet is the weight and the spacing; it did not also have to be small.

---

## Ideas — worth building, not yet decided

Written 2026-09-21, after the pass that produced items 45–50. These are not
defects: the app is correct without them. They are the things that would make a
family keep it, which is the risk the study rates highest.

### 51. A wish list per person, hidden from that person ✅

The visibility model already knows how to show a thing to everybody except one
member. Nothing in the product uses that for the case every family has: what to
give somebody for their birthday. A short list on a member's profile — text
lines, anybody can add — that the person it belongs to cannot see.

Small to build (a list of strings, one visibility rule that already exists),
and it is the kind of feature that is talked about outside the app. It also
gives the birthday strip (item 46) somewhere to lead.

**Done, 2026-09-24, one step further.** The person can write on their own list
too — "a warm scarf" — and still never sees the family's ideas underneath or
who is getting what: the owner's view is filtered in the query, so the rest is
never even loaded for them (`modules/wishes`). "I'll get this" is claimed only
if still free. On the member's profile; the first line of the card says the
rule from the side the reader is on.

### 52. A question a week, for the people who never type anything

The retention problem is that between events there is nothing to do. "On this
day" answers it for families that already have an archive; a new family has
nothing to be reminded of.

A prompt — "Where did you live when you were ten?", "What did your father do on
Sundays?" — shown once a week, with the answer becoming a timeline entry. It is
how a chronicle gets the stories that nobody would otherwise write down, and it
is aimed at exactly the person who was invited and then never posted. Rule-based
and local: a fixed list of prompts, in order, no model involved.

### 53. What changed since you last looked ✅

Now that the app refreshes (item 45), it knows what it did not have before. A
line across the timeline — "4 new since Tuesday" — and a count on the tab.
Cheap, and it turns a refresh into a reason to open the app.

**Done, 2026-09-24.** Measured by when something was *added*, not when it
happened — a 1974 photograph put in yesterday is new. The server keeps when
each visit began (`MemberVisit`, out of the member row); a visit starts at
launch and after 30 minutes away. The banner filters the timeline to exactly
the new ones, each card is marked, the tab counts them, and opening one takes
it off. Your own events and hidden ones never count.

### 54. A calendar feed the phone's own calendar can read ✅

The plan has Google/Apple calendar integration in V2. Nine tenths of it is a
signed URL returning `text/calendar`: family events appear in whatever calendar
somebody already uses, which is where they will look for them anyway. No OAuth,
no sync, no write path — read-only, revocable, one endpoint.

**Done, 2026-09-24.** Profile → "In your phone's calendar": one address per
person, signed over the member and a version (so it can be shown again, and a
reset kills every copy), answering with exactly what the timeline's
`eventFilter` gives that person, plus birthdays. Series go out as one RRULE in
their own time zone.

### 55. A QR code on the invitation screen ✅

An invitation is a code to type (item 38). For the grandparent this product is
partly for, the shortest path is a square on a screen and a phone camera. The
code already exists; this is a rendering of it.

**Done, 2026-09-23.** `components/family/qr-code.tsx` draws the invitation link
as a QR code, in `scannable` rather than the theme's ink, because a camera needs
black on white in dark mode too.

### 56. In memoriam ✅

A family chronicle outlives people. The birthday strip built in item 46 will
cheerfully announce a dead grandmother's birthday to her children, and a member
row has no way to say that. A marked profile that keeps its history, stops
appearing in reminders and drops out of "coming up" is a small change to make
and a hard one to add after the first family has been hurt by its absence.

**Done, 2026-09-24.** An admin marks the day, and can take it back. The profile
stays with every memory, shows the years, and moves to an "In memory" section
of the family tab; the birthday strip, the calendar feed, reminders and
notifications leave them out; the account's sessions end and `contextFor()`
will not let it back into the family. Never about yourself, never the last
living admin. The Latvian wording avoids pronouns, which would have to guess a
gender.

### 58. A "groups and people" audience reached nobody ✅

Found 2026-09-24. The composer's audience sheet sends `kind: custom` with both
lists, and the server's `buildVisibilityRows` had no case for it: the event was
saved with no rows, so it reached only its author, whoever had been picked.
The app then drew it as "family", because its translation had no `custom` case
either. Fail closed on the server — nothing leaked — and wrong everywhere else.
The live family had not used it yet (0 such events). Fixed on both sides, with
foreign ids dropped and an empty audience saved as `private`; smoke section 10.

### 59. Tags vanished on the next refresh ✅

Found 2026-09-24. Saved, returned by the server, and dropped by the app's
`toEvent`, so a tag lived until the next refresh. Mapped, and tested.

### 60. A reminder changed while editing never reached the server ✅

Found 2026-09-24. The composer did not pass the reminder to `updateEvent`, and
the store did not send one: the change lived on one phone. It is now sent when
it changes — and only then, so saving a typo does not re-arm a reminder that
has already gone out. Moving an event now moves its reminder on the server too;
it used to stay at the old time.

### 61. Every edit wrote "visibility changed" into the audit log ✅

Found 2026-09-24. The composer sends the whole event back, and the store sent
the visibility down the audited path every time — "family → family" on every
typo. Sent only when the audience actually differs.

### 62. The timeline showed the newest fifty events and nothing older ✅

Found 2026-09-24. The refresh loaded one page of fifty (by date, newest first)
and nothing ever asked for the next: a family with years of history saw the
most recent fifty, and the rest of the chronicle was simply not on the phone.
Search only filtered what happened to be loaded, so it missed exactly the
years a chronicle is for.

**Fixed the same day.** The timeline asks for the next page as it nears the
end (`loadMoreEvents`, the API's `nextCursor`, now with an id tiebreak so a
page boundary between two events at the same moment cannot drop one). Search
asks the server for the words, the kind, the person and the year — and adds
person and year filters, "the one with Grandma", "the summer of 2019" — while
what is loaded answers at once, tags included. Repeating series are loaded
apart, so the calendar keeps them whatever their date.

### 63. Repeating events ✅

The largest gap in the data model (docs/08-LAUNCH-PLAN.md 3.4): a weekly
practice was thirty rows. **Done, 2026-09-24** — one row with a rule, computed
occurrences in the series' own time zone, a reminder that walks along the
series, "skip this one" and "stop repeating from here". See 02-DATA-MODEL.md.

### 64. A guest link to one event ✅

docs/08-LAUNCH-PLAN.md 3.2. **Done, 2026-09-24**: the author or an admin makes
a link for a day, a week or a month; the guest sees the words, the date and the
photographs at `/guest/<token>` with no account; the links still open are
listed with their view counts, to withdraw. Audited, hashed, rate limited.

### 65. The conflict check told a grandparent about the parents' appointments ✅

Found 2026-09-24. `detect-conflicts` searched the whole family and returned
the ids it found, so an event hidden from the asker still came back as "there
is something here" — with its id, which is the start of a thread to its
content. It now reads events through `eventFilter` like every other path, and
it counts a repeating series at each occurrence (a weekly practice clashed
only on the day it began). The composer shows the answer, worked out on the
phone from what the person can see (domain/conflicts.ts): "At the same time:
“Swimming practice”, 16:30 (Emily)", with Change time and Keep it.

### 66. The KPI events went nowhere ✅

Found 2026-09-24. `track()` was called from every flow the plan measures, and
the sink was the console: at the month-12 decision there would have been no
data at all, and `app_opened` — retention — was never tracked. Now batched to
our own server (modules/telemetry) with nobody in them, behind a switch in the
profile that the server enforces, and `npm run kpis` prints the section 6
table. The same module keeps the app's errors, scrubbed, with a root error
screen instead of a blank page.

### 67. After every save, the reminder, the photographs and the comments vanished ✅

Found 2026-09-24 by the integration test's first run. The app replaces its copy
of an event with the server's reply, and the replies had less in them than the
list: a create came back without its reminder, an edit without its
photographs, reactions and comment count, and one event opened on its own
always said "no comments" (and carried each participant's whole member row,
storage key included). Everything was right again after the next refresh, which
is why nobody saw it for long enough to report it. Every path now answers with
the same `EVENT_REPLY` include (events.service.ts).

### 68. Voice: a note told instead of typed, and dictation ✅

The owner's idea, 2026-09-25, and the launch plan's 3.3 ("a grandparent will
talk for four minutes and never type four sentences"). Two things behind one
microphone (domain/voice.ts):

- **Voice notes** are recorded in the composer with the browser's own
  MediaRecorder (no package), kept with the event on our server, played on
  the event and marked on its card. Counted apart from the photographs, never
  on a guest link, deleted with their file.
- **Dictation** puts speech into the title or the description through the
  browser's SpeechRecognition - which sends the sound to Google or Apple. The
  app says so before the first time on each device and never listens by
  itself.

Both need a secure page: **the plain `http://` LAN address gets no
microphone** in any browser. They work on the laptop itself (localhost), over
the Tailscale https address, and on the future domain; elsewhere the composer
says why.

**On a phone too, 2026-09-25** (the owner agreed to the download): expo-audio
records one channel of AAC (.m4a, about 2.4 MB for five minutes) and plays it
back. `lib/recorder.native.ts` and `lib/note-player.native.ts` give the same
answers as the browser's `recorder.ts` and `note-player.ts`, so the composer
and the VoiceNote are one screen for both; the Android bundle was built to
check the split (the native recorder is in it, MediaRecorder is not). The
microphone prompt's words are in app.json and, in Latvian, locales/lv.json.
Dictation on a phone is the keyboard's own microphone, so no speech package.
Not yet heard on a real phone: that needs Expo Go or a build.

### 69. A photograph removed while editing came back on save ✅

Found 2026-09-25 while building item 68. There was no way to delete an
attachment: the composer dropped it from its own list, and the server's reply
to the edit put it straight back. `DELETE /families/{id}/attachments/{id}`
now takes it out, file and all, and the store sends it for whatever an edit
removed.

### 70. A Latvian family read "Parents, Grandparents" everywhere ✅

Found 2026-09-26 walking the app in Latvian. The server creates the three
system groups with English names, and the app printed the stored name: in the
audience filter, under every event ("who sees it"), in the pickers, the
invitation and the family tab. `domain/groups.ts` `groupLabel()` names a
system group by its `icon` in the reader's language; a group the family made
keeps its own name. A system group cannot be renamed, so this cannot hide a
name somebody chose.

### 71. The settings screen's switches did nothing ✅

The three notification switches were `useState` in the screen: flipped off,
they were on again next time, and the server never heard of them. They are on
the account now (`User.notifyEvents`, `notifyComments`, `notifyReminders`,
all on by default), and `NotificationsService` does not write a kind for
somebody who switched it off. Smoke checks it against the live server.

On the profile, three rows promised what was not there. "Reminder timing: 1
day before" was written into the code and opened a screen that could not
change it; it is now `User.defaultReminderMinutes`, picked in place, and the
composer starts a new event on it - unless that moment has already gone (a
memory written down after the day), when the row and the save both say no
reminder. "Export: PDF · DOCX" was one JSON file; the label is gone. "Help"
opened the settings screen; the row is gone until there is help to open.

### 72. Small things a Latvian reader met ✅

"Plan", "Free" and a bare "13 / 50" on the profile; "Back", "Previous month"
and "Next month" read out in English by a screen reader; prices as `€4.50`
beside Latvian dates (now `4,50 €`, as `plans.ts` had said it would once a
second language landed); "Forgot your password?" on the screen that creates
an account. And every web page had an empty `<title>`: a tab read
"localhost:8081/welcome", and an invitation pasted into a chat previewed as
nothing. The root layout sets the title and a description now.

### 73. When the laptop sleeps, the family's app is gone ⬜

Seen 2026-09-25 in the logs: the laptop slept 17:46-20:22 and 20:58-23:45,
and each time it woke the API's first database call failed once (WSL was not
up yet) and then recovered on its own. Nothing was lost - a reminder due in
the gap is sent late, or dropped once it is six hours past its event
(`notifications.service.ts`) - but for those five hours nobody else could open
the app. It is a setting on the laptop ("when
plugged in, never sleep"), which is the owner's to change, and the real answer
is still the server of wave 0.

### 74. A mark that holds at every size ✅

2026-09-26, the owner's call: keep the name FamStory, pick the mark that looks
best. The design's tie (dot, line, dot) read as a generic "link" on a home
screen and as a dash in a browser tab. Four directions were drawn - a knot in
the tie, beads on a thread, two parents and a child held in a curve, an S of
thread - and compared at 16 to 336 px on light and dark ground. The curve won:
the only one that kept its shape at 16 px and said family rather than
technology, and the curve is also a smile. `tools/brand/make-icons.mjs` draws
every icon, the splash and the favicon from it, plus `logo-mark(-dark).png`
for the welcome screen, where it now sits above the name.

A note for the store listing: the name is shared by famstory.app (a family
tree) and thefamstory.com (family moments), so an App Store name will likely
need a subtitle of its own, and the trademark wants checking before launch.

### Keepsakes: eight things a family keeps rather than plans (items 75-82)

2026-09-27, the owner's decision (docs/00-PLAN.md, "Pulled forward again").
Each is a bet on the study's critical risk, retention: a chronicle opened
again for what is in it, not only for what is next. Each has its KPI event
(domain/analytics.ts, "Keepsakes") and none carries content.

### 75. Time capsules ✅

An event sealed until a day its author picks - in 1, 5 or 10 years, or on a
child's 18th birthday at 09:00 (domain/capsules.ts). `Event.sealedUntil`.
Until then everybody but the author gets the envelope: title, date, who. The
server strips the rest from every reply (`EventsService.present()`), and every
path to what is inside - comments, reactions, attachments, uploads, a guest
link - goes through `VisibilityService.assertCanOpenEvent`, which answers 403
`capsule_sealed` with the opening day. The calendar feed leaves the
description out and search does not match it. Nobody else can edit a sealed
capsule; only its author can move the day. When it opens, the worker tells
everybody who can see it (`capsule_opened`, claimed once through
`unlockNotifiedAt`).

### 76. Birthday surprises the family writes in secret ✅

Fourteen days before a birthday the home screen asks the others for a wish or
a memory for that person (domain/surprises.ts). Each is an event with
`hiddenFromMemberId` and `revealAt` (07:00 on the day): hidden from that one
person ahead of every other visibility rule, on the server
(`eventFilter`, an AND of positive branches - a NOT over NULL columns would
have hidden every ordinary event) and in `canSee()`. On the morning it becomes
their book, on the home screen for a week, and they are told
(`surprise_ready`). A surprise cannot be for yourself, for somebody outside
the family, or more than 400 days ahead (`invalid_surprise`).

### 77. A grandparent's life story, one question at a time ✅

Nineteen questions in five chapters - childhood, youth, love, work, what life
taught (domain/lifestory.ts) - asked one at a time from a member's page. An answer is
an ordinary event with the question's `promptKey` (`ls-...`), so it has an
audience like any other and can be told as a voice note; the story screen
reads the answers back as chapters, in the order the questions go.

### 78. The story shelf ✅

A tale told in a voice note can go on the shelf (`Event.onStoryShelf`): the
bedtime stories in the voices the children love, played one after another
(app/shelf.tsx). The composer offers the shelf only to an event with a voice
note.

*Taken out of the app on 2026-10-01 (item 100): the owner could not tell what
it was for. The field stays in the data, and the voice notes on the events.*

### 79. Heirloom stickers ✅

A printable sticker with a QR code for a thing that outlives its owner - a
watch, a recipe book (app/sticker/[eventId].tsx). The code is a guest link
(item 64) that lasts a hundred years and, unlike an ordinary one, plays the
voice notes (`EventShareLink.heirloom`). Refused for a sealed capsule and an
unrevealed surprise.

### 80. Growing up, year by year ✅

One square a year for a child - the first day of school, the height on the
door frame - from events that share a tag or a title each year
(domain/yearly.ts `growingUp`). Sealed and unrevealed events are left out.

### 81. The traditions album ✅

What the family does every year under the same name - Midsummer, the first
snow - as one album, a column per year (`traditions`).

### 82. The year as a one-minute film ✅

Twenty of the year's photographs, three seconds each, with the voices told
about them, played in the app (domain/film.ts, app/film.tsx). In a browser it
can be saved as a video: drawn onto a 1080×1920 canvas and recorded with
MediaRecorder (MP4 where the browser can, WebM elsewhere), the voices mixed in
with WebAudio, and the mark at the end (lib/film-recorder.ts). Nothing leaves
the device to make it.

### 83. Found on a search, installed from the browser ✅

The owner's ask, 2026-09-27: typing "FamStory" into Google should find the
app and offer to install it, the way apps have a web version. The web build
is that version, and now it installs as an app of its own on a computer or a
phone, with no store: a manifest and icons (public/manifest.webmanifest,
drawn by tools/brand/make-icons.mjs), a service worker that keeps nothing
(public/sw.js - CLAUDE.md, "Persisted state is credentials"), and
lib/install.web.ts, which holds the browser's offer for an Install button on
the welcome page and the profile, or tells Safari users where Share is.

For the search engine: the welcome page and `/` are the only pages it may
index (`X-Robots-Tag` everywhere else, a guest link above all), robots.txt
and a sitemap name them, and app/+html.tsx gives every page the preview
picture, a description and structured data (WebApplication). The welcome page
says what the app does under its first screen. What is still the owner's: a
domain and the server (tools/deploy), then Google Search Console to submit
the sitemap - tools/deploy/README.md, "Being found".

### 84. Every pre-rendered page was an empty background ✅

Found while doing item 83: the static export's HTML had no text on any page,
so a search engine read nothing without running the script and a phone
showed a blank page until the whole 700 KB had arrived. The font packages'
`useFonts` answers "not yet" while pages are pre-rendered; expo-font's own
hook writes the faces into the HTML and answers that they are ready. Only the
front door is pre-rendered with its content (`PRERENDERED` in app/_layout.tsx)
- every other page depends on the session, the date or the window, which the
build machine does not have, and a first client render that disagreed with
the HTML would be a hydration failure.

`/` was pre-rendered at first too, and that was one: its index.html is also
what both servers answer for every address without a file of its own - a
link to an event, a guest link, an invitation - so each of those hydrated
against the wrong page (React error 418, found 2026-09-28 opening a guest
link). `/` shows nothing but a redirect, so it went back to the background.

### 85. On the server, the microphone was switched off ✅

Found the same day: tools/deploy/Caddyfile sent
`Permissions-Policy: microphone=()`, which on the real domain would have
turned voice notes and dictation (item 68) off without a word. It says
`microphone=(self)` now. The LAN host never sent it, which is why nobody had
seen it.

### 86. The root's own words kept the first language ✅

Found checking item 83 in Latvian: the page's description stayed English on
a Latvian page. The language switch rebuilds everything under the root's
`key={locale}` - but not the root itself, and a `t()` written there is
memoised once by React Compiler. On the web, which hydrates in English, that
also left "Event deleted" and "Undo" in English for a Latvian family. Both
are components of their own now, under the key (`PageHead`, `UndoDeleteBar`
in app/_layout.tsx).

### 87. Two nights without a backup ✅

Found 2026-09-28 checking that everything worked: the last backup was from
the morning of 09-26. The laptop sleeps through 03:00, and the task counted
on Windows starting a missed run at the next wake-up (StartWhenAvailable).
It did on 09-26, and not on 09-27 or 09-28 - nothing failed, nothing ran,
and nothing said so. The task now also starts ten minutes after a logon, an
unlock and a wake from sleep, and `backup.ps1` does nothing within 20 hours
of the last complete backup, so it is still one backup a day
(tools/lan-host/README.md, "Backups"). A backup was made by hand the same
morning. On the way: that README's backup paths had been mangled into
control characters (`\a`, `\b`, `\v`) by a heredoc long ago.

### 88. A link into the app, opened without an account ✅

Found the same day: only the entry point checked for a session. A link to an
event, the composer or the calendar, opened where nobody was signed in, drew
the page around a family that was not there - "Everyone in" and nothing
after it - with no way to sign in. Such a page now goes to the front door,
which decides where next (`AccountGate` in app/_layout.tsx,
`lib/routes.ts`). What opens without an account: the welcome and sign-in
pages, an invitation, a guest link, a one-time password link. An unknown
page does not.

### 89. The demo on a real phone, at an address that still answers ✅

The owner, 2026-09-28: the demo could not be seen on the phone. The demo was
fine - on a phone-sized screen, over plain http, it walked from the welcome
page to the timeline, the composer, the shelf and the film without an error.
The link was not: the Wi-Fi had been switched off and the laptop was on the
cable, Windows still listed the Wi-Fi's old address, and the QR code handed
out had been built from it. The phone view (`/phone`) now has **Open on a
phone**: it asks the server for the address the machine has right now -
Node lists only adapters that are up - and shows it as a QR code
(`/phone/addresses` in tools/lan-host/static-server.mjs). A link that is
worked out when it is needed cannot be a stale one.

### 90. Two ways of meeting FamStory on a phone, at the phone's real size ✅

The owner, the same day: "the app and the demo are no different", and what
was wanted was to see (a) what a phone shows somebody who typed FamStory into
Google and opened the link, and (b) the app with a family already in it -
both as big as a phone really is. Both opened on the welcome page, so they
were the same page. Now:

- The demo opens straight into the sample family (app/index.tsx, only in a
  build with no server); the welcome page is at /welcome.
- The phone view has **As the app** - full screen, as from the home screen -
  and **From Google** - the welcome page under Safari's bar on an iPhone and
  Chrome's on Android (`?view=app|browser`).
- **Real size** is the phone's height in millimetres on this screen. A page
  cannot know a screen's pixel size, so it asks once, with a bank card held
  against the screen; "pixels 1:1" on the 70 cm monitor here had drawn the
  phone at more than twice its size. The page's own words are in Latvian
  and English now, following the app's language.

### 91. What somebody likes, and a present before their birthday ✅

The owner, 2026-09-28: onboarding should collect what people like, and when a
family member's birthday comes, the app should suggest a present to buy.

- **Onboarding asks** "What do you like?" as step 2 of 5, right after "About
  you": taps on twenty chips (gardening, baking, fishing, LEGO...), at most
  twelve, and skipping costs nothing. The list is fixed on purpose - a key,
  never a sentence about a person or a child (docs/06-PRIVACY-GDPR.md).
  `Member.interests`, sent with the new family or the accepted invitation; the
  profile changes it later, and a child's is changed on the child's page by
  the adult who manages it (`PATCH .../members/{id}/interests`, audited).
- **Gift ideas** (`domain/gifts.ts`) on everybody's page but your own, under
  the wish list: one idea per chosen interest before any gets a second; then
  what the entries the person is *in* keep coming back to (two mentions at
  least, in either language - "makšķerējām" is fishing); then a child's age;
  never fewer than three. Worked out on the device from what the viewer can
  already see. **"I'll get this"** writes the idea onto the wish list already
  claimed (`claim: true`), so the person never sees it and the rest of the
  family sees it is taken; the cart opens a web search for the idea's words.
- **The timeline** offers the ideas for the nearest birthday in the next two
  weeks that is not your own.

Counted: `interests_saved`, `gift_ideas_shown`, `gift_idea_taken`,
`gift_idea_searched` - how many and from where, never which idea or whose.

### 92. Mother's Day, and the rest of the family's days ✅

The same request: remind about Mother's Day "and all the other days".
Twelve days as Latvia keeps them (`domain/special-days.ts`, the server's copy
in `common/special-days.ts`, both tested on the same dates): Valentine's Day,
8 March, Easter (Western), Mother's Day (2nd Sunday of May), Children's Day,
Līgo evening, 1 September, Father's Day (2nd Sunday of September), Teachers'
Day (1st Sunday of October), 18 November, Christmas Eve and New Year's Eve.

- **A reminder three days ahead**, in the bell, for everybody who can sign in
  and wants reminders - written once per person and day, not before 09:00 in
  Riga (`special_day`, `dayKey` + `dayOn`). The sentence is the app's: "Mātes
  diena pēc 3 dienām", counted from the day it is read.
- **A card on the timeline** a week ahead, a mark on the calendar, and the
  day's own page: when, a few ideas, and on a day with presents whose pages to
  look at for their wish lists and gift ideas. Christmas Eve's first idea opens
  the wish lists; New Year's Eve's opens the year in a minute.

Not yet: **name days** (vārda dienas). Latvia's calendar of them is an
official list of about 1,300 names; it needs the list itself, and the
family's names matched to it.

### 93. The demo's newcomer was the sample family's Anna ✅

The owner, 2026-09-28: after "Get started" on the demo, a family named and a
name typed, the app still showed the Bergs and "Anna Berga". A new account on
the demo was Anna under a new name, and joining a family made you Anna. It is
a newcomer now - no email, no name until "About you" - and joining adds a new
member to the sample family. The welcome page switches the language (LV/EN)
before there is a profile to find the setting in, and says that the demo keeps
nothing across a reload.

### 94. The phone view opened on a dialog, not a phone ✅

The owner, 2026-09-30, looking at the demo in the app's browser pane: it has
to look like a phone. The page opened the "measure this screen" dialog by
itself, and in a pane under 300 px tall that dialog was all there was. Now the
phone comes first, fitted to the window, with a line and a **Measure** button
for the real size; a window shorter than the phone gets the whole phone,
smaller, rather than half of it; and in a short window the buttons stand in a
column beside the phone instead of rows above it.

### 95. Opening FamStory from a phone's home screen ✅

The owner, 2026-09-30: "like on a MacBook - you open the phone through it,
open the app from there, and see it open and how it works". A Mac does that
with iPhone Mirroring or Xcode's iOS Simulator; neither exists on Windows, and
an iPhone's screen cannot be driven from Windows at all. The real equivalent
here is Android Studio's emulator: this laptop can run one (16 GB, i7-1165G7,
89 GB free) once the Windows Hypervisor Platform is switched on - it is off -
and after downloads of a few gigabytes, which wait for the owner's yes.

Until then the phone view has a **home screen** (`?view=home`, the default):
FamStory's installed icon among the phone's own, a tap opens it with its
splash, the home bar goes back, and the app is still where it was left when
it is opened again. Walked in headless Edge: home, the splash, the Bergs, a
tap into Vera's page, home, reopened on Vera's page, the browser's icon,
Android, and measuring the screen - no errors.

Then, the same day: "it needs an animation when the app opens". There was
one - the whole screen popping out of a point in 0.3 s - which read as a
flash. Now the window grows out of the tapped icon, rounded like the icon
at first and like the screen at the end, the icon itself travels to the
middle of the splash, and the home screen falls away behind; going home the
window shrinks back into its icon and fades into it. Web Animations, with a
clip rather than a stretch, so nothing is squashed; timers decide what is
shown, since a hidden pane runs no animations. `?slow=N` for looking at it,
and a recording in slow motion, resampled to real time, is what showed the
closing window had landed as a scrap of the page rather than the icon.

And then: "make it livelier". The movement is on springs now - a damped
oscillator sampled into CSS `linear()`, a few per cent past the mark and
back - and it is the app itself that moves: scaled evenly into the icon's
place, masked to a rounded square, zooming up to the screen, while the home
screen zooms away from the tapped icon and blurs. The icon gives under the
finger, bounces when the app goes back into it, and after a cold start the
page pops in as the splash fades.

### 96. A new mark, and motion that does not stutter ✅

The owner, 2026-09-30, on the springs of item 95: "it stuttered badly"; what
was wanted was what apps do - the logo turns into a short animation, then the
app opens - some movement on the Google side too, and another logo.

- **Why it stuttered.** It moved a clip and a blur, and animated the app's own
  page as the page was still loading behind it: all of it on the main thread,
  fighting the app for it. Now only transform and opacity move - the two a
  browser moves off the main thread - the dock lost its backdrop blur (drawn
  again on every frame the home screen moved), and FamStory loads behind the
  home screen as the phone view opens, so the first open waits on nothing.
- **The splash is the logo's.** Tapping FamStory the first time brings the
  splash up out of the icon, and on it the mark comes together: the halves
  swing in and meet, the child lands on top, the heart beats once; the name
  rises in; then the splash fades and the app is there. Opened again, the app
  grows out of its icon, and it shrinks back into it going home.
- **The new mark** (tools/brand/make-icons.mjs): a heart of two halves - two
  people leaning into each other, one in Paper and one in Jade - and the
  child above them. Chosen from four drawn at icon sizes (a roof over the
  family read as a face, a speech bubble as a chat app); it keeps its shape
  down to 16 px. Every icon, the splash, the favicon, the share picture and
  the halves as layers of their own are drawn from it.
- **The welcome screen moves**, which is what somebody arriving from a search
  sees: the same mark comes together (components/ui/logo-mark.tsx) and the
  name, the promise, the doors and the rest rise in after it, one after
  another (components/ui/appear.tsx). On the web these are CSS animations,
  which the browser runs from the first paint of the pre-rendered page and off
  the main thread; the page is left whole for anything that reads it without
  running it, and reduced motion stops them in the page's own head.

### 97. Closing an app the way a phone does ✅

The owner, 2026-09-30, of item 96's opening: "it looks really nice - really
what I wanted"; "save this version" - kept as the tag `v0.3.0` - "and can I
close the app as in real life, and open it anew to see the animation again".

Once opened, the app stayed open for as long as the page did: the next open
grew it out of its icon, and only Reload on the home screen - which no phone
has - brought the splash back. Now the phone view has an app switcher,
reached as on the phone: the bar at the bottom dragged up and held (an iPhone
SE's round button pressed twice). The app shrinks into a card under the
finger, and every open app is there as a card of itself - fanned on an
iPhone, the newest on top at the right; side by side on an Android, sideways
to the older ones. A card swiped up closes its app and unloads it, so its
next open is a cold start: the splash, and the mark coming together again. A
card tapped opens its app where it was; the empty space and the bar go home,
and the bar flicked up rather than held goes straight home.

The cards are the apps' own windows, scaled - live, not pictures - which
needed each app drawn in a window of the whole screen, the room under the
phone's bars included. Still only transform and opacity move, the finger's
drags included. Walked in headless Edge with a mouse: open, hold, swipe away,
reopen with the splash, a flick home, the SE's double press, an Android's
two cards and a sideways scroll - no errors.

The shots showed a thin light line round the app, fitted smaller than 1:1.
Under the screens React Navigation paints a ground of its own, a light grey
whatever the scheme, and a dark screen drawn at a fraction of a pixel let it
through at the edges. The navigators take the app's colours now (a
ThemeProvider in app/_layout.tsx), which also keeps a screen sliding in on a
phone in dark mode from showing light behind it.

### 98. From the demo to the real app ✅

The owner, the same day: "and can I switch from the demo to the real one, as
if I wanted to use it".

- **The demo's way out.** Under the demo's notice ("Nothing made here is
  saved"), on the welcome page and in Profile: **Start your own family**. It
  goes to `/real`, which the LAN host sends on to the real copy on the same
  host name - 8090 to 8081 on the local network, 8443 to 443 through
  Tailscale - so the demo's bundle holds no address; on a domain it is a
  redirect. Tracked as `demo_left` (where the button was), for the
  registered-families KPI.
- **The phone goes over with it.** The demo and the real app are two origins,
  each with its own storage and sign-in, so the app cannot be swapped inside
  the phone: **Demo** and **Real** at the top of the phone view move the whole
  page to the other copy's phone view, carrying the view, the phone, the
  size, the colours, the language and the screen's measurement. Pressed inside
  the phone, the demo's button does the same, and the real copy's phone then
  opens FamStory from its icon - the splash, then the real app's front door.

### 99. The app opens like an app; the page from Google says what it is ✅

The owner, 2026-09-30: when the app opens you should see the logo and be
asked to sign in, as other apps do; on Google there should be information
about the app, and a way to have it on a computer too.

The welcome page had been both: the app's front door and the page a search
finds. Now how FamStory was opened decides (app/index.tsx):

- **Opened as an app** - a phone build, the web app installed (its manifest
  opens it at `/?source=installed`), the phone view's app - it opens on the
  sign-in, under the mark and the name, with the language at the top and
  nothing to go back to (app/(auth)/sign-in.tsx). Somebody signed in goes on
  to the family, as in any app.
- **In a browser** it is the welcome page: the promise and the two ways in,
  what a family keeps here, and **Get FamStory** - on a computer a button that
  installs it where the browser can (Chrome and Edge; a window and an icon of
  its own), the steps where it cannot (and Safari's "Add to Dock" on a Mac);
  on a phone the iPhone's and Android's steps; the stores later. The address
  a browser installs nothing from, the laptop's plain-http one, is said.
- **The demo** is no different, except that its sign-in has the sample
  family's address filled in and asks no password: one press to the Bergs
  (from 2026-09-28 it went straight into the family, item 90). In the phone
  view each cold start of the demo's app begins signed out, so the front
  door is what is met; the real copy keeps its sign-in.

Apple's menus are named in English in the Latvian text too: iPhones and Macs
have no Latvian.

Found on the way: the real site's pre-rendered welcome page said "This is a
demo with a sample family" - in the HTML a search engine reads - since the
notice came in (2026-09-28), and the browser's first render took it out again
(React #418, the whole page drawn anew). At build time there is no page for
the relative "/v1" to be relative to, so the build looked like the demo;
`isLive()` counts it as the server it will be now (data/backend.ts).

### 100. The night before showing it ✅

The owner, 2026-10-01, presenting it the next day: the language went wrong
on the computer, signing out took two presses, "Full page" opened the
installed app, the "3 new since" line pressed on the cards under it, the
story shelf meant nothing to them, and the phone panel should have a way in
from anywhere. Then: press everything, test everything.

- **Signing out took two presses.** Two causes, either enough. From inside
  the tabs "/" is the timeline - the tabs' own index has the same address -
  so a sign-out sent there landed on an empty timeline, signed out; now
  every signed-out path goes to `frontDoor()` (lib/routes.ts): the sign-in in
  the app, the welcome page in a browser - with every screen that was open
  let go first (`toFrontDoor` in lib/navigation.ts), or a sign-out from
  Settings left the family's tabs under the sign-in, a back arrow away. And a refresh on its way when the
  button was pressed - coming back to the window starts one - put the
  session back when it arrived; now every answer checks it is for the same
  sign-in (`signedInAs` in data/store.ts, and two tests in data/sync.test.ts
  that fail without it).
- **Latvian shown as English.** The welcome page is pre-rendered in English
  and turned Latvian a second or more later, its opening played twice. For
  somebody who chose another language the page now waits out of sight, its
  ground only, until it is drawn in theirs (+html.tsx, at most 3 s). The
  switch itself kept its place on every screen it was walked on.
- **"Full page" opened the installed app.** Edge opens a link to an installed
  web app's site in the app's window; the manifest now says it would rather
  not (`handle_links: not-preferred`), and the phone view's "Full page" is the
  site, never the installed app's own address.
- **The header of the timeline** has one gap now: each card had brought its
  own margin, or none, and the "3 new since" line sat right on the card under
  it.
- **The story shelf is gone** from the Family tab, the composer, the cards,
  the event page and the welcome page (item 78).
- **The sample family speaks Latvian** in a Latvian app (data/mock-lv.ts): the
  Bergu ģimene - Mārtiņš, Emīlija, Roberts - their entries, comments,
  notifications and wishes, laid over the English by id and back again with
  the language, whatever was added to the demo left as written.
- **An address the app does not have** was Expo's English page for
  developers; now it says so in the app's words (app/+not-found.tsx).
- **A screen with nothing behind it** - reloaded, or opened from a link - had
  a back arrow that did nothing, and a reloaded composer saved and stayed
  open. Every back is `goBack()` now (lib/navigation.ts): back, or on to the
  front of the app.
- **Open on a phone** has the way in from anywhere: this copy's Tailscale
  address as a QR code, asked of Tailscale when the panel opens.
- **Voice**: a voice note recorded and played back with a microphone that
  plays a spoken sentence; dictation listens, hears and answers - whether the
  words come back needs a real voice, since the browser's recognizer listens
  to the real microphone even when a test gives the page a recorded one.

Walked in headless Edge: 63 pages of the demo and the real copy's open pages
at a phone's size and a computer's, Latvian and English, light and dark -
errors, the error screen and pages wider than the window looked for, every
page photographed and looked at - and then the presses: signing in and out,
the language back and forth, the switcher, Demo and Real, the phone panel.

### 101. Anybody with the link ✅

The owner, 2026-10-01: a link to send, and the code where a few people can
see it.

- **The code** is in a private GitHub repository, `rjansons16-bit/famstory`.
  People get access by invitation.
- **A public copy of the code** is for anybody to read, with no account
  needed: `rjansons16-bit/famstory-code` (`tools/publish/publish-code.mjs`).
  It holds the files as committed and leaves three things out: the history,
  whose commits carry the owner's e-mail; the designer's `.fig`; and the
  feasibility study's contract number. If either the e-mail or the number
  is still in the copy, it is not published.
- **The demo from the laptop, for anybody.** Tailscale Funnel opens the
  demo's port, 8443, to the internet. The real copy stays in the tailnet
  (`tools/lan-host/README.md`, "Anybody with the link").
- **No dead ends for a Funnel visitor.** Two things led into the tailnet,
  where that visitor cannot follow: the phone view's Demo | Real and the
  demo's "Start your own family". For a request that Tailscale marks as
  coming through Funnel, the server now has no other copy. The switch hides,
  and `/real` serves `not-public.html`, which says the real app is not open
  to everyone yet and leads back.
- **The phone panel** calls the demo's code a public link while Funnel is on.
- **The demo without the laptop.** The same export is also on GitHub Pages,
  at the account's own site (`tools/publish/publish-demo.mjs`). It sits in a
  public repository that holds only the built demo. On the free plan Pages
  serves public repositories only, and the code stays private.

Checked from the internet:

- **Through a Funnel relay:** the demo opens, `/v1` answers 404 and `/real`
  is the page. The real copy's 443 and the other app's 8600 do not answer.
- **On Pages:** the front page, the way out, signing in and a link straight
  to an entry.
- **The first time, DNS was slow.** The public name took about 15 minutes to
  appear, longer than the 10 that Tailscale states.

**Taken down, 2026-10-13.** The owner wanted nothing public any more, and
everything kept privately:

- **Funnel is off.** 8443 is tailnet-only again; through a public relay the
  name no longer completes a TLS handshake.
- **Both public repositories are private** (`famstory-code` and
  `<user>.github.io`). That took the Pages site down too: on the free plan
  Pages serves public repositories only, and the site answers 404. (Pages
  cannot be switched off on a user site through the API: 422.)
- **The private repository** was brought up to date the same day; it and
  this laptop hold everything the public copies had.
- **To publish again:** make the two repositories public in their settings
  and run `tools/publish/publish-code.mjs` and `publish-demo.mjs`; each
  script makes its repository if it is missing, but leaves an existing
  private one private.

### 102. What the stores will ask before anything else ✅

The owner, 2026-10-01: ready for the App Store and Google Play, with the
accounts on a company, Premium in the first version, and the server later
(`09-APP-STORES.md`). The parts that need no account:

- **The native configuration.**
  - Purpose strings in two languages for exactly the photo library and the
    microphone. There is no camera, and no Face ID (expo-secure-store adds
    that string by default).
  - Phone only.
  - No export-compliance question: the app only uses HTTPS.
  - EAS profiles.
  - `app.config.js` stops a production build without an https API, without
    a support address, or with a `[blank]` left in the legal texts.
- **The privacy policy and the terms inside the app.**
  - `app/legal/[doc].tsx` draws them from `docs/legal/`
    (`src/legal/parse.ts`). It leaves out the draft notice and the notes
    for the lawyer, including the one in the middle of a sentence, which
    ends the sentence properly.
  - The terms now exist in Latvian too.
  - They open without an account and are linked from Settings, the
    paywall, the sign-up and the welcome page.
  - A test fails while the app's copy is behind the documents, or while a
    note would show.
- **The paywall promised four things that do not exist.** The PDF
  chronicle, video, more groups and the summaries were flags in
  `domain/plans.ts` and nothing more. A subscription listing what it does
  not deliver is refused (2.3.1, 3.1.2).
  - It now lists the three limits the server enforces, with the numbers
    taken from the plan.
  - It shows the renewal terms of whichever store takes the money, and
    links to the terms and the policy.
  - "Restore purchase" says there is nothing yet, instead of doing nothing.
- **Reporting** (guideline 1.2): "Report this entry" in an entry's menu,
  and "Report" on somebody else's comment (`app/report.tsx`).
  - `POST /families/{id}/reports` goes through the event's own visibility
    first. A missing comment answers the same as a hidden one.
  - Not your own; once while open; at most 20 an hour.
  - The admins who can see the entry get `content_reported`, without the
    reporter and never the author of what was reported.
  - The operator reads every report with `npm run reports`.
  - Data model and API docs say the same. The KPI list has
    `content_reported`, and lost `story_shelf_played`, whose shelf is gone.
- **"Write to us"** in Settings, from the build's support address.
- **The listing in both languages** (`docs/store/listing.md`):
  - the name, subtitle, keywords and descriptions, within the stores'
    limits (`count.mjs`);
  - the App Privacy and Data safety answers, drawn from what the code
    keeps;
  - the age rating answers;
  - notes for the reviewer;
  - screenshots and Google's feature graphic from the sample family
    (`tools/store/screenshots.mjs`).

### 103. Blocking somebody ✅

Guideline 1.2's standard rejection asks for five things: terms that rule out
objectionable content and abusive users, a filter, reporting, blocking, and
action on a report within 24 hours. Item 102 had reporting; an admin could
remove a member, but nobody else could do anything about anybody.

- **Anybody blocks anybody** - an admin too - but themselves and a child
  profile, from that person's profile or from one of their entries (`Block
  the author`). Unblocking is on the profile. Nobody is told.
- **Hidden for the blocker alone** (`MemberBlock`, docs/02-DATA-MODEL.md,
  Blocks):
  - their entries, through a branch in `eventFilter` itself, so the
    timeline, the calendar and its feed, search, the AI and the bell all
    have it;
  - their comments, and their reactions and comments in every count;
  - the bell's notifications about what they did, those written before the
    block too.
- **The app mirrors it** for the sample family and for the moment before
  the next load: `canSee(event, me, blocked)`, `withoutBlocked`, `bellFor`.
- **The person's own:** in their export (`peopleYouBlocked`), and deleted
  with their account.
- **The terms** now say there is no tolerance for objectionable content or
  abusive users, explain blocking, and promise action on a report within
  [24 hours], which needs the operator to read the reports daily. The
  privacy policy says what a block keeps.
- **The LAN host migrates before it builds.** The new timeline query reads
  the block table, so `install.ps1` takes a backup and runs `prisma migrate
  deploy` before building the api. Built without it, the api would have
  answered every timeline with an error.

### 104. A support page outside the app ✅

Apple asks for a Support URL with a way to reach the developer, and Google
for an account-deletion page that works for somebody who no longer has the
app. `/support` is both, in two languages, open without an account
(`lib/routes.ts`): where to write (the build's support address), how to
report, how to block, and how to delete an account and what that removes -
at `/support#delete`. The welcome page links to it beside the policy and
the terms.

### 105. Premium that the stores sell ✅

The paywall was a mock-up that turned Premium on in one phone. The App Store
and Google Play sell it now, through RevenueCat, with the family's id as the
customer: a purchase belongs to the family, and every member sees it. The
server never believes a request about a purchase; the app's "read me again"
after buying and RevenueCat's webhook both end in the server asking
RevenueCat (docs/02-DATA-MODEL.md, Subscriptions). Whether a family has
Premium checks the date, because a webhook can be late. The paywall shows
the store's prices and periods, restores, and manages; deleting an account
says it does not cancel the subscription.

### 106. Invitations that open the app ✅

On a phone an invitation was `famstory://join/...`, which opens nothing for
somebody without the app. With the site set, it is `https://famstory.lv/join/...`:
the app where it is installed (associated domains, verified app links), the
web app where it is not. Password reset links the same. The site's
`.well-known` answers come from the server's `.env`.

### 107. A rating at a good moment ✅

The research (docs/11-MARKETING.md) says to ask after a good moment, not at
launch. After somebody's fifth own entry the app asks the store, once; the
store decides whether to show anything.

### 108. The legal texts, finished but for the company ✅

Every blank but the company's details was decided and listed for the lawyer
(docs/legal/README.md); the company's details are `{{tokens}}` filled from
`docs/legal/facts.json`. What the texts promise is in the code: reports and
the audit log are deleted after 12 and 24 months, and a closed family a year
after it closed, with its photographs.

### 109. Consent that is recorded ✅

Sign-up records which version of the terms and the privacy policy it showed,
and a new version is asked for once after sign-in (`app/terms.tsx`). Health
information - the DPIA's one high risk - needs explicit consent before the
first entry in the Health category, kept on the account, withdrawable in
Settings, and the server refuses without it.

### 110. The account App Review signs in with ✅

`npm --prefix apps/api run reviewer`: a family with entries, comments, a child
profile and a relative to report and block, the password printed once.

### The review of 2026-10-10 (items 111-118)

Every screen pictured - phone and computer, Latvian and English, light and
dark, about 120 views - with a check for errors, overflow, cut-off text and
small targets, then the new family's road walked by hand. No screen threw;
what turned up was layout, and copy that promised what the app does not do.

### 111. Search: the filters were squeezed to nothing ✅

The strips of people and kinds above the results are ScrollViews, which
shrink by default; with a list of results below them they were a few pixels
tall, cut in half or gone. They keep their height now, as the timeline's
audience filter always did.

### 112. A list row cut its title and broke its date ✅

In search and the month's recap a row had one line for the title and the
comment count beside the details, so "Emīlijas pirmā skolas diena" ended at
"Emīlijas pirmā skol..." and the date broke over three lines. Two lines for
the title; the details wrap as whole pieces, the count as the timeline's
bubble and number.

### 113. Settings said "encrypted at rest" ✅

The privacy card claimed encryption in transit and at rest; the privacy
policy and 06-PRIVACY-GDPR.md say, correctly, that nothing is encrypted at
rest beyond what the host does. The card now says what is true.

### 114. Three promises the app did not keep ✅

"You can belong to more than one family later" (the app shows one; the join
screen tells somebody who is already in a family so), "a child profile hands
over later" (it cannot; item 19 is still a question for the lawyer), and
"the family's name can be changed later" - the one that is now kept: an
administrator's pencil on the Family tab (`app/family/edit.tsx`), and the
server checks the name it is given (1-60 characters; before, "   " was saved
as an empty name).

### 115. "Send by email" sent nothing ✅

The server has no mail sender, so the button made the invitation, showed its
code, and nobody received anything - while the person who pressed it
believed an email had gone. It opens their own mail app now, addressed and
written in their language; without one, it shares like the link.

### 116. Small things ✅

The page was white until the app drew - a flash for everybody in dark mode;
it is the app's ground from the first paint now. The profile's role badge
moved under the address, which had room for "anna.berg..." beside it. The
bell's "Done" says what it does ("Mark all read"). "Tu jau esi Bergu ģimene"
("you already are the Berg family") is "Bergu ģimenē" now. A notification no
longer reads "18. novembris. · Šodien". The life story's "Answer" has the
touch area the rest have.

### 117. The welcome page, on release day ✅

It said "App Store and Google Play: coming soon" with no way to change that
but the code. Two addresses in the server's `.env` (`APP_STORE_URL`,
`PLAY_STORE_URL`) put a button for each store there instead.

### 118. The server believed what it was sent ✅

The request bodies are TypeScript interfaces, so the ValidationPipe had
nothing to check them against and nothing else did: an empty or a 100 KB
title was saved, a number where text belongs was a 500, a start that was not
a date was a 500, and a category the app does not know was saved - and then
every member's timeline threw, because every card looks its category up.
`api/src/common/input.ts` checks titles, descriptions, categories, dates,
tags, comments, and the names of people, groups and the family, with limits
about twice the app's own fields; the app reads an unknown category as
"Other" in any case, and its description, comment and group-name fields now
have limits too. The rest of the request bodies are the penetration test's
to look at.

### 119. Pushes, with nothing of the family's in them ✅ *(live once the keys exist)*

The bell reached nobody who had not opened the app (item 7's last gap). The
server now knocks on the phones of exactly the people the bell chose -
`NotificationsService.write()` hands them to `modules/push` - straight
through Apple's APNs and Google's FCM, with the keys from the two developer
accounts (runbook §3.9, §4.9): no Expo push service, no third company.
What reaches a lock screen is one line per kind ("You have a reminder"),
never a title, a name or a comment: the privacy policy promises that what a
family writes never leaves the EU, and Apple's and Google's servers are not
in it. The app asks for permission where it makes sense - saving an entry
with a reminder, or the switch in Settings - never at the first launch;
a tap opens the entry, through the visibility check like any other time.
Signing out removes the phone; a phone Apple or Google calls gone removes
itself; one unused for 180 days is swept.

### 120. "Forgot your password?" by email ✅ *(live once a sender exists)*

A family admin who forgot their own password had nobody to ask. Where the
server has an SMTP sender (runbook §1.4), the sign-in screen's question
opens `(auth)/forgot.tsx`: a link to the account's address, once, for an
hour, built on the server's own site and never the request's Host. The
reply is the same with or without an account, and so is its timing - the
lookup happens after the reply. Without a sender, as on the LAN host, the
same screen sends people to the admin, as before.

### 57. Photographs, still ✅ *(done as item 6)*

Item 6 and item 16 say the same thing from two directions: the picker works,
nothing uploads, and the attachment URL points at an endpoint that only reads.
It is listed again here because of what it means rather than what it costs — a
family memory product whose photographs live on one phone is a demonstration,
not a product, and every other item on this page is worth less until it is done.

---

## Tier 4 — product questions worth instrumenting rather than guessing

### 17. Is a 50-event free limit right?

At the KPI rate of 5–10 events a month that is five to ten months before the
paywall. That may be exactly right for accumulating value, or far too generous
for conversion. `limitPressure()` already exists — instrument it and let the
beta answer instead of arguing about it.

### 18. Should families be able to add their own categories?

The ten life-cycle categories are a differentiator precisely because they are
structured. Letting families invent their own would weaken the archive and the
future AI classification. The data model allows it; the product probably should
not, at least not in V2. Worth deciding deliberately rather than by drift.

### 19. Children growing up

Still unanswered, and it is a legal question rather than a technical one.
Recorded in `06-PRIVACY-GDPR.md`: can a child profile become an account at 16,
do they gain retrospective access, and can they demand deletion from a parent's
chronicle? The last one pits the child's right to erasure against the parent's
right to their own family memory. This needs a lawyer before public launch.
