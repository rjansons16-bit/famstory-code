# The delivered design

`Fam Track.fig` (exported 2026-08-27) and the sixteen screens extracted from it.

## Why there are PNGs here

The `.fig` is a ZIP whose `canvas.fig` is a **fig-kiwi** container: a Kiwi
schema chunk followed by the document, both compressed. The document is a node
tree — and the design's own screens turned out not to be vector layers at all.
They are **images placed on a canvas named "Designs"**, alongside a user-flow
diagram and a "Research" canvas of competitor screenshots.

So the screens could be recovered exactly, without Figma: parse the embedded
schema, decode the document with it, walk the nodes for the ones whose fill is
an image, and pull those blobs out of the ZIP by hash. The decoder lives outside
the repo (it was a one-off), but the method is written down here because the
next person to ask "what did the designer actually draw?" should not have to
rediscover it.

## What each file is

| File | Screen |
|------|--------|
| `design_Screenshot_2026-07-01_at_20_53_15_1.png` | Home — the timeline |
| `design_Screenshot_2026-07-02_at_19_02_06_1.png` | Event detail |
| `design_Screenshot_2026-07-02_at_19_00_56_1.png` | Calendar |
| `design_Screenshot_2026-07-02_at_17_55_32_1.png` | Family |
| `design_Screenshot_2026-07-01_at_20_55_28_1.png` | New event |
| `design_Group_10_1.png` | Onboarding 1 — About you |
| `design_Group_9_1.png` | Onboarding 3 — Add your people |
| `design_Group_8_1.png` | Profile |
| `design_image_22.png` | Welcome |
| the rest | fragments and states of the above |

## Two things the file says that the product does not

- The wordmark reads **"saime"**. The product is **FamStory**; the mark is set
  in the same serif.
- The Profile row reads **"Language — Latviešu"**. The product is English-only
  for the MVP and multi-language stays a V2 item, so that row reads "English".

Both were decided on 2026-09-08 and are recorded in `docs/00-PLAN.md`.

## Where the implementation deviates, and why

- **No family switcher.** The design's header has a chevron beside the family
  name. The MVP has one family per session, so the chevron would open nothing.
- **No avatar in the timeline header.** The design puts one top-right; here
  Profile is a tab, and a second way in is a second thing to maintain.
- **No gear on Family.** There is no family-settings screen to open yet.
- **Search stays in the header.** The design does not draw it, but removing the
  icon would leave search unreachable.
