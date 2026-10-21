import assert from 'node:assert/strict';

import { CATEGORIES, CATEGORY_BY_ID, suggestCategory } from './categories';
import type { CategoryId } from './types';

/**
 * Category tests.
 *
 * `suggestCategory` is the MVP "AI". It is not a model, so nobody expects
 * miracles from it — but it has to be PREDICTABLE. A suggestion that appears
 * at random, or is plainly wrong, is worse than no suggestion at all: the user
 * dismisses it once and never looks at the next one.
 */

describe('CATEGORIES list', () => {
  it('holds exactly ten life-cycle categories', () => {
    assert.equal(CATEGORIES.length, 10);
  });

  it('every category has a unique id', () => {
    const ids = CATEGORIES.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it('CATEGORY_BY_ID covers every category', () => {
    for (const category of CATEGORIES) {
      assert.equal(CATEGORY_BY_ID[category.id].id, category.id);
    }
  });

  it('every category has an i18n key and a tone', () => {
    for (const category of CATEGORIES) {
      assert.match(category.labelKey, /^category\./);
      assert.ok(category.tone.length > 0, `${category.id} has no tone`);
    }
  });

  it('"other" is neutral — it is the default, not an accent', () => {
    assert.equal(CATEGORY_BY_ID.other.tone, 'neutral');
  });
});

describe('suggestCategory — recognition', () => {
  const cases: [string, CategoryId][] = [
    ["Robert's birthday", 'celebration'],
    ['Christmas at the grandparents', 'celebration'],
    ["Emily's first day of school", 'education'],
    ['Maths exam', 'education'],
    ['Dentist at 4pm', 'health'],
    ['Vaccination at the clinic', 'health'],
    ['Trip to Italy', 'travel'],
    ['Swimming practice', 'activity'],
    ['Wedding anniversary', 'milestone'],
    ['Mortgage payment', 'finance'],
    ["Robert's first steps", 'development'],
    ['Car inspection', 'chore'],
  ];

  for (const [title, expected] of cases) {
    it(`"${title}" → ${expected}`, () => {
      assert.equal(suggestCategory(title), expected);
    });
  }

  it('searches the description too, not only the title', () => {
    assert.equal(suggestCategory('Wednesday', 'Take her to the dentist'), 'health');
  });

  it('case does not matter', () => {
    assert.equal(suggestCategory('BIRTHDAY'), 'celebration');
    assert.equal(suggestCategory('birthday'), 'celebration');
  });

  it('matches plurals and possessives through stems', () => {
    for (const title of ['School', 'Schools', "School's trip out", 'Back to school']) {
      assert.ok(suggestCategory(title) !== null, title);
    }
  });
});

describe('suggestCategory — when to stay quiet', () => {
  it('empty text gives no suggestion', () => {
    assert.equal(suggestCategory(''), null);
    assert.equal(suggestCategory('   '), null);
  });

  it('text that is too short gives no suggestion', () => {
    assert.equal(suggestCategory('ab'), null);
  });

  it('text with no keywords gives no suggestion', () => {
    assert.equal(suggestCategory('Something else entirely happened'), null);
  });

  it('never suggests "other" — that is already the default', () => {
    for (const title of ['birthday', 'school', 'doctor', 'trip']) {
      assert.notEqual(suggestCategory(title), 'other');
    }
  });

  it('returns a valid CategoryId or null, never anything else', () => {
    const valid = new Set(CATEGORIES.map((c) => c.id));
    const samples = ['birthday', 'school', 'nothing', '', 'doctor and practice'];
    for (const sample of samples) {
      const result = suggestCategory(sample);
      assert.ok(result === null || valid.has(result), `unexpected: ${result}`);
    }
  });
});

describe('suggestCategory — multiple matches', () => {
  it('the category with more hits wins', () => {
    // "school" + "exam" = two education hits against one health hit.
    assert.equal(suggestCategory('Exam at school after the appointment'), 'education');
  });

  it('a modifier like "first" does not drown out the concrete signal', () => {
    assert.equal(suggestCategory("Emily's first day of school"), 'education');
    assert.equal(suggestCategory("Robert's first steps"), 'development');
  });

  it('the result is deterministic — the same text always gives the same answer', () => {
    const text = 'Doctor and practice on the same day';
    const first = suggestCategory(text);
    for (let i = 0; i < 5; i++) {
      assert.equal(suggestCategory(text), first);
    }
  });

  it('genuinely ambiguous input still returns a valid, stable category', () => {
    // "School concert" is both education and activity. Keyword matching cannot
    // settle that, and it does not need to: the user confirms the suggestion.
    const first = suggestCategory('School concert');
    assert.ok(['education', 'activity'].includes(first as string), String(first));
    assert.equal(suggestCategory('School concert'), first);
  });
});
