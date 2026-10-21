/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  DESIGN HANDOFF FILE — this is where design enters the code.             ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * This is the ONLY file that has to be rewritten once the visual language is
 * settled. No screen contains a hardcoded colour or size — everything goes
 * through here.
 *
 * DIRECTION: "saite — 01 · minimal", from the delivered Figma file
 * (`Fam Track.fig`, exported 2026-08-27). Tagline: "Moments, tied together."
 *
 * Five named swatches and two faces, reproduced from the brand page:
 *   Ink #17160F · Paper #F4F1EA · Evergreen #234E42 · Jade #3DBB8C · Stone #A8A296
 *   Fraunces · display        Inter · interface text, set quietly
 *
 * Rules that hold even after the values change:
 *   1. Every `light` key needs a `dark` one. There is no half dark mode.
 *   2. Spacing stays on a 4px grid.
 *   3. The `categoryTone` keys may not disappear — they come from
 *      domain/categories.ts and are also used by the calendar dots.
 *   4. Contrast: text on background >= 4.5:1, large text >= 3:1.
 *      Grandparents use this app. Contrast is not a matter of taste.
 */

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

export interface ColorScheme {
  /** Screen background. */
  background: string;
  /** Cards, sheets, raised surfaces. */
  surface: string;
  /** Second-level surface — input fields, chip backgrounds. */
  surfaceMuted: string;
  /** Borders and dividers. */
  border: string;

  /** Primary text. */
  text: string;
  /** Secondary text — dates, metadata. */
  textMuted: string;
  /** Text on a primary background. */
  textOnPrimary: string;

  /** Brand primary — CTAs, active states. */
  primary: string;
  /** Soft primary — chip and badge backgrounds. */
  primarySoft: string;

  /** Accent for secondary actions and restricted visibility. */
  accent: string;
  /** The accent as TEXT or a small mark: Jade itself is a fill, too light to read on paper. */
  accentText: string;
  accentSoft: string;

  /** Status colours. */
  success: string;
  warning: string;
  danger: string;
  dangerSoft: string;

  /** Scrim behind a modal or sheet. */
  overlay: string;
}

/**
 * LIGHT — the palette from the delivered design ("saite", direction 01 · minimal).
 *
 * The five named swatches are reproduced exactly:
 *   Ink #17160F · Paper #F4F1EA · Evergreen #234E42 · Jade #3DBB8C · Stone #A8A296
 *
 * TWO GREYS, NOT ONE. Stone is the swatch, but the screens use a darker grey
 * (#6E6A61) for text that has to be read — timestamps, participant names,
 * section headers. Stone on Paper is 2.25:1, which is below AA and unreadable
 * for the grandparents this product is explicitly for. So Stone stays as the
 * decorative grey (borders, placeholders, avatar grounds) and `textMuted`
 * carries the design's own reading grey at 4.78:1.
 */
const light: ColorScheme = {
  background: '#F4F1EA', // Paper
  surface: '#FFFFFF', // cards sit as white paper on the ground
  surfaceMuted: '#EFEBE3', // chips, fields, the day-list band
  border: '#E3DFD5',

  text: '#17160F', // Ink
  textMuted: '#6E6A61', // the design's reading grey, not Stone
  textOnPrimary: '#F4F1EA', // Paper on Evergreen — 8.31:1

  primary: '#234E42', // Evergreen
  primarySoft: '#E0E0DA', // the selected filter chip, sampled from the screens

  // Jade is the second brand colour. It is a MARK, not a text colour: 2.14:1 on
  // Paper. Reminder dots, the child in the logo, small confirmations — never a label.
  accent: '#3DBB8C', // Jade
  // Jade is 2.4:1 on white - a fill, a dot, never a word. As text it is this
  // deeper jade: 6.1:1 on a card, 5.2:1 on accentSoft (contrast.test.ts).
  accentText: '#1B6F50',
  accentSoft: '#DFF1E8',

  success: '#234E42',
  warning: '#8A6B1F',
  danger: '#A5442F',
  dangerSoft: '#F7E4DC',

  overlay: 'rgba(23, 22, 15, 0.44)',
};

/**
 * DARK — derived, because the design does not ship one.
 *
 * The dark screens in the file belong to an earlier blue-accent exploration, so
 * this is built from the same five swatches rather than copied: Ink becomes the
 * ground, Paper becomes the text, and Jade takes over from Evergreen as the
 * primary — Evergreen at #234E42 is too dark to carry a button on a dark ground.
 *
 * The Profile screen has an explicit Dark mode switch, so this is a surface the
 * design intends to exist even though it was not drawn.
 */
const dark: ColorScheme = {
  background: '#16150E',
  surface: '#201E17',
  surfaceMuted: '#2A2820',
  border: '#39362B',

  text: '#F4F1EA', // Paper
  textMuted: '#A8A296', // Stone reads well on a dark ground — 7.4:1
  textOnPrimary: '#0F1A15',

  primary: '#3DBB8C', // Jade
  primarySoft: '#1B2E27',

  accent: '#6ED0A9',
  // On a dark ground the accent already reads as text.
  accentText: '#6ED0A9',
  accentSoft: '#172A22',

  success: '#3DBB8C',
  warning: '#D9AC5E',
  danger: '#E08A72',
  dangerSoft: '#33201A',

  overlay: 'rgba(0, 0, 0, 0.64)',
};

export const colors = { light, dark };

/**
 * Text and scrims that sit ON a photograph.
 *
 * The one place a fixed colour is correct: a photo is a photo in both themes,
 * so this does not vary with the scheme. It lives here rather than inline in the
 * card so that it is still a design decision — the scrim's weight is the
 * difference between a caption that reads and one that fights the picture.
 */
export const onMedia = {
  scrim: 'rgba(0, 0, 0, 0.55)',
  text: '#FFFFFF',
} as const;

/**
 * The colours a camera reads.
 *
 * The second place a fixed colour is correct. A QR code is dark modules on a
 * light ground in every scanner's expectation, in both themes: inverted for
 * dark mode it becomes the classic square nothing can read. Pure black and
 * white rather than the palette's near-black and paper, because contrast is
 * the whole specification here and a tinted ground costs scanning distance.
 */
export const scannable = {
  dark: '#000000',
  light: '#FFFFFF',
} as const;

/**
 * How a photograph meets a card.
 *
 * The design file settles the palette and the faces but draws no photograph, so
 * this is the decision it left open, written down as numbers rather than left
 * to each screen.
 *
 * The rule is: A PHOTOGRAPH KEEPS ITS OWN SHAPE. A fixed height with a cover
 * fit is what every feed does, and it is wrong here — cropping a portrait of a
 * child to a letterbox band damages the one thing the family came to keep. So
 * the height follows the file's own ratio, between two limits that exist for
 * different reasons:
 *
 *   - in the TIMELINE the card must stay scannable. A chronicle is read by
 *     running down it; one 4:5 photograph plus a title and a description fills
 *     two-thirds of a phone, and the timeline stops being a chronicle and
 *     becomes a feed of single posts. So a cover is square at the tallest.
 *   - OPENED, there is nothing to scan past. The photograph is the content, and
 *     it keeps its shape down to a 4:5 portrait.
 *
 * Both ends are capped at 16:9: wider than that and the card wears a letterbox
 * strip that reads as a banner rather than a picture.
 */
export const media = {
  card: { minAspect: 1, maxAspect: 16 / 9 },
  detail: { minAspect: 4 / 5, maxAspect: 16 / 9 },
  /** When the file carries no dimensions — 3:2, the shape most cameras produce. */
  fallbackAspect: 3 / 2,
} as const;

// ---------------------------------------------------------------------------
// Category tones
//
// Each life-cycle category gets a tone. The tone keys come from
// domain/categories.ts — they must not be renamed or removed.
// These tones are what makes the timeline read as a chronicle rather than
// a list, and they carry over into the calendar dots.
// ---------------------------------------------------------------------------

export interface ToneColors {
  fg: string;
  bg: string;
}

export type ToneKey =
  | 'growth'
  | 'learn'
  | 'landmark'
  | 'care'
  | 'joy'
  | 'journey'
  | 'routine'
  | 'task'
  | 'money'
  | 'neutral';

/**
 * The ten tones, spread deliberately around the wheel.
 *
 * The previous set had a real defect: `routine` and `neutral` were the SAME
 * colour, and `money` was a green close enough to `growth` to be the same dot at
 * 5px. Ten keys, eight distinguishable tones. `money` is now cool slate and
 * `routine` is olive, which puts daylight between every pair.
 *
 * WHAT THE BAR ACTUALLY IS: ten hues cannot all be told apart at 5px — no
 * palette achieves that, and pretending otherwise leads to garish colour. But
 * the calendar shows at most three dots on a day, so the real requirement is
 * that any two or three seen TOGETHER are distinct. That is achievable, and it
 * is what these were tuned for.
 *
 * Hue is never the only signal: every chip carries its label, and the calendar
 * day opens to a list. Colour is recognition, not information.
 */
export const categoryTone: Record<'light' | 'dark', Record<ToneKey, ToneColors>> = {
  light: {
    growth: { fg: '#3A754B', bg: '#E3EEE5' },
    learn: { fg: '#37588A', bg: '#E0E8F2' },
    landmark: { fg: '#7B4586', bg: '#EFE2F0' },
    care: { fg: '#A93A33', bg: '#F7E2DE' },
    joy: { fg: '#A0541A', bg: '#FAE7D6' },
    journey: { fg: '#26737C', bg: '#DCEDEE' },
    routine: { fg: '#646F33', bg: '#EBEEDB' },
    task: { fg: '#81641D', bg: '#F4EAD3' },
    money: { fg: '#4F5D6B', bg: '#E3E7EB' },
    neutral: { fg: '#6B6355', bg: '#EDEAE1' },
  },
  dark: {
    growth: { fg: '#86C29A', bg: '#1E2C22' },
    learn: { fg: '#8FB2DC', bg: '#1C2531' },
    landmark: { fg: '#C795D0', bg: '#2A1F2E' },
    care: { fg: '#E58A82', bg: '#331F1D' },
    joy: { fg: '#E3A06E', bg: '#33241A' },
    journey: { fg: '#6FC0C9', bg: '#172C2E' },
    routine: { fg: '#B4C273', bg: '#262A18' },
    task: { fg: '#D6B26A', bg: '#302818' },
    money: { fg: '#9FB1C4', bg: '#1F262D' },
    neutral: { fg: '#A79E8C', bg: '#26241E' },
  },
};

// ---------------------------------------------------------------------------
// Spacing — 4px grid
// ---------------------------------------------------------------------------

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

// ---------------------------------------------------------------------------
// Radii
// ---------------------------------------------------------------------------

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

// ---------------------------------------------------------------------------
// Typography
//
// FROM THE DESIGN: "Fraunces · display" and "Inter · interface text, set quietly
// with generous spacing."
//
// "Display" is narrower than it sounds, and reading the screens rather than the
// brand page is what settles it. Fraunces appears on exactly two things: the
// TITLE OF AN EVENT and the wordmark. Everything else — screen titles, the
// family name, row titles, names, buttons, chips — is Inter.
//
// That is a sharper rule than "headings are serif", and a better one. The serif
// marks what the family wrote. If it also set "Notifications" and "Reminder
// timing", it would stop meaning anything.
//
// Both faces load in app/_layout.tsx. The family names below are the ones
// @expo-google-fonts registers; they must match exactly or React Native falls
// back to the system face without warning.
//
// WEIGHTS ARE ONLY THE ONES LOADED. Asking for a weight that was not loaded
// makes the platform synthesise it — smeared stems on a serif. Every entry
// names its face explicitly instead of relying on fontWeight.
// ---------------------------------------------------------------------------

const displaySerif = 'Fraunces_600SemiBold';
const readSerif = 'Fraunces_400Regular';
const ui = 'Inter_400Regular';
const uiMedium = 'Inter_500Medium';
const uiSemi = 'Inter_600SemiBold';

export const typography = {
  /** Screen title, the family name. Inter — this is chrome, not content. */
  display: { fontFamily: uiSemi, fontSize: 26, lineHeight: 34, letterSpacing: -0.5 },
  /** An event's title on its own screen. Fraunces. */
  title: { fontFamily: displaySerif, fontSize: 26, lineHeight: 33, letterSpacing: -0.3 },
  /** An event's title on a card. Fraunces. */
  cardTitle: { fontFamily: displaySerif, fontSize: 19, lineHeight: 25, letterSpacing: -0.1 },
  /** A row title, a section heading. Inter. */
  heading: { fontFamily: uiSemi, fontSize: 16, lineHeight: 22 },
  /**
   * Narrative prose — an event's description, a comment.
   *
   * Fraunces Regular rather than Inter: it is the thing the family wrote, and
   * the design sets it apart from the interface for exactly that reason.
   */
  read: { fontFamily: readSerif, fontSize: 16, lineHeight: 26 },
  /** UI copy — rows, fields. */
  body: { fontFamily: ui, fontSize: 15, lineHeight: 22 },
  /** Secondary text — timestamps, participant names, section headers. */
  caption: { fontFamily: ui, fontSize: 13, lineHeight: 18 },
  /** Button labels. */
  button: { fontFamily: uiSemi, fontSize: 16, lineHeight: 22 },
  /**
   * Chips, badges, the tab bar. "Set quietly with generous spacing."
   *
   * 13px, not the 12 it started at (item 43). The brief puts body text at 15px
   * at the least because grandparents read this app, and the chips and tab
   * labels are exactly the text an older reader has to find a thing by. Quiet
   * is the weight and the spacing; it does not have to be small as well.
   */
  label: { fontFamily: uiMedium, fontSize: 13, lineHeight: 18, letterSpacing: 0.3 },
  /**
   * The wordmark, as the welcome screen in the design sets it: the name in
   * Fraunces, large and tight. Only there - it is the one place the product
   * says its own name.
   */
  wordmark: { fontFamily: displaySerif, fontSize: 52, lineHeight: 60, letterSpacing: -1.5 },
  /** The welcome screen's one sentence, in the serif the design gives it. */
  hero: { fontFamily: displaySerif, fontSize: 30, lineHeight: 38, letterSpacing: -0.4 },
} as const;

/** Exposed so _layout.tsx loads exactly the faces this file names. */
export const fontFamilies = { displaySerif, readSerif, ui, uiMedium, uiSemi } as const;

export type TypographyKey = keyof typeof typography;

// ---------------------------------------------------------------------------
// Elevation
//
// RN: iOS uses shadow*, Android uses elevation. Both are required.
// ---------------------------------------------------------------------------

export const shadow = {
  none: {},
  /**
   * Quiet, and warm-tinted rather than black.
   *
   * Cards carry a hairline border (see ui/surface.tsx) and the shadow only
   * lifts them a little off the page. A black blur on parchment looks like a
   * smudge; the separation should come from the edge, the way it does on paper.
   */
  card: {
    shadowColor: '#3A2E1C',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  sheet: {
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  fab: {
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
} as const;

// ---------------------------------------------------------------------------
// Sizes
// ---------------------------------------------------------------------------

export const size = {
  /** Minimum touch target. Do not go below this — grandparents use this app. */
  touchTarget: 48,
  avatarSm: 28,
  avatarMd: 40,
  avatarLg: 64,
  avatarXl: 96,
  fab: 56,
  icon: 22,
  /** Height of the photograph strip on an opened event. Widths vary with shape. */
  mediaStrip: 220,
  /** One year's square in a tradition or a child's growing-up strip (components/family/year-series.tsx). */
  yearTile: 112,
  /** The year's film on a wide screen: a phone's portrait, never the whole monitor. */
  filmMaxWidth: 420,
  /**
   * The narrowest a column of the welcome page's feature list gets in a
   * browser: two side by side on a computer, one on a phone - by flex-wrap,
   * so the pre-rendered HTML is right before the window is known.
   */
  landingColumn: 280,
  /**
   * The widest a bottom sheet gets.
   *
   * On a phone a sheet is the width of the screen and this never applies. In a
   * browser on a computer it is what stops a sheet from being 1,300px wide —
   * the date picker's day cells grew with it until six weeks no longer fit on
   * the screen and the Done button was somewhere below the bottom edge.
   */
  sheetMaxWidth: 520,
  /**
   * The widest a screen's content gets (item 39).
   *
   * The layout is a phone's, and on a computer it used to be stretched to the
   * window: a timeline card 1,400px wide, a month grid with day cells the size
   * of photographs, a tab bar whose four items were a hand's width apart. The
   * web build is what a family opens first, usually on a laptop, so this is
   * not a corner case - it is the first impression. A column the width of a
   * large phone held sideways keeps every screen's proportions and gives the
   * photographs room without turning lines of text into a sentence per glance.
   */
  contentMaxWidth: 720,
  /**
   * A computer's layout, past these widths (item 39, the second step). From
   * `railBreakpoint` the tabs leave the bottom for a rail down the left - a
   * monitor has room beside the content and none to spare below it; from
   * `twoColumnBreakpoint` the timeline lays its cards out two to a row in a
   * wider column, so a laptop shows a week of the family at a glance rather
   * than three cards and a lot of paper.
   */
  railBreakpoint: 1024,
  twoColumnBreakpoint: 1280,
  rail: 232,
  contentMaxWidthWide: 1080,
  /**
   * The mark above the wordmark on the welcome screen - a heart of two halves
   * and the child above them, the app icon's shape - by its width
   * (components/ui/logo-mark.tsx).
   */
  logoMark: 88,
  /** The mark behind a day number in the date picker: chosen, or today. */
  calendarDay: 40,
  /**
   * The tab bar, above the device's own bottom inset.
   *
   * The navigator's default is 49 — iOS's height for a 10px label. The labels
   * here are 12px on a 16px line (`typography.label`), and in the 10px that was
   * left for them their lower half was cut off on every phone size.
   * 60 since the label went to 13px on an 18px line: the same 8px to spare
   * that fixed the cut-off labels in the first place.
   */
  tabBar: 60,
} as const;

// ---------------------------------------------------------------------------
// Motion
//
// The character in one sentence: nothing announces itself. Motion answers a
// finger and carries you between places — it never celebrates. The brief
// already says it where the temptation is strongest ("do not add a celebratory
// animation on save — this is a note, not an achievement"), and the same rule
// holds everywhere else. This is a chronicle. It should feel like paper being
// turned, not an app being pleased with itself.
//
// Two speeds do nearly all the work. Chrome answers in `fast`, because a
// control that lags behind the finger feels broken. Things that arrive or leave
// take `normal`. Only a photograph gets `slow`: it is the content, and a hard
// cut to a half-decoded image reads as a fault rather than a picture.
//
// Everything here collapses to nothing when the system asks for reduced motion.
// `lib/motion.ts` is the one place that decides that, so it cannot be forgotten
// in a single component.
// ---------------------------------------------------------------------------

export const motion = {
  fast: 150,
  normal: 240,
  slow: 380,

  /**
   * Bezier control points rather than ready-made easing functions: tokens stay
   * plain data that a designer can rewrite, and `lib/motion.ts` is the only
   * file that turns them into curves.
   */
  curve: {
    /** Arriving — quick off the mark, settling gently. Nothing overshoots. */
    enter: [0.16, 1, 0.3, 1],
    /** Leaving — reluctant, then gone. */
    exit: [0.4, 0, 1, 1],
    /** Changing in place: a press, a colour, a height. */
    inOut: [0.4, 0, 0.2, 1],
    /**
     * The mark's own entrance, and only that: a little past the mark and back.
     * The one thing in the app allowed to overshoot - it is the product saying
     * hello, not a control answering a press.
     */
    pop: [0.26, 1.34, 0.46, 1],
  },

  /**
   * The mark coming together (components/ui/logo-mark.tsx): the halves swing
   * in and meet, the child lands on top, the heart beats once - and when the
   * welcome screen's lines rise in after it (components/ui/appear.tsx), one
   * `stagger` apart. Milliseconds from the first paint.
   */
  mark: { startAt: 100, meet: 700, land: 480, landAt: 420, beat: 320, beatAt: 980, linesAt: 420, stagger: 90 },

  /**
   * How much a thing gives under the finger, by what kind of thing it is.
   *
   * Not one number for everything: a card is a surface and should barely move,
   * while a row has no surface of its own, so dimming is the entire signal it
   * can give. The round buttons are small enough that 3% would not read at all.
   */
  press: {
    card: { scale: 0.985, opacity: 0.96 },
    row: { scale: 1, opacity: 0.6 },
    control: { scale: 0.97, opacity: 0.85 },
    round: { scale: 0.94, opacity: 1 },
    none: { scale: 1, opacity: 1 },
  },
} as const;
