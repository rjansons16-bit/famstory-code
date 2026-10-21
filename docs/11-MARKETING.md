# Marketing FamStory

Researched on 2026-10-08, when the owner asked how an app like this gets
found: three YouTube videos watched in full (frames and transcript, `/watch`)
and a search for what grew the apps closest to FamStory. Materials ready to
use are in `docs/marketing/`: thirty short videos (`videos.md`) and a press
release (`press.md`).

## 1. What the research says

### Why app marketing is changing for indie developers in 2026

[YouTube, 4:59](https://www.youtube.com/watch?v=HjnXnssrj4M). Indie developers
who post short videos every day reached 50,000 downloads ("Lovely", one video
with 4 million views) or USD 1,000 a month ("Talk Macros") within weeks,
without ads.

- Search in the stores is harder to win than it was. Short video - TikTok,
  Reels, Shorts - is where an app with no budget gets seen.
- Around two posts a day [03:44]. Days without a post brought fewer new users
  [02:49].
- The first weeks look empty, and that is when most people stop
  [03:51-04:30].
- Build the features that ride on what people already make videos about in
  the niche.
- "Distribution isn't optional anymore" [04:41].

### How to actually market apps in 2026 ("organic is dead")

[YouTube, 13:30](https://www.youtube.com/watch?v=Cpm_OLbKa5Y). The speaker
sells a platform for hiring creators, so the conclusion favours his product.
The mechanics are still worth knowing:

- A viewer of a free video has to leave the app, search the store and find
  the right result. 90-99% are lost on the way, and competitors bid on your
  name [04:14].
- Treat free videos as the test bench: look at what already works (Meta Ad
  Library, TikTok's ad explorer), pick three formats, make about fifty
  variations, and judge each by engagement relative to the account's size.
  The few that win become paid ads ("Spark Ads", the same post with a budget)
  [07:06-08:12, 09:03].
- "Volume negates luck": the top-grossing apps run hundreds of ads. One
  winner pays for all the tests when a customer is worth two to three times
  what they cost.

### App marketing on a budget: from $0 to $10k

[YouTube, 2025](https://www.youtube.com/watch?v=m4hqbsOtawc). An agency's
video, so it leads to the agency. The video itself refused to download (HTTP
403); this comes from its captions.

- Store search first: 6-10 keywords across the name and the subtitle, and
  more localisations, each with its own keywords [07:02].
- A "lifetime free for a day" promotion through AppAdvice, Indie App Santa or
  r/iOSapps brought one app 106,000 downloads and 800 ratings. It needs a
  one-time purchase to give away [08:30].
- Ask for a rating right after a good moment, not at launch [10:36].
- Localise the keywords and the price per country [13:16].
- Apple Search Ads catches people already searching; the agency's apps paid
  about USD 1.56 an install [15:42].
- Meta ads from USD 10-30 a day, once the store page converts [16:30].
- Simple arithmetic: downloads, then trials, then paying families, against
  what was spent. One channel at a time [19:44].

### The apps closest to FamStory

- **FamilyAlbum** (10 million+ users) grew from parents inviting the
  grandparents into the album, and from referral rewards.
  ([UKTN](https://www.uktech.news/technology-news/private-photo-sharing-app-familyalbum-surpasses-8-million-users))
- **Famileo** prints the family's posts as a paper gazette for grandparents
  and reached 200,000 families in France.
- **Togethera** shut down: joining needed an invitation, growth was slow, and
  nothing paid for it.
- Store search is moving towards retention: apps that keep their users rank
  better. Apple added more search ad slots in March 2026.

## 2. What it means for FamStory

1. **The invitation is the engine.** Every family that starts brings its
   grandparents, aunts and cousins, and that is the cheapest growth there is.
   The invitation link, the QR code and the grandparent's first minute in the
   app matter more than any advertisement (docs/07-IMPROVEMENTS.md items 38
   and 55 are the invitation's history). A reward for inviting *another
   family* - a month of Premium - is the next step after launch, when there is
   data to see whether invitations already work.
2. **Store search in Latvian and in English.** The Latvian stores are small:
   being first for "ģimenes kalendārs", "ģimenes albums" and "dzimtas stāsti"
   is realistic. Google Play gets the whole listing in Latvian. Apple has no
   Latvian listing language, so there the Latvian words go into the keyword
   field of the English listing that the Latvia storefront shows
   (`docs/store/listing.md`, "Where the Latvian goes").
3. **A short video every day, in Latvian.** `docs/marketing/videos.md` has
   thirty, each with its first line. Accounts on TikTok, Instagram and YouTube
   in the company's name, made before the launch so the first weeks of
   silence are behind it by then.
4. **Free channels in Latvia:**
   - the founder's story for the press (LSM, Delfi, TVNET, local papers):
     a pupil built a family chronicle app (`docs/marketing/press.md`);
   - parents' Facebook groups, where posting is about the problem, not an ad;
   - small family accounts on Instagram and TikTok (1,000-20,000 followers).
     The influencer scout in `C:\dev\influencer` finds and ranks them;
   - Junior Achievement Latvia's fairs and competitions (docs/10-COMPANY.md §2);
   - the days the app already knows (`domain/special-days.ts`): Independence
     Day and the family's story in November, Christmas Eve ("a present for
     the grandparents"), Mother's Day in May, Father's Day in September.
5. **Ask for a rating at a good moment.** The app asks after somebody's fifth
   event, once (`lib/review.ts`); the store decides whether to show the
   question.
6. **Paid advertising only after a free video has won.** Apple Search Ads on
   the Latvian keywords and Meta at EUR 5-10 a day, aimed at parents. Never
   before VAT registration (docs/10-COMPANY.md §4).

## 3. The first eight weeks

| When | What |
|---|---|
| 4 weeks before the store | The social accounts. One video a day from `videos.md`. Note which hook holds. |
| The week of the store | The press release. A post in three or four parents' groups. The founder's own family and friends invite theirs. |
| Weeks 1-4 | Two videos a day; the formats that held, again with new families and new days. |
| Weeks 5-8 | The best five as paid posts at EUR 5-10 a day each, for a week. Keep what pays back. |
| November-December | Independence Day stories; then "a present for the grandparents" until Christmas Eve. |

## 4. What never to do

- **Buy installs, ratings or reviews**, or reward a rating. Both stores
  remove apps for it.
- **Advertise to children.** FamStory is for adults; children are profiles a
  parent manages (Google Play's target audience is adults, docs/09 §3.4).
- **A child's face in a video** without the parents' clear yes. Hands,
  objects, a grandparent's voice and the app's own screens tell the story.
- **A tracking SDK in the app.** The privacy policy says there is no
  advertising and nothing is sold; an ad network's SDK would make that
  untrue. Measure with the stores' own figures, RevenueCat and the app's own
  usage counts.

## 5. Measuring

| Step | Where it is counted |
|---|---|
| Seen in the store, page opened, downloaded | App Store Connect, Play Console |
| A family made, invitations accepted, events a week | `npm --prefix apps/api run kpis` (no person in it) |
| Trials, paying families, monthly revenue | RevenueCat's dashboard |

A worked example to check each channel against. The rates are assumptions to
replace with the first month's real ones:

| Step | Rate | Count |
|---|---|---|
| Downloads | | 1,000 |
| Start or join a family | 40% | 400 people, about 150 families |
| Families still active after a month | 40% | 60 |
| Families that pay | 5% | 3 |
| What reaches the company | EUR 3.15 each | about EUR 9.50 a month |

At USD 1.56 an install, those thousand downloads would cost about EUR 1,400.
A paid channel pays back only through families that invite their own, so the
invitations accepted per family are the number to watch above all.
