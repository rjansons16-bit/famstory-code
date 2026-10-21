import { BadRequestException } from '@nestjs/common';

import { LIMITS, categoryId, instant, optionalText, requiredText, tagList } from './input';

/** The code a refusal carries - what the app reads. */
function codeOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    if (error instanceof BadRequestException) return (error.getResponse() as { code?: string }).code;
    throw error;
  }
  return undefined;
}

describe('What people type, on the way in', () => {
  it('required text is trimmed, and refused when empty, blank, not text or too long', () => {
    expect(requiredText('  Jāņi  ', 10, 'invalid_title', 'A title')).toBe('Jāņi');
    expect(codeOf(() => requiredText('', 10, 'invalid_title', 'A title'))).toBe('invalid_title');
    expect(codeOf(() => requiredText('   ', 10, 'invalid_title', 'A title'))).toBe('invalid_title');
    expect(codeOf(() => requiredText(42, 10, 'invalid_title', 'A title'))).toBe('invalid_title');
    expect(codeOf(() => requiredText(undefined, 10, 'invalid_title', 'A title'))).toBe('invalid_title');
    expect(codeOf(() => requiredText('x'.repeat(11), 10, 'invalid_title', 'A title'))).toBe('invalid_title');
  });

  it('optional text: not sent is left alone, blank is cleared, too long is refused', () => {
    expect(optionalText(undefined, 10, 'invalid_description', 'A description')).toBeUndefined();
    expect(optionalText(null, 10, 'invalid_description', 'A description')).toBeNull();
    expect(optionalText('   ', 10, 'invalid_description', 'A description')).toBeNull();
    expect(optionalText(' kopā ', 10, 'invalid_description', 'A description')).toBe('kopā');
    expect(codeOf(() => optionalText(7, 10, 'invalid_description', 'A description'))).toBe('invalid_description');
    expect(codeOf(() => optionalText('x'.repeat(11), 10, 'invalid_description', 'A description'))).toBe(
      'invalid_description',
    );
  });

  it('an instant must be a date', () => {
    expect(instant('2026-10-10T09:00:00.000Z', 'The start').toISOString()).toBe('2026-10-10T09:00:00.000Z');
    expect(codeOf(() => instant('tomorrow-ish', 'The start'))).toBe('invalid_date');
    expect(codeOf(() => instant(undefined, 'The start'))).toBe('invalid_date');
  });

  it('only a category the app can draw', () => {
    expect(categoryId('health')).toBe('health');
    expect(codeOf(() => categoryId('gardening'))).toBe('invalid_category');
    expect(codeOf(() => categoryId(undefined))).toBe('invalid_category');
  });

  it('tags: short texts, each once, not too many', () => {
    expect(tagList(undefined)).toBeUndefined();
    expect(tagList([' Jāņi', 'Jāņi ', 'Skola'])).toEqual(['Jāņi', 'Skola']);
    expect(codeOf(() => tagList('Jāņi'))).toBe('invalid_tags');
    expect(codeOf(() => tagList(['ok', '']))).toBe('invalid_tags');
    expect(codeOf(() => tagList(['x'.repeat(LIMITS.tag + 1)]))).toBe('invalid_tags');
    expect(codeOf(() => tagList(Array.from({ length: LIMITS.tags + 1 }, (_, i) => `t${i}`)))).toBe('invalid_tags');
  });
});
