import assert from 'node:assert/strict';

import type { Attachment } from '@/domain/types';
import { media } from '@/theme';
import { coverAspect } from './media';

/**
 * The photograph rule, as arithmetic.
 *
 * The reasoning lives in `theme/tokens.ts`; these tests hold the two things
 * that reasoning depends on — that a photograph keeps its own shape between the
 * limits, and that nothing (a missing dimension, a zero, a corrupt record) can
 * make the layout fall back to something that crops or stretches it.
 */

const att = (width?: number, height?: number): Attachment => ({
  id: 'att_test',
  kind: 'image',
  url: 'https://example.invalid/photo.jpg',
  width,
  height,
});

describe('A photograph in the timeline', () => {
  it('keeps its own shape when it is between the limits', () => {
    assert.equal(coverAspect(att(1200, 800)), 1.5);
  });

  it('is square at the tallest, so the chronicle stays scannable', () => {
    // A 2:3 portrait would fill two-thirds of a phone with one entry.
    assert.equal(coverAspect(att(800, 1200)), 1);
  });

  it('is never wider than 16:9, so the card does not wear a letterbox', () => {
    assert.equal(coverAspect(att(2100, 900)), media.card.maxAspect);
  });
});

describe('A photograph on the opened event', () => {
  it('keeps a portrait shape, down to 4:5', () => {
    // Nothing to scan past here: the photograph is the content.
    assert.equal(coverAspect(att(800, 1200), media.detail), 0.8);
    assert.equal(coverAspect(att(1000, 1200), media.detail), 1000 / 1200);
  });

  it('is still capped at 16:9', () => {
    assert.equal(coverAspect(att(1600, 700), media.detail), media.detail.maxAspect);
  });
});

describe('A photograph the app knows nothing about', () => {
  it('falls back to 3:2 rather than to a fixed height', () => {
    // An upload that has not been measured yet must not make the layout jump
    // once it has been.
    assert.equal(coverAspect(att()), media.fallbackAspect);
    assert.equal(coverAspect(undefined), media.fallbackAspect);
  });

  it('survives a broken record', () => {
    assert.equal(coverAspect(att(0, 0)), media.fallbackAspect);
    assert.equal(coverAspect(att(1200, 0)), media.fallbackAspect);
    assert.equal(coverAspect(att(Number.NaN, 800)), media.fallbackAspect);
  });
});
