import assert from 'node:assert/strict';

import { categoryTone, colors, onMedia, type ToneKey } from './tokens';

/**
 * CAN IT BE READ?
 *
 * WCAG 2.2 AA, computed from the tokens rather than judged by eye: 4.5:1 for
 * text, 3:1 for the parts of a control you have to see to use it (1.4.11).
 * The pairs are the ones the screens actually put together - a colour that is
 * never text on a ground is not tested as if it were.
 *
 * The people this matters to first are the ones the product is built around:
 * a grandmother reading "who can see this" on a phone in daylight.
 */

type Rgb = [number, number, number];

function parse(color: string): { rgb: Rgb; alpha: number } {
  const hex = color.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], alpha: 1 };
  }
  const rgba = color.match(/^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)$/);
  if (rgba) {
    return { rgb: [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])], alpha: rgba[4] ? Number(rgba[4]) : 1 };
  }
  throw new Error(`Not a colour this test understands: ${color}`);
}

/** A translucent colour laid over an opaque one. */
function over(top: string, ground: Rgb): Rgb {
  const { rgb, alpha } = parse(top);
  return rgb.map((c, i) => Math.round(c * alpha + ground[i] * (1 - alpha))) as Rgb;
}

function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function ratio(fg: Rgb, bg: Rgb): number {
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

const rgb = (color: string) => parse(color).rgb;
const TEXT = 4.5;
const UI = 3;

function expectAtLeast(min: number, fg: string, bg: string, what: string) {
  const r = ratio(rgb(fg), rgb(bg));
  assert.ok(r >= min, `${what}: ${fg} on ${bg} is ${r.toFixed(2)}:1, needs ${min}:1`);
}

for (const mode of ['light', 'dark'] as const) {
  const c = colors[mode];
  const grounds = { background: c.background, surface: c.surface, surfaceMuted: c.surfaceMuted };

  describe(`Contrast, ${mode}`, () => {
    it('body text and muted text read on every ground', () => {
      for (const [name, ground] of Object.entries(grounds)) {
        expectAtLeast(TEXT, c.text, ground, `text on ${name}`);
        expectAtLeast(TEXT, c.textMuted, ground, `textMuted on ${name}`);
      }
    });

    it('the primary colour reads as text and carries text on it', () => {
      expectAtLeast(TEXT, c.textOnPrimary, c.primary, 'textOnPrimary on primary');
      expectAtLeast(TEXT, c.primary, c.background, 'primary on background');
      expectAtLeast(TEXT, c.primary, c.surface, 'primary on surface');
      expectAtLeast(TEXT, c.text, c.primarySoft, 'text on primarySoft (the selected chip)');
    });

    it('accent text - "who can see this", a suggestion\'s Accept - reads where it sits', () => {
      expectAtLeast(TEXT, c.accentText, c.surface, 'accentText on surface');
      expectAtLeast(TEXT, c.accentText, c.background, 'accentText on background');
      expectAtLeast(TEXT, c.accentText, c.accentSoft, 'accentText on accentSoft');
      // The rest of the suggestion banner: its sentence and its No thanks.
      expectAtLeast(TEXT, c.text, c.accentSoft, 'text on accentSoft');
      expectAtLeast(TEXT, c.textMuted, c.accentSoft, 'textMuted on accentSoft');
    });

    it('danger reads as text, on its own ground too', () => {
      expectAtLeast(TEXT, c.danger, c.background, 'danger on background');
      expectAtLeast(TEXT, c.danger, c.surface, 'danger on surface');
      expectAtLeast(TEXT, c.danger, c.dangerSoft, 'danger on dangerSoft');
    });

    it('warning and accent marks are visible as marks', () => {
      expectAtLeast(UI, c.warning, c.surface, 'warning (a bar, an icon) on surface');
      expectAtLeast(UI, c.accentText, c.surface, 'accentText (an icon) on surface');
    });

    it('every category tone reads on its own chip', () => {
      for (const [key, tone] of Object.entries(categoryTone[mode]) as [ToneKey, { fg: string; bg: string }][]) {
        expectAtLeast(TEXT, tone.fg, tone.bg, `${key} tone`);
      }
    });
  });
}

describe('Text on a photograph', () => {
  it('a caption on the scrim reads even over a white photograph', () => {
    const worst = over(onMedia.scrim, [255, 255, 255]);
    const r = ratio(rgb(onMedia.text), worst);
    assert.ok(r >= TEXT, `caption on the scrim over white is ${r.toFixed(2)}:1`);
  });
});
