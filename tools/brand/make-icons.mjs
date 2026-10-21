/**
 * The app's icons, drawn from its mark.
 *
 * THE MARK (2026-09-30): a heart of two halves - two people leaning into each
 * other, one in Paper and one in Jade - and the child above them. It replaced
 * "Ligzda" (two dots and a smaller one held in a curve, 2026-09-26) when the
 * owner asked for another mark, and it was chosen from four new ones (a roof
 * over the family read as a face, a speech bubble as a chat app) for keeping
 * its shape from a home screen down to 16 px and for moving well: in the phone
 * view's splash and on the welcome screen the halves come together, the child
 * lands on top and the heart beats once - which is why the halves and the child
 * are also drawn as layers of their own (mark-*.png).
 *
 * The heart is the classic one: a square turned 45 degrees with a circle on
 * each of its upper sides, cut down the middle.
 *
 * Drawn once, on a 1024 grid, and every file is that drawing scaled and
 * coloured in the palette's own colours (apps/mobile/src/theme/tokens.ts).
 *
 * No text in the icon, on purpose: the name is under the icon on every home
 * screen already, and a letter in Fraunces would need the font on whatever
 * machine renders this - shapes need nothing.
 *
 *   node tools/brand/make-icons.mjs
 *
 * Needs sharp, which apps/api already has.
 */

import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const require = createRequire(path.join(repo, 'apps', 'api', 'package.json'));
const sharp = require('sharp');

// The palette, from tokens.ts.
const EVERGREEN = '#234E42';
const JADE = '#3DBB8C';
const PAPER = '#F4F1EA';
const WHITE = '#FFFFFF';

const out = path.join(repo, 'apps', 'mobile', 'assets', 'images');
mkdirSync(out, { recursive: true });

/**
 * The mark on its 1024 grid, centred on (512, 512). `s` is the side of the
 * turned square, `gap` the cut between the halves, `child` the child's radius
 * and `lift` its distance above the heart.
 */
function geometry({ s = 380, gap = 20, child = 64, lift = 44 } = {}) {
  const d = s * Math.SQRT2; // the square's diagonal
  const r = s / 2; // the circles' radius
  const h = gap / 2;
  // Laid out with the circles' top at 0, then centred on the grid.
  const cy = r; // the circles' centres
  const dipY = cy - d / 4; // the square's top corner, between the circles
  const cornerY = dipY + d / 2; // its left and right corners
  const tipY = dipY + d; // its bottom corner
  const childY = -lift - child;
  const top = childY - child;
  const off = 512 - top - (tipY - top) / 2;
  const Y = (v) => v + off;
  // Where the cut down the middle meets each circle.
  const cutY = cy - Math.sqrt(r * r - (d / 4 - h) * (d / 4 - h));
  return {
    left: `M ${512 - h} ${Y(tipY - h)} L ${512 - d / 2} ${Y(cornerY)} A ${r} ${r} 0 0 1 ${512 - h} ${Y(cutY)} Z`,
    right: `M ${512 + h} ${Y(tipY - h)} L ${512 + d / 2} ${Y(cornerY)} A ${r} ${r} 0 0 0 ${512 + h} ${Y(cutY)} Z`,
    child: { cx: 512, cy: Y(childY), r: child },
    // Its ink, for cropping: the circles' outer edges, the child's top, the point.
    box: { x: 512 - d / 4 - r, y: Y(top), w: 2 * (d / 4 + r), h: Y(tipY) - Y(top) },
  };
}

const MARK = geometry();
const BOX = MARK.box;

/** The mark's shapes: the left half and the child in `main`, the right half in `accent`. */
function shapes(main, accent, only = null) {
  const parts = {
    left: `<path d="${MARK.left}" fill="${main}"/>`,
    right: `<path d="${MARK.right}" fill="${accent}"/>`,
    child: `<circle cx="${MARK.child.cx}" cy="${MARK.child.cy}" r="${MARK.child.r}" fill="${main}"/>`,
  };
  return only ? parts[only] : `${parts.left}\n  ${parts.right}\n  ${parts.child}`;
}

/**
 * The mark centred in a square of `size` px, its height `span` of the side,
 * on an optional background tile with `corner` as a share of the side.
 */
function square(size, { span, main, accent, background = null, corner = 0 }) {
  const view = BOX.h / span;
  const x = 512 - view / 2;
  const y = 512 - view / 2;
  const back = background
    ? `<rect x="${x}" y="${y}" width="${view}" height="${view}" rx="${corner * view}" fill="${background}"/>`
    : '';
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${x} ${y} ${view} ${view}">
  ${back}
  ${shapes(main, accent)}
</svg>`);
}

/**
 * The mark alone, cropped to its ink, `width` px wide - for beside the name.
 * `only` draws one part on the same canvas, so the parts stack back into the
 * whole: the layers the splash and the welcome screen move.
 */
function strip(width, { main, accent, only = null }) {
  const height = Math.round((width * BOX.h) / BOX.w);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${BOX.x} ${BOX.y} ${BOX.w} ${BOX.h}">
  ${shapes(main, accent, only)}
</svg>`);
}

async function write(name, svg, { opaque = false } = {}) {
  const file = path.join(out, name);
  let image = sharp(svg);
  // The stores want an app icon with no alpha channel at all.
  if (opaque) image = image.flatten({ background: EVERGREEN }).removeAlpha();
  await image.png({ compressionLevel: 9 }).toFile(file);
  console.log(`  ${name}`);
}

console.log('Drawing the icons into apps/mobile/assets/images:');

// The app icon: the mark in Paper and Jade on Evergreen - the one colour the
// product is recognised by, and the contrast an icon needs among others. The
// square is full: iOS and the launchers round it themselves.
await write('icon.png', square(1024, { span: 0.6, main: PAPER, accent: JADE, background: EVERGREEN }), {
  opaque: true,
});

// Android's adaptive icon: the launcher masks it into its own shape, and only
// the middle two thirds are sure to be seen, so the mark sits inside that.
await write('android-icon-background.png', Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="${EVERGREEN}"/></svg>`,
));
await write('android-icon-foreground.png', square(1024, { span: 0.42, main: PAPER, accent: JADE }));
// One colour: the cut down the middle is what keeps the two halves two.
await write('android-icon-monochrome.png', square(1024, { span: 0.42, main: WHITE, accent: WHITE }));

// The splash: the design's own colours on Paper, the way the welcome screen
// that follows it looks, so the app opens without a flash of another colour.
await write('splash-icon.png', square(512, { span: 0.9, main: EVERGREEN, accent: JADE }));
// And for a phone in dark mode, where Evergreen on Ink would all but vanish.
await write('splash-icon-dark.png', square(512, { span: 0.9, main: PAPER, accent: JADE }));

// The browser tab: small, so the mark is large on a rounded tile.
await write('favicon.png', square(96, { span: 0.74, main: PAPER, accent: JADE, background: EVERGREEN, corner: 0.22 }));

// Above the name (components/ui/wordmark.tsx), in each theme's colours:
// Evergreen on Paper, and Paper on Ink, where Evergreen fades.
await write('logo-mark.png', strip(648, { main: EVERGREEN, accent: JADE }));
await write('logo-mark-dark.png', strip(648, { main: PAPER, accent: JADE }));

// The same mark as three layers on one canvas - the halves and the child - for
// the welcome screen to move (components/ui/logo-mark.tsx). The right half is
// Jade in both themes; the left half and the child follow the ground.
const LAYER_WIDTH = 432;
async function layers(writeOne) {
  for (const [suffix, main] of [['', EVERGREEN], ['-dark', PAPER]]) {
    await writeOne(`mark-left${suffix}.png`, strip(LAYER_WIDTH, { main, accent: JADE, only: 'left' }));
    await writeOne(`mark-child${suffix}.png`, strip(LAYER_WIDTH, { main, accent: JADE, only: 'child' }));
  }
  await writeOne('mark-right.png', strip(LAYER_WIDTH, { main: EVERGREEN, accent: JADE, only: 'right' }));
}
await layers(write);

// And the same layers written into the app's code, as data: on the web they
// then come with the pre-rendered page itself, there at the first paint - the
// moment the mark's CSS animation starts - rather than a request later, when
// it would already have come together unseen (components/ui/logo-mark.tsx).
const inline = {};
async function keep(name, svg) {
  const png = await sharp(svg).png({ compressionLevel: 9 }).toBuffer();
  const key = name.replace('.png', '').replace('mark-', '').replace(/-(\w)/g, (_, c) => c.toUpperCase());
  inline[key] = `data:image/png;base64,${png.toString('base64')}`;
}
await layers(keep);
const layersFile = path.join(repo, 'apps', 'mobile', 'src', 'components', 'ui', 'mark-layers.ts');
writeFileSync(
  layersFile,
  `// Drawn by tools/brand/make-icons.mjs - run it again rather than editing this.
// The mark's three layers as data (the left half and the child in each
// theme's ink, the right half in Jade), and its width over its height.

export const MARK_RATIO = ${BOX.w.toFixed(2)} / ${BOX.h.toFixed(2)};

export const MARK_LAYERS = ${JSON.stringify(inline, null, 2)} as const;
`,
);
console.log('  src/components/ui/mark-layers.ts');

// --- The web app: installable, and seen in search results and shared links ---
// These go to apps/mobile/public, which the web export serves as they are.
const web = path.join(repo, 'apps', 'mobile', 'public');
mkdirSync(web, { recursive: true });

async function writeWeb(name, image, { opaque = false } = {}) {
  let out = sharp(image);
  if (opaque) out = out.flatten({ background: EVERGREEN }).removeAlpha();
  await out.png({ compressionLevel: 9 }).toFile(path.join(web, name));
  console.log(`  public/${name}`);
}

// The icons an installed web app uses (manifest.webmanifest): the rounded
// tile, and a "maskable" one whose mark keeps to the middle four fifths,
// which is what Android is sure to leave visible whatever shape it cuts.
await writeWeb('icon-192.png', square(192, { span: 0.6, main: PAPER, accent: JADE, background: EVERGREEN, corner: 0.22 }));
await writeWeb('icon-512.png', square(512, { span: 0.6, main: PAPER, accent: JADE, background: EVERGREEN, corner: 0.22 }));
await writeWeb('icon-maskable-512.png', square(512, { span: 0.48, main: PAPER, accent: JADE, background: EVERGREEN }), {
  opaque: true,
});
// Safari's home screen icon: square and opaque, iOS rounds it.
await writeWeb('apple-touch-icon.png', square(180, { span: 0.6, main: PAPER, accent: JADE, background: EVERGREEN }), {
  opaque: true,
});
// The layers again, for the phone view's splash (tools/lan-host/phone.html),
// which is served beside the web app and takes them from its root.
await layers(writeWeb);

// The picture a shared link or a search result shows (og:image): the mark and
// the name in the design's serif, and the promise. Text is drawn with the
// app's own font files, so it looks the same on any machine that runs this.
const fonts = path.join(repo, 'apps', 'mobile', 'node_modules', '@expo-google-fonts');
async function words(text, font, fontfile, color) {
  const { data, info } = await sharp({
    text: { text: `<span foreground="${color}">${text}</span>`, font, fontfile, rgba: true, dpi: 72 },
  })
    .png()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}
const name = await words('FamStory', 'Fraunces SemiBold 132', path.join(fonts, 'fraunces', '600SemiBold', 'Fraunces_600SemiBold.ttf'), PAPER);
const promise = await words(
  'Every family moment, tied together.',
  'Inter Medium 40',
  path.join(fonts, 'inter', '500Medium', 'Inter_500Medium.ttf'),
  '#DCE5DF',
);
const MARK_HEIGHT = 216;
const markWidth = Math.round((MARK_HEIGHT * BOX.w) / BOX.h);
const mark = await sharp(strip(markWidth, { main: PAPER, accent: JADE })).png().toBuffer();
const card = sharp({ create: { width: 1200, height: 630, channels: 3, background: EVERGREEN } }).composite([
  { input: mark, left: Math.round((1200 - markWidth) / 2), top: 60 },
  { input: name.data, left: Math.round((1200 - name.width) / 2), top: 300 },
  { input: promise.data, left: Math.round((1200 - promise.width) / 2), top: 450 },
]);
await writeWeb('og-image.png', await card.png().toBuffer(), { opaque: true });

console.log('Done.');
