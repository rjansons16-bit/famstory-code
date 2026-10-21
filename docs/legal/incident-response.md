# When personal data may have leaked — the first 72 hours

> **DRAFT, 2026-09-24**, for the controller and a lawyer to adopt. GDPR Art.
> 33 gives **72 hours from becoming aware** to notify the Data State
> Inspectorate (Datu valsts inspekcija, DVI) of a breach likely to be a risk
> to people; Art. 34 requires telling the people themselves when the risk is
> high. This page is what to do so that the 72 hours are not spent working out
> what to do.

**A breach** is any loss of confidentiality, integrity or availability of
personal data: an entry shown to the wrong people, a leaked backup, a stolen
laptop with the database on it, a deleted family with no backup, an account
taken over. It does not need an attacker — a bug that showed a parents-only
event to a grandparent is one.

## Who

- **Incident lead:** [name, phone] — decides, keeps the log, notifies.
- **Technical:** [name, phone] — contains and investigates.
- **Legal contact:** [lawyer, phone].
- DVI: www.dvi.gov.lv, breach notification form [link], [phone].

## Hour 0 — the moment somebody knows

1. **Start the log** (a plain file, `incidents/<date>.md`, off the affected
   machine): what was noticed, by whom, when. Every later step gets a line
   with its time. The 72 hours start here.
2. **Do not delete anything** that could show what happened: the server logs
   (`tools/lan-host/logs`, or `docker compose logs`), the audit log table, the
   affected rows.

## Hours 0–4 — contain

Pick what fits; each is reversible:

| If | Then |
|----|------|
| Someone has, or may have, the server's secrets | Rotate `JWT_SECRET` (signs everyone out) and `MEDIA_SIGNING_SECRET` (kills every photo link and calendar feed) |
| One account is taken over | Revoke its sessions (reset its password with a reset link); check its audit entries |
| A guest link reached the wrong people | Withdraw it (open the event → Share → the links still open); its views are in `EventShareLink.viewCount` |
| A calendar feed leaked | Reset it (Profile → Calendar) |
| A bug shows entries to the wrong audience | Stop the API (`docker compose stop api`, or end the supervisor on the laptop) — being offline is better than showing the wrong people's appointments |
| A backup or the database is somewhere it should not be | Take it down or revoke access; note where it was and for how long |

## Hours 4–24 — understand

Answer, in the log, as exactly as the data allows:

- **What data** — which tables, which families, whether children's entries or
  health entries or photographs were involved. The audit log (`AuditLog`)
  shows who opened children's profiles and made guest links.
- **How many people**, and how many of them children.
- **For how long** it was exposed, and to whom (known people, the family,
  anybody on the internet).
- **Is it still happening.**

## Hours 24–72 — decide and notify

**Notify DVI** unless the breach is *unlikely to result in a risk* — and with
children's photographs, health entries or family addresses, assume it is
likely. The notification (Art. 33(3)) says: what happened; the categories and
approximate numbers of people and records; the contact point; the likely
consequences; what was done and will be done. **If not everything is known by
hour 72, notify with what is known and send the rest later** — late and
complete is worse than on time and partial.

**Tell the people affected** (Art. 34) when the risk to them is high — in plain
words, in the app and by email, saying what happened, what it means for them,
what we did, and what they can do (change a password, withdraw a link, tell
their family). For a child, the parent who manages the profile.

Whether or not DVI is notified, **the log stays**: Art. 33(5) requires a record
of every breach, its effects and the remedy.

## Afterwards

- The cause fixed in the repository, with a test that would have caught it —
  the smoke test is where audience bugs are caught at the database level.
- A line in docs/07-IMPROVEMENTS.md saying what happened and what changed.
- The DPIA's risk table updated if this was a risk it rated low.
