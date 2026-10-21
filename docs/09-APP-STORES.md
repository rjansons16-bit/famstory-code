# To the App Store and Google Play

Written 2026-10-01, when the owner asked for the app to be ready for both stores.
`08-LAUNCH-PLAN.md` put the stores after a web beta (its "launch B"). The
owner has chosen to start on them now.

**The owner's decisions (2026-10-01):**

| Decision | Choice |
|---|---|
| Who owns the store accounts | A company (SIA) |
| The server | Later. Until it exists, a phone build runs on the sample family |
| Premium | In the first store version |
| Testing | On an iPhone |

> **2026-10-08: everything the code can do is done.** Premium through
> RevenueCat, links that open the app, the legal texts but for the
> company's details, consent to the terms and to health information, the
> App Review account and the listing. What is left is the owner's, step by
> step: **docs/12-LAUNCH-RUNBOOK.md**. The sections below are the history of
> how it got here.

---

## 1. Where it stands

- **One codebase for both phones** (Expo SDK 57). On 2026-10-01 the iOS and
  Android bundles compiled (`npx expo export --platform ios --platform android`):
  6.2 and 6.4 MB of Hermes bytecode, no errors.
- **Native configuration** (`app.json`, `eas.json`, `app.config.js`):
  - `lv.famstory.app` on both platforms, version 1.0.0, phone only
    (`supportsTablet: false`, so there are no iPad screenshots and no iPad review).
  - Purpose strings in Latvian and English for exactly two things, the photo
    library and the microphone. There is no camera (the app only picks from
    the library), and no Face ID: expo-secure-store adds that string by
    default, and the app never asks.
  - `ITSAppUsesNonExemptEncryption: false`, because the app only uses HTTPS.
  - EAS profiles: `preview` for internal installs, and `production` with
    remote build numbers that count up by themselves.
  - `app.config.js` refuses a production build without an https API
    address. Without one the app would run on the sample family, and it
    would ship that way silently.
- **Web-only code is guarded.** Every `window`/`document` use sits behind
  `Platform.OS === 'web'`. Five modules have native twins (`*.web.ts` /
  `*.ts`), and the recorder, player and film have `.native.ts`. Dictation is
  web-only and hides on a phone. Both iOS and Android have dictation on the
  keyboard, so nothing is lost.
- **Already in the app:** account deletion (both stores require it), data
  export, and drafts of the privacy policy and terms in Latvian and English
  (`docs/legal/`).
- **The name.** On 2026-10-01 no app called FamStory was in the App Store
  (lv, us, gb) or Google Play. The name is only reserved once the app record
  exists in App Store Connect. thefamstory.com announces apps of its own.

## 2. The critical path is the owner's

These steps take the longest, and none of them can be done from here.
Approximate costs are in brackets.

1. **The company** can sign Apple's and Google's agreements and receive
   payments.
2. **A D-U-N-S number** for it (free). It comes through Apple's D-U-N-S
   lookup in about five working days, or from Dun & Bradstreet in up to 30.
   Both stores ask for it from an organisation.
3. **A domain and a public website** (famstory.lv, ~EUR 10/year). Apple's
   organisation enrolment checks that the company has a website. The same
   site carries the privacy policy, the terms, a support address and the
   account-deletion page that Google asks for. One page is enough to start.
4. **Apple Developer Program, as the organisation** (USD 99/year). Needs the
   company's legal name, the D-U-N-S number, the website, and a person with
   authority to sign for the company.
5. **Google Play Console, as an organisation** (USD 25, once). Organisation
   accounts do not have the 12-testers-for-14-days rule that new personal
   accounts have.
6. **An Expo account** (free). The builds run on EAS, because an iPhone app
   cannot be built on Windows.
7. **For Premium:**
   - In App Store Connect: the Paid Applications agreement, the tax form
     (W-8BEN-E for a company outside the US) and a bank account.
   - In Google: a payments profile.
   - Apple and Google sell the subscription as merchant of record and handle
     the VAT on store sales.
8. **The server.** Later, by decision: a VPS in the EU, the database, the
   photographs, HTTPS (`tools/deploy/`, `08-LAUNCH-PLAN.md` §2.1). A store
   build cannot be submitted without it. App Review signs in.

## 3. What the app still needs

### 3.1 Before the first build on a phone

- **Expo Go on the iPhone, now, with no accounts.** Metro runs on this
  laptop on 8082, because the LAN host holds 8081. The phone is on the same
  Wi-Fi, or in the tailnet. This is the first time the native app runs at
  all, so expect native-only bugs. Expo Go only runs the SDK it was built
  for: if the App Store's Expo Go has moved past SDK 57, it is a
  development build instead.
- ~~A development build (`expo-dev-client`)~~ - not needed (2026-10-08):
  RevenueCat's SDK runs in Expo Go in its own preview mode, and real
  purchases are tried in TestFlight and Play's internal track
  (12-LAUNCH-RUNBOOK.md §7).

### 3.2 Premium

- ✅ **Built on 2026-10-08, through RevenueCat** (docs/02-DATA-MODEL.md,
  Subscriptions): the family's id is the app user id, the server reads the
  truth from RevenueCat after a purchase and on every webhook, and the
  paywall shows the store's prices. The choice, as it was weighed:
- **Purchases** go through StoreKit and Play Billing. There are two ways in:
  - **RevenueCat** (recommended for one person). It validates receipts,
    follows renewals, grace periods, refunds and the cross-platform state,
    and calls our server's webhook. It is one more account, and one more
    processor (a DPA is available). It only sees an opaque user id.
  - **Directly**: `expo-iap` in the app, Apple's App Store Server Library
    and Server Notifications v2, and the Play Developer API with real-time
    notifications through Cloud Pub/Sub. No third party, but much more code
    that can only be tested with real accounts. The schema was written with
    this in mind: `Subscription.appleOriginalTxId` and `googlePurchaseToken`.
- **The paywall** (`app/premium.tsx`) is still a mock-up. It turns Premium on
  in the phone only (`TODO(api)`), and "Restore" does nothing. App Review
  guideline 3.1.2 asks for:
  - prices from the store, not from `domain/plans.ts`;
  - the length of each period;
  - the auto-renewal terms;
  - working links to the privacy policy and the terms;
  - a "Restore purchases" that restores.
- **The server** decides. A verified purchase or renewal updates the
  family's `Subscription`. The plan follows it, and the app never sets it
  on its own.
- **Products**, one subscription group in each store:
  - `famstory.premium.monthly` (EUR 4.50);
  - `famstory.premium.annual` (EUR 45).
  - Apple's price points end in .49 and .99, so the price is chosen in
    the console.

### 3.3 What App Review will look for

- **Privacy policy inside the app** (5.1.1), and the terms with it. Done
  (§4, step 1).
- **User-generated content** (1.2). Family members post entries, comments
  and photographs, and the standard rejection asks for:
  - terms that rule out objectionable content and abusive users (done);
  - a way to report a post or a comment (done);
  - a way to block somebody (done, 2026-10-07; 07-IMPROVEMENTS item 103);
  - a filter: in a family nothing is public, only members invited by each
    other see anything, admins remove entries, comments and members, and a
    block filters a person out of one's own view. The notes for App Review
    say so;
  - action on a report within 24 hours, which is the operator reading
    `npm run reports` every day;
  - published contact information (Settings, "Write to us").
- **A reviewer account** on the production server, with a family in it.
  Its address and password go in App Review's notes, never in the
  repository. ✅ `npm --prefix apps/api run reviewer` (2026-10-08).
- **Invitations** need to be https links on the domain that open the app:
  associated domains on iOS, app links on Android. `famstory://` does not
  open for somebody who does not have the app yet. ✅ 2026-10-08: with
  `EXPO_PUBLIC_SITE_ORIGIN` the app links `/join` and `/reset`
  (`app.config.js`), and the site answers from `.well-known` once the Team
  ID and the signing fingerprint are in the server's `.env`.
- **Push notifications** for reminders need an APNs key and FCM. Plan them
  for the second version: reviewers do not require them, and reminders
  already appear inside the app.

### 3.4 Google Play specifics

- **Target audience: adults.** The app is not designed for children, and
  children have no accounts here. That keeps it outside the Families policy.
- **Data safety form and content rating** (IARC questionnaire).
- **An account-deletion web page.** Google asks for one that works without
  the app: `/support#delete` (`app/support.tsx`, 2026-10-07), which opens
  without an account. The same page is Apple's Support URL.
- **Check the merged manifest of the first Android build.**
  - `READ_EXTERNAL_STORAGE` and `WRITE_EXTERNAL_STORAGE` come from
    libraries, not from `app.json`. An empty `android.permissions` does not
    remove them.
  - Blocking `READ_EXTERNAL_STORAGE` would also take away the image
    picker's own entry (`maxSdkVersion 32`), so it stays until it is tested
    on a device.
  - Play's photo and video policy is about `READ_MEDIA_*`, which should not
    be there.

### 3.5 The store listing (drafts can be written now)

- **Text, in Latvian and English:** the name, a subtitle (30 characters),
  the description, keywords (100 characters, Apple), promotional text, and
  notes for the reviewer.
- **Images:**
  - screenshots for the iPhone 6.9" set (1320 × 2868) and an Android phone;
  - Google's feature graphic (1024 × 500).
  - Screenshots from the web build are the same components. The final set
    should come from the native app.
- **Forms:** Apple's App Privacy answers, Google's Data safety answers, and
  the age rating. They are drawn from what the code collects (the audit in
  `06-PRIVACY-GDPR.md`, the telemetry with no person in it).

## 4. The order

1. **Now, with no accounts.** Done on 2026-10-01, except the iPhone:
   - **The privacy policy and terms inside the app.**
     - `app/legal/[doc].tsx` shows them without an account and without
       the notes for the lawyer.
     - The texts come from `docs/legal/` (`npm run legal`), including
       the new `terms-of-use.lv.md`.
     - They are linked from Settings, the paywall, the sign-up and the
       welcome page.
   - **The paywall's disclosures.**
     - The renewal terms for whichever store takes the money, with links
       to the terms and the policy.
     - "Restore purchase" says there is nothing to restore until
       purchases exist.
     - The paywall lists only what the server enforces
       (`docs/store/listing.md` says what came off it).
   - **Reporting an entry or a comment** (`app/report.tsx`, the API's
     `modules/reports`, `ContentReport`). The family's admins are told
     without the reporter, and the operator reads every report with
     `npm run reports`.
   - **Blocking a member** (2026-10-07), on their profile or from one of
     their entries: what they add leaves the blocker's view, and nobody is
     told (`MemberBlock`, `modules/blocks`).
   - **"Write to us"** in Settings, from `EXPO_PUBLIC_SUPPORT_EMAIL`.
   - **A store build stops** without an https API, without a support
     address, and while any `[blank]` is still in the legal texts
     (`app.config.js` lists each one).
   - **The listing**, in both languages: `docs/store/listing.md`, with
     its limits checked by `docs/store/count.mjs`.
   - **Screenshots and the feature graphic**: `tools/store/screenshots.mjs`.
   - Still to do: Expo Go on the iPhone, which needs the owner's phone.
2. **When the Apple and Expo accounts exist:**
   - the development build;
   - purchases in the sandbox;
   - the first TestFlight build on the owner's iPhone.
3. **When the server exists:**
   - a production build against it;
   - the reviewer's account;
   - invitation links on the domain.
4. **Submission:**
   - App Review, usually one to three days, often with one round of
     questions;
   - Google's review, a few days for a new account.

The owner's path (company, D-U-N-S, enrolment) is usually two to four weeks.
Everything in step 1 runs alongside it.
