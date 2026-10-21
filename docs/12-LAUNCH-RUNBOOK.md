# From a company to the stores

Written 2026-10-08, when the owner asked for everything to be done so that
only founding the company and publishing the app are left. This page is the
publishing: every step, in order, from the day the SIA exists. Before it
come docs/10-COMPANY.md §5 (the company, the bank, the D-U-N-S number) and,
if the founder is under 18, the adult who signs for the company.

Nothing on this page can be done from the repository: each step is an
account, a payment, a signature or a choice that is the owner's. Everything
the steps need from the code is already in it (§0).

## 0. What is ready

| Part | Where |
|---|---|
| Premium sold by the stores, decided by the server | `modules/subscriptions`, `lib/purchases.ts`, `app/premium.tsx` |
| Links that open the app (invitations, password resets) | `app.config.js`, `tools/deploy/Caddyfile` (`.well-known`) |
| A production build that refuses to start until every setting below is in | `app.config.js`, `eas.json` (`base`) |
| The legal texts, finished but for the company's details | `docs/legal/facts.json`, `docs/legal/README.md` |
| Sign-up records the terms' version; health information needs consent | `POST /users/me/terms`, `User.healthConsentAt` |
| Reporting, blocking, account deletion, the support page | `app/report.tsx`, `modules/blocks`, `app/support.tsx` |
| The App Review account, made by a script | `npm --prefix apps/api run reviewer` |
| Pushes to phones, straight to Apple and Google, with nothing the family wrote in them | `modules/push`, `lib/push.ts` (keys: §3.9, §4.9) |
| "Forgot your password?" by email, and the family admin's link where there is no sender | `common/mail.service.ts`, `app/(auth)/forgot.tsx` (sender: §1.4) |
| The server: database, API, HTTPS, backups | `tools/deploy/` (tested with Docker on 2026-10-08) |
| The listing, the answers to the stores' forms, the screenshots | `docs/store/listing.md`, `tools/store/screenshots.mjs` |
| The marketing | `docs/11-MARKETING.md`, `docs/marketing/` |

## 1. The domain and the mailbox (day 1)

1. Buy **famstory.lv** from an accredited .lv registrar (about EUR 10 a
   year). It was free on 2026-09-27.
2. A mailbox for the company with three addresses on it:
   **support@**, **privacy@**, **security@famstory.lv**. The registrar's own
   mail, or an EU provider (Zoho EU, Proton). The texts already name these
   three; one inbox is enough.
3. Accept the mail provider's data processing agreement (in its settings),
   and write its name into `docs/legal/facts.json` as `mailbox`.
4. **Sending email** - the "Forgot your password?" links. The server needs an
   SMTP address that may send as `support@famstory.lv`: the mailbox's own if
   its plan sends (check that it allows SMTP for apps), or an EU sender with
   a free tier for a few hundred emails a day (Brevo, France, is one). Add
   the provider's DNS records for `famstory.lv` (SPF and DKIM - it shows
   them) so the links do not land in spam. Its name goes into `facts.json`
   as `mailer` (the mailbox's again if it is the same company), and its
   processing agreement is accepted like the mailbox's. The two lines for
   the server's `.env` (`SMTP_URL`, `MAIL_FROM`) come in §2. Until they are
   in, "Forgot your password?" sends people to the family admin, as on the
   laptop.

## 2. The server (day 1-2)

1. **Rent it:** Hetzner Cloud CX22 (2 vCPU, 4 GB, about EUR 4-5 a month) in
   Falkenstein, Nuremberg or Helsinki, Ubuntu 24.04, your SSH key. Accept
   Hetzner's data processing agreement in its console. Write
   `Hetzner Online GmbH, Germany` (or the provider you chose) into
   `facts.json` as `hosting`.
   - *Optional:* encrypt the server's disk (LUKS) at installation. The
     privacy policy does not claim it, so it is not required; it lowers the
     DPIA's risk R1.
2. **DNS:** an `A` record for `famstory.lv` to the server's address. Wait
   until `nslookup famstory.lv` answers with it.
3. **Install:** `tools/deploy/README.md`, "First start". The code reaches
   the server without touching GitHub: on the laptop
   `git bundle create famstory.bundle --all`, copy it with `scp`, and on the
   server `git clone famstory.bundle /opt/famstory`.
4. **`.env`:** copy `tools/deploy/.env.example`, fill `DOMAIN=famstory.lv`,
   `ACME_EMAIL`, `SUPPORT_EMAIL`, the four secrets
   (`openssl rand -base64 48` each), and `SMTP_URL` and `MAIL_FROM` from
   §1.4. The RevenueCat, app-link and push lines stay empty until §5 and
   §3-4.
5. **Start:** `docker compose -f tools/deploy/docker-compose.yml up -d --build`,
   then `curl -fsS https://famstory.lv/v1/health` must say `ok`.
6. **Backups:** `tools/deploy/README.md`, "Backups" - the cron line, and
   decide where the off-site copy goes (a Hetzner Storage Box is the
   simplest).
7. **The App Review account:**

   ```bash
   docker compose -f tools/deploy/docker-compose.yml run --rm migrate npx ts-node scripts/reviewer.ts
   ```

   It prints the address and a password once. Keep it for §8, nowhere else.
8. **The laptop's family**, if it moves too: `tools/deploy/README.md`,
   "Bringing the laptop's family across".

## 3. Apple (after the D-U-N-S number)

1. **Enrol as an organisation** at developer.apple.com (USD 99 a year): the
   SIA's legal name, the D-U-N-S number, the website (https://famstory.lv
   must answer by now), and a person who may sign for the company.
2. **App Store Connect → Business:** the Paid Applications agreement, the
   tax form (W-8BEN-E for a company outside the US), the bank account. Then
   join the **App Store Small Business Program** (15% instead of 30%).
3. **Trader status (EU Digital Services Act):** declare the company a
   trader; its address, phone and email appear on the EU App Store page.
4. **The app record:** My Apps → New App, bundle id `lv.famstory.app`,
   name "FamStory: Family Memories", primary language English (U.S.), SKU
   `famstory`. Add the English (U.K.) localization for the Latvia
   storefront (`docs/store/listing.md`, "Where the Latvian goes").
5. **The subscriptions:** a group "FamStory Premium" with
   `famstory.premium.monthly` and `famstory.premium.annual`, prices and
   texts from `docs/store/listing.md`, "In-app purchases". The first
   subscriptions are submitted together with the first app version.
6. **For RevenueCat:** Users and Access → Integrations → In-App Purchase:
   generate a key (.p8) and note its Key ID and the Issuer ID.
7. **For the app links:** Membership details → **Team ID** → server `.env`
   `APPLE_TEAM_ID`, then `docker compose ... up -d` (Caddy answers
   `/.well-known/apple-app-site-association` from then on).
8. **A sandbox tester:** Users and Access → Sandbox → a test Apple ID, for
   buying Premium in TestFlight without paying.
9. **For pushes:** Certificates, Identifiers & Profiles → Keys → "+", name
   "FamStory push", tick **Apple Push Notifications service (APNs)**,
   Continue, Register, **Download** (it can be downloaded only once). Server
   `.env`: `APNS_KEY_ID` = the key's ten characters, `APNS_KEY` = the file in
   base64 on one line (`base64 -w0 AuthKey_XXXXXXXXXX.p8`); the team is
   `APPLE_TEAM_ID` from step 7. Restart. The app's push capability itself
   is set by EAS when it builds (§7).

## 4. Google (in parallel with Apple)

1. **Play Console as an organisation** (USD 25 once), with the D-U-N-S
   number; verify the organisation and the developer's identity.
   Organisation accounts do not need the 12-testers test.
2. **A payments profile** for the company (Play Console → Settings →
   Payments profile), and the **trader status** declaration, as for Apple.
3. **The app:** Create app, "FamStory: Family Memories", default language
   Latvian (lv-LV), app, free with in-app purchases.
4. **App signing:** Play App Signing (the default). After the first upload
   (§7), Test and release → App integrity → App signing key certificate →
   **SHA-256** → server `.env` `ANDROID_CERT_SHA256`, then
   `docker compose ... up -d`.
5. **The subscription:** Monetise → Subscriptions → `famstory.premium`, base
   plans `monthly` (EUR 4.50) and `annual` (EUR 45), both auto-renewing.
6. **For RevenueCat:** a Google Cloud service account with access to the
   Play Console (RevenueCat's guide "Google Play service credentials" goes
   through it click by click), and real-time developer notifications to
   RevenueCat's Pub/Sub topic.
7. **The forms:** Data safety, content rating (IARC), target audience (16-17
   and 18+), ads (none), app access (the review account from §2) - every
   answer is in `docs/store/listing.md`.
8. **License testers:** Settings → License testing → your Google account, so
   test purchases cost nothing.
9. **For pushes - Firebase** (console.firebase.google.com, free): a project
   "FamStory", without Google Analytics; accept its data processing terms
   (Project settings → Privacy). Add an **Android app** with package
   `lv.famstory.app` and download **google-services.json**; in `apps/mobile`
   run `npx eas-cli env:create --name GOOGLE_SERVICES_JSON --type file
   --value ./google-services.json --visibility secret --environment production`
   (the file itself stays out of git). Then Project settings → Service
   accounts → **Generate new private key**: that JSON, in base64 on one line,
   is the server's `FCM_SERVICE_ACCOUNT`. Restart. Without
   google-services.json an Android store build stops (`app.config.js`).

## 5. RevenueCat (an hour)

1. An account at revenuecat.com (free until USD 2,500 a month in revenue,
   then 1%), a project "FamStory". Its DPA, with the standard contractual
   clauses, is part of its terms; the privacy policy already names it.
2. **Apps:** App Store (bundle id `lv.famstory.app`, the In-App Purchase key
   from §3.6) and Play Store (package `lv.famstory.app`, the service account
   from §4.6).
3. **Entitlement** `premium`, with all four products attached: the two
   Apple ids and `famstory.premium:monthly`, `famstory.premium:annual`.
4. **Offering** `default` (current), packages **Monthly** and **Annual**,
   each with its Apple and its Google product.
5. **Keys** (Project settings → API keys):
   - the Apple public key `appl_...` → `apps/mobile/eas.json`,
     `EXPO_PUBLIC_REVENUECAT_APPLE_KEY`;
   - the Google public key `goog_...` → `EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY`;
   - a **secret** key `sk_...` → server `.env` `REVENUECAT_SECRET_KEY`.
   The public ones are meant to be inside the app; the secret one never.
6. **Webhook** (Integrations → Webhooks): URL
   `https://famstory.lv/v1/webhooks/revenuecat`, authorization header value
   = a new `openssl rand -base64 48`, the same in `.env` as
   `REVENUECAT_WEBHOOK_AUTH`. Restart (`docker compose ... up -d`), then
   "Send test event": the server answers 200.
7. **Apple's server notifications** to RevenueCat: App Store Connect → the
   app → App Information → App Store Server Notifications, the production
   and sandbox URLs RevenueCat shows in the App Store app's settings.

## 6. The company's details in the texts (10 minutes)

1. `docs/legal/facts.json`: `company.name`, `company.registrationNumber`,
   `company.address`, `inForceFrom` (the launch day, `YYYY-MM-DD`),
   `hosting`, `mailbox`.
2. `npm --prefix apps/mobile run legal` must say `0 to fill in` four times.
   Commit.
3. Rebuild the server's web so https://famstory.lv/legal/privacy is the
   final text: `docker compose -f tools/deploy/docker-compose.yml up -d --build`.
4. A lawyer's reading is recommended before this day (docs/legal/README.md:
   the open questions, and the choices made for the launch).

## 7. Expo and the builds (a day)

In `apps/mobile`:

1. An Expo account (free), then `npx eas-cli login` and `npx eas-cli init`.
   It writes the project id into `app.json`: commit it.
2. The RevenueCat public keys from §5.5 into `eas.json`, `build.base.env`.
3. **iPhone:** `npx eas-cli build --platform ios --profile production`. The
   build stops with a list if anything is missing (`app.config.js`). EAS
   asks to sign in to Apple once and makes the certificates.
   `npx eas-cli submit --platform ios --latest` sends it to TestFlight.
4. **On the iPhone, from TestFlight:** sign up; sign in as the reviewer;
   buy Premium with the sandbox tester (§3.8) and see the family turn
   Premium; Restore; open an invitation link from another phone's message
   and see the app open; report and block as listing.md's review notes say.
   Then the two new ways in: save an entry with a reminder a few minutes
   ahead, say yes to notifications, lock the phone and wait for "Reminder"
   on the lock screen - tapping it opens the entry; and sign out, press
   "Forgot your password?", and set a new one from the emailed link.
5. **Android:** `npx eas-cli build --platform android --profile production`
   makes an `.aab`. Upload the first one by hand to an internal testing
   track in Play Console (then §4.4), test the purchase with a license
   tester, the reminder push as on the iPhone, and use
   `npx eas-cli submit --platform android` after that.

## 8. Submission

1. **Screenshots:** `node tools/store/screenshots.mjs` for the first set, or
   from the TestFlight app.
2. **App Store:** version 1.0 - screenshots, description, keywords,
   promotional text, support URL `https://famstory.lv/support`, privacy
   policy URL, App Privacy answers, age rating, the two subscriptions
   attached to the version, App Review Information with the reviewer's
   address and password and the notes from listing.md. Availability: all
   countries, or the EU first. Submit; review is usually one to three days,
   often with one round of questions.
3. **Google Play:** a production release with the same build, the listing
   in Latvian and English, countries as for Apple. A new organisation's
   first review takes a few days.
4. **Release day:** the two store addresses into the server's `.env`
   (`APP_STORE_URL`, `PLAY_STORE_URL` - `.env.example` says where each comes
   from), then `docker compose -f tools/deploy/docker-compose.yml up -d --build web`:
   the welcome page shows a button for each store instead of "coming soon".
   Then the press release (`docs/marketing/press.md`) and the plan in
   `docs/11-MARKETING.md` §3.

## 9. Every day after

- **Reports, within 24 hours** - the terms promise it, and App Review asked:
  `docker compose -f tools/deploy/docker-compose.yml run --rm migrate npx ts-node scripts/reports.ts`
  (or `npm --prefix apps/api run reports` through an SSH tunnel). Remove what
  breaks the terms; `--resolve <id>` when dealt with.
- RevenueCat's dashboard, App Store Connect and Play Console: purchases,
  crashes, reviews to answer.
- The backup log, once a week.

## Costs

| What | How much |
|---|---|
| The SIA (small capital) | EUR 20 + EUR 1 capital, once |
| An accountant | about EUR 30-60 a month |
| famstory.lv | about EUR 10 a year |
| A mailbox | EUR 0-3 a month |
| The server | about EUR 4-5 a month (+ EUR 4 for an off-site backup) |
| Apple Developer Program | USD 99 a year |
| Google Play Console | USD 25 once |
| Expo (EAS) | free tier: a limited number of builds a month |
| RevenueCat | free until USD 2,500 a month in revenue |
| Sending email (password links) | free tiers cover a few hundred a day; the mailbox's own may be free |
| Firebase (Android pushes) | free |
| A lawyer's reading of docs/legal | a one-off fee |

## What was and was not tried

Tried on 2026-10-08: every migration on an empty PostgreSQL and the schema
against them; the reviewer script, three ways; the subscription rows from
RevenueCat's answers; a closed family deleted with its files; the iPhone and
Android bundles; the server's images built and run with Docker (§0).

Tried on 2026-10-12: the push messages and both doors' signed tokens
(checked with keys made for the test), Google's two addresses with a
recording fetch, the reset email through a recording sender, the forgot
screen against the LAN host (no sender: the admin's way).

Not tried, because they need the accounts: a real purchase in a store's
sandbox, RevenueCat's real webhook, the app links verifying on a phone,
EAS building and signing, a push actually arriving on a phone, an email
actually leaving through a provider. §7.4 is where each is tried first,
before review.
