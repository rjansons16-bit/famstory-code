# Data protection impact assessment (GDPR Art. 35)

> **DRAFT, 2026-09-24.** The development side's assessment, written from the
> code, for the controller and a lawyer to complete, challenge and sign. Not
> legal advice. Processing activities are numbered as in
> [record-of-processing.md](record-of-processing.md).

## 1. Why one is needed

FamStory meets at least two of the criteria the EDPB guidelines (WP248 rev.01)
use for "likely to result in a high risk":

- **Vulnerable data subjects** — children, who are in most families' entries
  and cannot use the product or object to it themselves.
- **Sensitive and highly personal data** — photographs of children at home,
  family relationships, and **health information** families write as events
  ("dentist", "hospital", "vaccination"; there is a Health category).
- **Data about people who are not users** — relatives without accounts.

Two criteria are enough to make the assessment expected. It is done before
the beta, and repeated when something in section 5 changes.

## 2. What is processed

A private chronicle and calendar for one family (record of processing 3). The
people in it: account holders (adults), child profiles without accounts, and
anyone a family writes about. Scale at the beta: 50–200 families
(docs/00-PLAN.md §6). One server in the EU; no processors yet; no transfers
outside the EU/EEA; no external AI.

What makes this product's risk profile: **everything a family writes is
private by default and shown only to the audience each entry names**, enforced
in the database query (`VisibilityService.eventFilter`) and failing closed —
an unknown state hides. Two paths lead outside the family, both chosen by a
member: guest links (8) and calendar feeds (9).

## 3. Necessity and proportionality

| Principle | How it is met | Gap |
|-----------|---------------|-----|
| Lawfulness | Contract for account holders; legitimate interest for shared family content, security, usage counts, errors | **Art. 9 condition for health data** (R7); basis for non-users' data to confirm |
| Minimisation | No child accounts; birth dates and photographs optional; usage counts and error reports without a person; audit log without content; no external AI | — |
| Purpose limitation | No advertising, no sale, no model training (docs/06 §4) — also technical constraints | — |
| Accuracy | Members edit their own name, photograph and birthday; admins manage roles | — |
| Storage limitation | Usage counts 400 days, errors 90 days, guest links ≤30 days, 30-day deletion grace, backups ~35 days; ended sessions, dead invitations, reset links and old suggestions deleted daily (modules/housekeeping) | **The audit log has no retention period yet** — a decision, not a default |
| Rights | Export (free), correction, deletion with grace, objection switch for usage counts | Restriction and objection otherwise by email only |
| Transparency | The privacy policy draft; the audience shown on every card | **Non-users are not told they are in a family's chronicle** (R8) |

## 4. Risks

Likelihood and severity: low / medium / high. *Residual* is after the measures
already built.

| # | Risk | Likelihood | Severity | Measures in place | Residual |
|---|------|-----------|----------|-------------------|----------|
| R1 | **Outsider breach** of the server or its backups: children's photographs and health entries exposed | Medium | High | HTTPS; scrypt; token rotation; rate limits; signed 30-minute photo links; no public listing of anything; audit log; tested backups | **Medium** until encryption at rest, OS hardening and a penetration test (section 5) |
| R2 | **Wrong audience inside the family**: a parents-only appointment seen by grandparents | Medium | High | Audience required on every entry; server-side filter on every read, fail closed; children's entries parents-only by default; the audience printed on each card; smoke test of visibility at the database level; the conflict check fixed to respect it (2026-09-24) | Low |
| R3 | **A removed member keeps a copy** | Low | Medium | Nothing family-related stored on devices except the session and the text of an unsent draft; removal cuts the membership server-side | Low |
| R4 | **A guest link travels further than meant** — forwarded, posted publicly — with a child's photographs | Medium | High | Expiry at most 30 days; withdrawal at any time; a warning before a link for an event with a child; hashed tokens; rate limited; every view of a child's event audited; the page shows no participants, audience or comments; `X-Robots-Tag: noindex` | **Medium.** Option: forbid guest links for events with a child, or cap them at 1 day (**open question 6**) |
| R5 | **A calendar feed address leaks** (a shared calendar, a synced account) | Low | Medium | Per member, shows only what that member can see; reset at any time; dies when the member leaves or is erased | Low |
| R6 | **A child's interests later** — a grown child wants their childhood out of a parent's chronicle | Medium | Medium | Child profiles managed by an adult; access audited | **Open** (open question 5) |
| R7 | **Health data without a valid Art. 9 condition** | High | High | Explicit consent before the first entry in the Health category (2026-10-08): asked in the app, recorded on the account, withdrawable in Settings, enforced by the server | **Medium.** Consent covers the author and their children; another adult's health information and the meaning of a withdrawal are open question 4 for the lawyer |
| R8 | **Non-users do not know** they are in a family's chronicle | High | Low–medium | Content is visible only inside the family; any person can write to the controller | **Medium.** The policy has to say how a non-user asks; the family's responsibility belongs in the terms |
| R9 | **Usage counts re-identified** by joining the family id back | Low | Low | No person stored; fixed field list; 400 days; access limited to the team | Low |
| R10 | **Loss of data** — a disk dies, a migration goes wrong | Medium | High | Nightly backups; a restore tested every night | **Medium** until a copy exists somewhere other than the same machine |
| R11 | **Account takeover** — a guessed or reused password | Medium | High | Rate limits per address and account; slow hashes; 8-character minimum | **Medium**: no second factor, no email verification, no breached-password check yet |
| R12 | **Admin misuse** — an admin makes a password-reset link for another adult and signs in as them | Low | High | The link is one-time, 24 hours, and **the member is told it was made**; audited | Low–medium |
| R13 | **Marking someone as deceased** wrongly or maliciously | Low | Medium | Admins only; reversible; audited; ends the person's sessions | Low |
| R14 | **Dictated content reaches Google or Apple** - possibly health details or a child's name, spoken into an entry | Medium | Medium | Only on a press; a plain notice before the first use on each device, naming both companies; the voice-note alternative offered in the same sentence | **Medium.** Options: turn dictation off for events with a child in them, or off by default (**open question - README.md**) |
| R15 | **A voice note travels further than its event** | Low | High | The same audience and signed 30-minute links as photographs; never on a guest link; deleting removes the file | Low |

## 5. What is still to do, and by when

| Measure | Addresses | Before |
|---------|-----------|--------|
| Decide and implement the Art. 9 condition for health data (e.g. explicit consent at registration, recorded with the policy version) | R7 | Beta |
| Encryption at rest, OS hardening, automatic security updates on the server | R1 | Beta |
| An off-site backup copy | R10 | Beta |
| A retention period for the audit log (the rest is done, 2026-09-24) | Storage limitation | Beta |
| A penetration test | R1, R2, R4 | Public launch |
| Decide guest links for events with children | R4 | Beta |
| Email verification; a second factor for admins; breached-password check | R11 | Public launch |
| How a person who is not a user exercises their rights | R8 | Beta |
| The grown-child question | R6 | Public launch |
| Data processing agreements as providers are chosen | R1 | Before each provider |

## 6. Prior consultation

If R7 is still high when the beta starts, Art. 36 requires consulting the Data
State Inspectorate before processing. The intention is that it is not: the
measure is in section 5, before the beta.

## 7. Sign-off

| Role | Name | Date | Decision |
|------|------|------|----------|
| Controller | [ ] | [ ] | [ ] |
| Legal review | [ ] | [ ] | [ ] |
| DPO (if appointed) | [ ] | [ ] | [ ] |

Review again when: a processor is added, push or email or payments start,
the audience rules change, an external AI service is considered, or the beta
grows past [n] families.
