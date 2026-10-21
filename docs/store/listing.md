# The store listing

Drafts for App Store Connect and the Google Play Console, written 2026-10-01
and completed for the launch on 2026-10-08 (`docs/09-APP-STORES.md` §3.5,
`docs/12-LAUNCH-RUNBOOK.md`). Character limits are the stores'.
`node docs/store/count.mjs` checks them after an edit.

Nothing here promises what the app does not do.

**Premium is what the server enforces.** On 2026-10-01 the paywall still
listed five things, and only one of them (unlimited events) was real. The
other four existed only as flags in `domain/plans.ts`:

- the PDF chronicle (`canExport`);
- video (`canUploadVideo`, while the picker takes images only);
- more groups (`maxCustomGroups`, which nothing checks);
- the summaries (`canSummarize`).

A subscription that lists a feature it does not deliver is refused under
App Review 2.3.1 and 3.1.2. The paywall now lists the three limits the
server enforces (`events.service.ts`, `uploads.service.ts`):

- unlimited events, where the free plan keeps 50;
- up to 20 photographs per event, where the free plan allows 3;
- up to 10 voice notes per event, where the free plan allows 2.

The others come back to the paywall, and to the text below, when they
exist.

**Where the Latvian goes.** Apple has no Latvian among its listing
languages (checked 2026-10-08), so App Store Connect gets English. The
Latvia storefront shows one of the English listings - English (U.K.) as far
as is known; App Store Connect's localization table says for sure - and its
keyword field, which nobody sees, carries the Latvian words. Google Play has
Latvian (lv-LV), so it gets the Latvian text in full.

---

## App Store

| Field | English (U.S.), the primary language | English (U.K.), the Latvia storefront |
|---|---|---|
| Name (30) | FamStory: Family Memories | FamStory: Family Memories |
| Subtitle (30) | Your family's story & calendar | Your family's story & calendar |
| Category | Lifestyle; secondary: Social Networking | |
| Keywords (100) | album,photos,timeline,birthdays,kids,grandparents,journal,diary,planner,organizer,reminders | ģimene,ģimenes,albums,bildes,dzimta,dzimšanas,vecvecāki,mazbērni,hronika,kalendārs,atmiņas |

Apple searches the name and the subtitle as well, so the keywords do not
repeat "family", "memories", "story" or "calendar" in English.

### Promotional text (170)

Apple's field, so the English is what goes in; Google Play has none. The
Latvian is for the website and the social posts.

**EN:** One private place for your family: plans and memories on one
timeline, and you choose who sees each moment.

**LV:** Viena privāta vieta tavai ģimenei: plāni un atmiņas vienā laika
līnijā, un tu izvēlies, kurš redz katru brīdi.

### Description (4000)

**EN**

FamStory is a private place for one family: what is coming and what has
happened, on one timeline.

PLANS AND MEMORIES TOGETHER
- One timeline for the whole family: the dentist on Tuesday, and the first
  day of school three years ago.
- A calendar with birthdays that count themselves, from the family's own
  dates.
- Reminders for the people an event is for.

YOU CHOOSE WHO SEES WHAT
- Each moment says who it is for: the whole family, the parents, the
  grandparents, or only you. The server enforces it, not only the app.
- Children have no accounts. A parent looks after a child's profile, and
  entries with a child in them are for the parents unless a parent widens
  them.

THE FAMILY'S OWN VOICE
- Photographs, and voice notes: a grandmother tells the story instead of
  typing it.
- Time capsules that open on the day you choose.
- Birthday surprises the whole family writes in secret.
- A grandparent's life story, one question at a time.

PRIVATE BY DESIGN
- Nothing is public. Nothing is sold, there are no ads, and nothing you
  write trains an AI model.
- Download everything your account is, or delete it, in the app, at any time.

FAMSTORY PREMIUM
The free plan keeps up to 50 events, with 3 photographs and 2 voice notes
in each. Premium removes the limit on events and lets each one hold up to
20 photographs and 10 voice notes. Premium is a subscription, monthly or
yearly, through your Apple ID. It renews automatically unless it is turned
off at least 24 hours before the end of the period, and you manage it in
your Apple ID settings.

Terms of use: https://famstory.lv/legal/terms
Privacy policy: https://famstory.lv/legal/privacy

**LV**

FamStory ir privāta vieta vienai ģimenei: tas, kas gaidāms, un tas, kas jau
noticis, vienā laika līnijā.

PLĀNI UN ATMIŅAS KOPĀ
- Viena laika līnija visai ģimenei: zobārsts otrdien un pirmā skolas diena
  pirms trim gadiem.
- Kalendārs ar dzimšanas dienām, kas saskaitās pašas no ģimenes datumiem.
- Atgādinājumi tiem, kam notikums paredzēts.

TU IZVĒLIES, KURŠ KO REDZ
- Katrs brīdis pasaka, kam tas ir: visai ģimenei, vecākiem, vecvecākiem vai
  tikai tev. To nodrošina serveris, ne tikai lietotne.
- Bērniem nav kontu. Bērna profilu pārvalda vecāks, un ierakstus, kuros ir
  bērns, redz vecāki, ja vien kāds no vecākiem tos neatver plašāk.

ĢIMENES PAŠAS BALSS
- Bildes un balss ieraksti: vecmāmiņa stāsta, nevis raksta.
- Laika kapsulas, kas atveras tevis izvēlētā dienā.
- Dzimšanas dienas pārsteigumi, ko visa ģimene raksta slepus.
- Vecvecāku dzīvesstāsts pa vienam jautājumam.

PRIVĀTA PĒC BŪTĪBAS
- Nekas nav publisks. Nekas netiek pārdots, nav reklāmu, un nekas, ko
  raksti, neapmāca mākslīgo intelektu.
- Lejupielādē visu, kas ir tavs konts, vai izdzēs to lietotnē jebkurā brīdī.

FAMSTORY PREMIUM
Bezmaksas plānā var glabāt līdz 50 notikumiem, katrā 3 bildes un 2 balss
ierakstus. Premium noņem notikumu ierobežojumu, un katrā notikumā var būt
līdz 20 bildēm un 10 balss ierakstiem. Premium ir abonements uz mēnesi vai
gadu caur tavu Google Play kontu. Tas atjaunojas automātiski, ja vien to
neatceļ vismaz 24 stundas pirms perioda beigām, un to pārvaldi Google Play
sadaļā Abonementi.

Lietošanas noteikumi: https://famstory.lv/legal/terms
Privātuma politika: https://famstory.lv/legal/privacy

### URLs

| | |
|---|---|
| Support URL | https://famstory.lv/support - the web app's own page (`app/support.tsx`): where to write, reporting, blocking, deleting an account |
| Marketing URL | https://famstory.lv/ |
| Privacy policy URL | https://famstory.lv/legal/privacy - the web app's own page (`app/legal/[doc].tsx`) |
| Terms of use (EULA) | https://famstory.lv/legal/terms, linked from the description, as Apple's standard EULA is not used |

### App Privacy

These answers are conservative: when in doubt, the data is declared as
linked to the person. Tracking: **No**. There are no ads, no data brokers
and no cross-app identifiers. RevenueCat processes the purchase rows for us
(docs/legal/record-of-processing.md, 3e); that is not tracking either.

| Data type | Purpose | Linked to the person |
|---|---|---|
| Contact info: email address | App functionality (the account) | Yes |
| Contact info: name | App functionality (shown to the family) | Yes |
| Health and fitness: health (what somebody writes in the Health category, with their consent) | App functionality | Yes |
| User content: photos or videos | App functionality | Yes |
| User content: audio data (voice notes) | App functionality | Yes |
| User content: other (entries, comments, wish lists, reports, whom you blocked) | App functionality | Yes |
| Identifiers: user ID (the account, and the family's id at RevenueCat) | App functionality | Yes |
| Identifiers: device ID (the phone's push token, only after notifications are allowed) | App functionality | Yes |
| Purchases: purchase history (whether the family has Premium, and until when) | App functionality | Yes |
| Usage data: product interaction (counts, with the family they happened in) | Analytics | Yes - the family id is a thread back to people, even with nobody named; off by the switch in Profile |
| Diagnostics: crash and other diagnostic data (scrubbed, tied to nobody) | App functionality | No |

### Age rating answers

- None of the content categories (violence, sexual content, profanity,
  gambling, horror, drugs, medical) is in the app. What families write in
  the Health category is their own, not content the app supplies.
- **User-generated content: yes, private.** It is seen only by members of
  a family, who invite each other. There is reporting and blocking, and the
  family's admins can delete entries and comments and remove members.
- **Messaging or chat: no.** Comments sit under a family's entries; there
  are no direct messages and nothing reaches strangers.
- Unrestricted web access: no. Advertising: no. Age assurance or parental
  controls inside the app: no - a child has no account.

### In-app purchases

One subscription group, **FamStory Premium**, with two auto-renewable
subscriptions of the same level:

| Product ID | Reference name | Period | Price |
|---|---|---|---|
| `famstory.premium.monthly` | Premium monthly | 1 month | EUR 4.49 (the euro price point nearest 4.50) |
| `famstory.premium.annual` | Premium yearly | 1 year | EUR 44.99 |

- Display name: "FamStory Premium". Description: "No limit on events; up to
  20 photographs and 10 voice notes in each."
- The review screenshot is the paywall (`tools/store/screenshots.mjs`), and
  the review note: "Premium is sold to the whole family; the server unlocks
  it after RevenueCat confirms the purchase. The review account can buy it
  in the sandbox."
- No introductory offer at the launch. One added later shows on the paywall
  by itself (`domain/store-offer.ts`), with what follows it.

### Notes for App Review

```
FamStory is a private family chronicle and calendar. Everything is shared
only inside a family that the user creates or is invited to; nothing is
public.

Sign in with: appreview@famstory.lv / <the password `npm run reviewer` printed>
This account is the admin of a sample family: entries, comments, a child
profile, and two relatives.

- User-generated content (guideline 1.2): nothing in FamStory is public.
  Only people a family invites see anything, and the terms of use, which
  everybody agrees to on sign-up, allow no objectionable content and no
  abusive users.
  - Report: open Martin's entry "Fishing at the lake", then "..." > "Report
    this entry"; on a comment, "Report". The family's admins are notified,
    and the report reaches us; we act on it within 24 hours.
  - Block: "..." > "Block the author" on Martin's entry, or Family > Martin >
    Block. His entries, comments and reactions are hidden from you, and you
    get no notifications about them. Unblock on his profile.
  - Admins can delete any entry or comment, and remove a member (Family >
    member > Remove from family).
  - Contact: Profile > Settings > Write to us, or support@famstory.lv.
- Account deletion (5.1.1(v)): Profile > Settings > Delete account. It can
  be undone by signing in within 30 days, as the screen says.
- Privacy policy and terms in the app: Profile > Settings > Legal.
- Health information: the first entry in the Health category asks for the
  user's consent first (GDPR Art. 9).
- Premium: Profile > Plan, or reaching the free limit. Monthly and yearly
  auto-renewing subscriptions through StoreKit; "Restore purchase" is on
  the same screen. A sandbox purchase unlocks Premium for the family.
```

The reviewer's account is made on the production server
(`npm --prefix apps/api run reviewer`, docs/12-LAUNCH-RUNBOOK.md) and its
password lives in App Store Connect and Play Console. Never in this
repository.

---

## Google Play

| Field | English | Latvian |
|---|---|---|
| App name (30) | FamStory: Family Memories | FamStory: ģimenes atmiņas |
| Short description (80) | A private place for your family's moments, plans, photos and birthdays. | Privāta vieta ģimenes brīžiem, plāniem, bildēm un dzimšanas dienām. |
| Category | Lifestyle | |
| Full description (4000) | As the App Store description, with "through your Google Play account" and "manage it in Google Play under Subscriptions" in the Premium paragraph | The Latvian description above |
| Contact email | support@famstory.lv | |
| Privacy policy | https://famstory.lv/legal/privacy | |

The default language is Latvian (lv-LV), with English (en-US) as the
second: most families who find it in Latvia read the Latvian.

### Subscriptions

One subscription, `famstory.premium`, with two base plans that renew:

| Base plan | Period | Price |
|---|---|---|
| `monthly` | 1 month | EUR 4.50 |
| `annual` | 1 year | EUR 45.00 |

RevenueCat names them `famstory.premium:monthly` and `famstory.premium:annual`,
and the server reads the period from that name (modules/subscriptions).

### Data safety answers

- **Collected:**
  - personal info (name, email address);
  - health and fitness: health info (what somebody writes in the Health
    category, with their consent);
  - photos and videos;
  - audio (voice recordings);
  - app activity (other user-generated content, and app interactions);
  - app info and performance (crash logs, diagnostics);
  - financial info (purchase history);
  - device or other IDs (the push token, once notifications are allowed).
- **Shared with third parties:** none. The service providers who process
  data for FamStory - the hosting, the email sender, RevenueCat, Apple's
  and Google's push services - are not "sharing" in Google's sense, and a
  push carries nothing the family wrote.
- **Optional:** health info, photos, voice recordings and usage counts. The
  person chooses whether to add them, and counting has a switch.
- **Purposes:** app functionality; analytics for app interactions only.
- **Encrypted in transit:** yes.
- **Deletion:**
  - People can delete their account in the app, in Settings.
  - Google asks for a web page that works without the app:
    https://famstory.lv/support#delete. It opens without an account, says
    how to delete in the app or a browser and what goes, and gives the
    address to write to when somebody cannot sign in.

### Target audience and content

- **Target age groups: 16-17 and 18+**, as the terms set the age for an
  account of one's own (16). The app is not designed for children and is
  outside the Families policy, because children are profiles a parent
  keeps, not users.
- **Content rating (IARC):**
  - Users interact: yes, inside a private family.
  - Shares location: no.
  - Digital purchases: yes (Premium).
- **Ads:** none.
- **App access:** sign-in needed; the review account as for Apple, in
  "App access" with the same instructions.

---

## Screenshots

These come from the web build on the sample family, at the stores' sizes
(`tools/store/screenshots.mjs`):

- **iPhone 6.9"**, 1320 × 2868, in both languages.
- **Android phone**, 1080 × 2340, in both languages.
- **Google's feature graphic**, 1024 × 500.

The final set should come from the native app (TestFlight) once it runs,
since the stores want the app as it is.
