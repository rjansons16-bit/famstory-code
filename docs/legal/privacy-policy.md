# FamStory — Privacy policy

> **DRAFT, completed for the launch on 2026-10-08. Not legal advice; a
> lawyer's review is recommended before it is in force.** Written from what
> the app does (docs/06-PRIVACY-GDPR.md). `{{tokens}}` are the company's
> details, filled from facts.json by `npm --prefix apps/mobile run legal`;
> *Note for the lawyer* paragraphs are not part of the published text. What
> was chosen without a lawyer is in README.md, "Decided for the launch".

*Version {{version}}, in force from {{inForceFrom}}.*

FamStory is a private chronicle and calendar for one family. This page says
what we keep about you and your family, why, who can see it, and what you can
do about it. We have tried to write it the way the app works: plainly.

## 1. Who we are

The controller of your personal data is **{{company.name}}**, registration
number {{company.registrationNumber}}, {{company.address}}. Questions,
requests and complaints: **{{email.privacy}}**.

*Note for the lawyer: a data protection officer is probably not mandatory at
this scale (Art. 37), but that depends on whether processing children's data
is found to be "large scale" — see the DPIA.*

## 2. The short version

- Your family's events, photographs and comments are seen by **your family
  only**, and within the family only by the people each entry is for.
- Nothing is public, nothing is sold, there is no advertising, and nothing you
  write is used to train an AI model.
- A child has no account. A parent manages a child's profile, and entries with
  a child in them are seen by the parents only unless a parent widens them.
- What your family keeps here is stored in the European Union.
- You can download everything your account is, and delete it.

## 3. What we keep, and why

**Your account.** Your email address, a scrambled form of your password (we
cannot read it), your name, your photograph if you add one, your language, when
the account was made, and which version of this policy and the terms you
accepted, and when. *Why:* to let you sign in and to show your family
who added what. *Basis:* our contract with you (GDPR Art. 6(1)(b)).

**What your family writes.** Events — a title, a date, a description, the
people in it, its category and tags, whether it repeats — photographs and
videos, comments, reactions, reminders, wish lists, and the family's name and
groups. *Why:* this is the service. *Basis:* the contract with the account
holder who writes it, and, for what it says about other people in the family,
our legitimate interest and the family's in keeping a shared family record
(Art. 6(1)(f)).

**Health information.** An entry in the Health category is health
information, which the law protects more (GDPR Art. 9). Before the first one
the app asks for your consent, and we keep that you gave it and when.
*Basis:* your explicit consent (Art. 9(2)(a)), for yourself and, as a parent,
for your child. You can withdraw it in Settings → *Health information*; from
then on no new health entries can be added, and those already written stay
until you delete them.

*Note for the lawyer: the basis for data about people who are not the account
holder (children, relatives who have not joined) is open question 3. Consent
covers the author and their children; health information about another adult
in the family, and what a withdrawal means for entries already written, are
what is left of open question 4.*

**People in the family.** For each person: a name, a role (admin, member,
viewer, child), optionally a birth date and a photograph, and — only if the
family marks it — the date someone died. *Why:* birthdays, who is in which
event, who may see what.

**Invitations.** The email address or the code an invitation was sent to,
until it is accepted, withdrawn or expires.

**Your visits.** When your latest visit began, so the app can say what is new
since you last looked. Only you see it.

**Security records.** When you sign in, a record of the session: a scrambled
form of your network address and the name of your browser or device. An audit
log of sensitive actions — who changed who can see an event, who opened a
child's profile, who made a guest link — with the same scrambled address.
*Why:* to protect accounts and to be able to say, after an incident, who saw
what. *Basis:* legitimate interest (Art. 6(1)(f)) and our duty to keep data
secure (Art. 32).

**Usage counts.** How often things in the app are used — for example "an event
was added", "a suggestion was accepted" — with the family it happened in, but
**never who you are, what you wrote, or your device or address**. *Why:* to
know whether FamStory is useful enough to keep building. *Basis:* legitimate
interest (Art. 6(1)(f)). **You can switch this off** in Profile → *Share usage
counts*; from then on nothing is kept, on any of your devices. Kept 400 days.

**Error reports.** When the app breaks, what broke and on which screen — with
addresses, keys and email addresses removed before it is stored, and tied to
nobody. *Why:* to fix it. *Basis:* legitimate interest. Kept 90 days. The same
switch turns these off once you are signed in.

**Suggestions.** The app suggests an event type from the words of a title, a
reminder time from your family's habits, and warns when somebody is already
busy. These are rules running on our server; **no outside AI service** sees
your data. We record whether a suggestion was accepted, to learn whether they
help. Suggestions are a helper, never advice (see the terms of use).

**Voice notes.** A recording you make in FamStory and keep with an event -
somebody telling the story instead of typing it. It is stored on our server
like a photograph, heard by the same people the event is for, **never shown
through a guest link**, and deleted with its file when you take it out.
*Basis:* as for the rest of what your family writes.

**Dictation.** If you press *Dictate*, your browser turns your speech into
text: **Chrome and Edge send the sound to Google, Safari to Apple**, under your
browser's own terms. FamStory receives only the text, which becomes part of
the entry; we never receive or keep the sound. The app tells you this before
the first time on each device. For something private, type it or record a
voice note instead.

*Note for the lawyer: FamStory does not process the dictated sound, but it
offers the button that sends it. Whether that makes the provider a recipient
FamStory must name - and whether dictation should be off for events with a
child in them - is worth a line in the review.*

**Reports.** When you report an entry or a comment, we keep which one it was,
the reason you chose, your note if you wrote one, and who reported it. The
family's admins are told that something was reported, but not by whom, and we
see the report too. *Why:* to deal with what breaks the terms of use. *Basis:*
legitimate interest (Art. 6(1)(f)). Kept 12 months from the report.

**Blocks.** When you block somebody in your family, we keep that you blocked
them, and since when. Nobody is told, the person you blocked included.
*Why:* so that what they add is not shown to you. *Basis:* our contract with
you (Art. 6(1)(b)). Kept until you unblock them; deleting your account
deletes it.

**Premium.** When Premium is bought in the app, Apple or Google take the
payment under their own terms, and RevenueCat (section 4) checks the purchase
with them for us. We receive only whether the family's subscription is
active, until when, and in which store, never card details. *Basis:* our
contract with you (Art. 6(1)(b)).

**Notifications on your phone.** If you allow them, your phone's push address
(a token Apple or Google gives the app, nothing else about the phone) and the
app's language, so that our server can tell your phone there is something
new. A notification says only that — "you have a reminder", "there is a new
reply" — **never a title, a name or anything your family wrote**; the app
shows what it is once you open it. Apple or Google deliver it. *Basis:* our
contract with you (Art. 6(1)(b)). You can turn notifications off in your
phone's settings at any time; signing out on the phone removes its address,
and an address the app has not used for six months is deleted.

**Emails we send.** If you ask for a new password and our server can send
email, we send a link to your account's address through {{mailer}}. The email
holds the link and nothing else about you or your family; the link works once,
for one hour. *Basis:* our contract with you (Art. 6(1)(b)).

## 4. Who can see what

Inside FamStory, every entry says who it is for: the whole family, chosen
groups and people, or only its author. **That choice is enforced by our
server, not only by the app.** A person who is not in an entry's audience
cannot see it, search for it, or learn that it exists.

Two things can reach outside the family, and both only because a member made
them:

- **A guest link** to one event: the title, date, description and photographs
  of that event, for anyone holding the link, for 1, 7 or 30 days. It can be
  withdrawn at any time. It never shows who else is in the event, who can see
  it, or the comments.
- **A calendar feed**: your own address that puts the events *you* can see into
  your phone's calendar. Anyone holding that address sees what you see, so
  treat it like a password; you can reset it in Profile at any time.

**Our people** can technically reach the database to run and repair the
service; they do so only for that, and it is recorded.

**Service providers** who store or send data for us, under contracts that
bind them to our instructions:

- {{hosting}}, which runs our server in the European Union;
- {{mailbox}}, which keeps the mailbox you write to;
- {{mailer}}, which sends the emails our server sends — so far only the link
  to set a new password;
- RevenueCat, Inc., in the United States, which checks Premium purchases
  with Apple and Google for us. It receives the family's identifier, the
  store's record of the purchase and the network address of the phone that
  asks, never names, entries or photographs;
- Apple and Google, whose push services carry notifications to phones that
  allowed them: the phone's push address and the one line it shows, never
  what your family writes.

We do not sell data and do not share it for advertising. What your family
writes is never transferred outside the European Union and the European
Economic Area. Two things do go to the United States: RevenueCat's records of
purchases, under the European Commission's standard contractual clauses
(GDPR Art. 46(2)(c)), which are part of our agreement with it; and, for a
notification, the phone's push address and a line with nothing of your
family's in it, through Apple's and Google's push services, which are
certified under the EU-U.S. Data Privacy Framework (Art. 45).

*Note for the lawyer: RevenueCat's data processing addendum
(revenuecat.com/dpa) incorporates the 2021 standard contractual clauses,
module two; it is accepted with RevenueCat's terms when the account is
opened. Apple's and Google's push services are part of the phones' operating
systems; that both companies' certification under the Data Privacy Framework
covers them, and whether they are processors or recipients here, is worth a
line in the review.*

## 5. Children

A child in FamStory is a **profile, not an account**: no sign-in, no email, no
password. Each child profile has a parent who manages it. Events with a child
in them are visible to the parents only unless a parent deliberately widens
them, every access to a child's profile is recorded, and the app warns before
a guest link is made for an event with a child in it.

FamStory is not for children to use on their own. An account of your own
is from the age of 16; a younger child is a profile that a parent manages.

*Note for the lawyer: 16 is the GDPR's own age for consent to online
services (Art. 8(1)); Latvia sets 13 (Personal Data Processing Law, s. 33).
16 was chosen so that one age holds across the EU. Open question 5, a child
who grows up, still stands.*

## 6. How long we keep it

| What | How long |
|------|----------|
| Your account | Until you delete it; then 30 days in which signing in brings it back, then it is deleted |
| What you wrote in the family | Stays in the family's chronicle after you leave or delete your account, under "Former member" — your name, photograph and birthday are removed |
| A family nobody can sign in to any more | Closed, not shredded: it can be restored if someone asks within 12 months; then it is deleted, with its photographs |
| Guest links | 1, 7 or 30 days, or until withdrawn |
| Usage counts | 400 days |
| Error reports | 90 days |
| Reports of an entry or a comment | 12 months |
| Sign-in records | Until the session ends, and 7 days more |
| The audit log | 24 months |
| A phone's push address | Until you sign out on that phone; six months after the app last used it |
| A password link sent by email | Works one hour; the record of it is deleted 30 days later |

## 7. Your rights

You can:

- **See and download** everything your account is — Profile → *Export my
  data*. Free on every plan.
- **Correct** your name, photograph and birthday — Profile → edit.
- **Delete** your account — Settings → *Delete account* (30 days to change
  your mind).
- **Object** to usage counts — Profile → *Share usage counts*.
- **Restrict** or **object** to other processing, or ask anything else, by
  writing to {{email.privacy}}. We answer within one month.
- **Complain** to the Latvian data protection authority, the Data State
  Inspectorate (Datu valsts inspekcija, www.dvi.gov.lv), or to the authority
  where you live.

Some of what you ask about may also be about other people — a photograph of
you added by a relative, for example. Write to us and we will help you and
your family sort it out; *note for the lawyer: open question 5 covers the
hardest version of this, a grown child and a parent's chronicle.*

## 8. Security

Connections are encrypted (HTTPS). Passwords are stored only as slow,
salted hashes (scrypt). Photographs are served only through links that expire
after 30 minutes and that are checked against who may see them. Sign-in
attempts are limited. Backups are made every night and a restore is tested
each time. The server and its backups are in the European Union, and only
we can reach them.

*Note for the lawyer: the database and the photographs are not encrypted at
rest beyond what the hosting provider does; encrypting the server's disk is
an option in docs/12-LAUNCH-RUNBOOK.md.*

If something goes wrong that puts your data at risk, we will tell the Data
State Inspectorate within 72 hours and tell you without undue delay when the
risk to you is high.

## 9. Changes

When this policy changes in a way that matters, the app will say so before the
change applies, and ask again where the law requires it. Earlier versions
are kept, and we send any of them on request.
