# Legal drafts — for a lawyer to review

> ⚠️ **None of this is legal advice.** These are drafts written from what the
> code actually does, so that the lawyer the study requires — *"have the
> solution reviewed legally before the public launch"* — starts from an
> accurate description instead of a blank page. On 2026-10-08 the owner asked
> for everything to be done but the company and the publishing, so every
> choice that had been left open was made by default (below, "Decided for the
> launch"). What is left are the company's own details, as `{{tokens}}`
> filled from [`facts.json`](facts.json), and the **Open questions**, which
> are still the lawyer's.

| File | What it is | Needed by |
|------|------------|-----------|
| [facts.json](facts.json) | The company's details the texts name, and their version | Once the company exists |
| [privacy-policy.md](privacy-policy.md) | What the app tells the people using it (English) | Before the beta |
| [privacy-policy.lv.md](privacy-policy.lv.md) | The same, in Latvian — the version most families will read | Before the beta |
| [terms-of-use.md](terms-of-use.md) | The agreement with an account holder, including the AI clause | Before the beta |
| [terms-of-use.lv.md](terms-of-use.lv.md) | The same, in Latvian | Before the beta |
| [record-of-processing.md](record-of-processing.md) | GDPR Art. 30: every processing activity, its basis, retention | Before the beta |
| [dpia.md](dpia.md) | GDPR Art. 35: the impact assessment children's data makes mandatory | Before the beta |
| [incident-response.md](incident-response.md) | What happens in the first 72 hours of a breach | Before the beta |

The privacy policy and the terms are also inside the app (`app/legal/[doc].tsx`): `npm --prefix apps/mobile run legal` fills them from `facts.json` and turns them into `src/legal/texts.generated.json`, without the draft notice and without the notes for the lawyer. A store build refuses to start while any fact is still empty (`app.config.js`).

## Filling in the company (once it exists)

`facts.json`, then `npm --prefix apps/mobile run legal`, then commit both:

| Field | What goes in |
|---|---|
| `company.name`, `company.registrationNumber`, `company.address` | From the Register of Enterprises: `SIA "…"`, the 11-digit number, the legal address |
| `inForceFrom` | The day the texts apply, `YYYY-MM-DD`: the day the app goes public |
| `hosting` | The server's company and country, as its contract names it: `Hetzner Online GmbH, Germany` |
| `mailbox` | The company keeping the support mailbox: the domain registrar's mail, Zoho (EU), Proton… |
| `mailer` | The company that sends the server's emails - the password links (`SMTP_URL` in the server's `.env`). The mailbox's own company when it sends; otherwise an EU sender, with its country: `Brevo (Sendinblue SAS), France` |
| `version` | `1.0`. Raise it with any change that matters: everybody signed in is asked to agree again. While any fact is empty the texts are a draft, and nobody is asked or recorded as agreeing to them |
| `email.*` | Already `support@`, `privacy@`, `security@famstory.lv` — one mailbox with three addresses is enough |

## Decided for the launch (2026-10-08)

Made without a lawyer, because the owner asked for everything to be ready
but the company. Each is in the texts and, where it is a period, in the code
(`apps/api/src/modules/housekeeping/housekeeping.service.ts`, `KEEP`). The
lawyer can change any of them; the text and `KEEP` change together.

| Choice | Why |
|---|---|
| An account of one's own from **16** | The GDPR's own age (Art. 8(1)), the same everywhere in the EU; Latvia's 13 would differ elsewhere. Younger children are profiles a parent manages, as they already were |
| Reports kept **12 months** from the report | Long enough to see a pattern of abuse; deleted daily after that |
| The audit log kept **24 months** | Long enough to answer what happened after an incident found late |
| A closed family kept **12 months**, then deleted with its photographs | Restorable on request for a year; then the data minimisation wins |
| Action on a report within **24 hours** | What App Review asks (guideline 1.2); the operator reads `npm --prefix apps/api run reports` every day |
| Notice periods: **30 days** for changed terms, **60 days** before the service ends, backups overwritten within **35 days** | The drafts' own suggestions. 35 days matches the backup rotation (7 daily + 4 weekly) |
| Liability: intent and gross negligence; otherwise capped at **twelve months of Premium** | A first draft; the note in the terms asks the lawyer to check it against consumer law |
| Prices: **the ones the store shows** | Apple and Google set the price points and sell the subscription; the terms do not repeat a number that could differ |
| **RevenueCat** (USA) checks purchases | The only transfer outside the EU, under the standard contractual clauses in its DPA; it never sees what families write |
| Encryption at rest: **not claimed** | The policy says the server and backups are in the EU and reachable only by us, and no more |

## What the lawyer is asked to decide

Collected from the drafts, so they can be answered in one conversation:

1. **Who is the controller** — a person or a company, and its details. Until
   then every draft says `[Controller]`.
2. **The role FamStory plays for the content families write** — controller
   for the service, with the families' own use under the household exemption
   (Art. 2(2)(c), Recital 18)? The drafts assume FamStory is the controller.
3. **The legal basis for hosting data about people who are not the account
   holder** — children, grandparents who have not joined. The drafts use the
   contract with the account holder for their own data and legitimate
   interest for the family's shared content; that needs confirming.
4. **Health data.** Families will write "dentist", "hospital", "vaccination";
   there is a Health category. That is Art. 9 data, often about children.
   *Built for the launch (2026-10-08):* explicit consent before the first
   entry in the Health category, recorded (`User.healthConsentAt`),
   withdrawable in Settings, and the server refuses a new health entry
   without it. Still open: health information about another adult in the
   family, and whether a withdrawal should hide or delete what was already
   written.
5. **When a child grows up** (docs/06-PRIVACY-GDPR.md §1): may a profile
   become an account at 16, and may the grown child demand erasure from a
   parent's chronicle?
6. **Guest links**: an address that is itself the permission, including for
   events with a child in them. Acceptable with the warnings and limits
   described in the DPIA, or should events with a child be excluded?
7. **Consumer law**: withdrawal rights and the wording of liability limits for
   Premium, once there are payments.
8. **Dictation** (added 2026-09-25): the browser sends dictated sound to Google
   or Apple. Is a notice before the first use enough, and should it be off for
   events with a child in them (DPIA R14)?

## What must also exist before launch (not drafts, but work)

- Data processing agreements with every provider: the hosting company's
  (Hetzner's is accepted in its console), the mailbox's, the email sender's
  when it is another company (`mailer`), RevenueCat's (part of its terms),
  and Firebase's terms for Android pushes (accepted in the Firebase console;
  Apple's pushes come under the developer agreement). Pushes carry nothing
  the family wrote (record-of-processing.md, section 16). There is no AI
  provider.
- ✅ A consent step at registration that records which version of the privacy
  policy and terms was accepted, and asks again after a new version
  (docs/06-PRIVACY-GDPR.md §2, "Consent").
- A security review with a penetration test (docs/06-PRIVACY-GDPR.md §5).
