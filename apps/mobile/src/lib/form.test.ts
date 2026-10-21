import assert from 'node:assert/strict';

import { strings } from '@/i18n';
import { MIN_TEXT_LENGTH, isLongEnough } from './form';

describe('A name or a title', () => {
  it('needs two characters', () => {
    assert.equal(isLongEnough('A'), false);
    assert.equal(isLongEnough('Al'), true);
  });

  it('does not count the spaces around it', () => {
    // "A " typed on a phone keyboard is still one letter.
    assert.equal(isLongEnough(' A '), false);
    assert.equal(isLongEnough('   '), false);
  });

  it('is explained with the same number the rule uses', () => {
    // The message and the rule are separate lines of code; this is what keeps
    // a screen from saying "2" while refusing 3.
    for (const say of [
      strings['onboarding.firstNameTooShort'],
      strings['onboarding.familyNameTooShort'],
      strings['event.titleTooShort'],
    ]) {
      assert.match(say(MIN_TEXT_LENGTH), new RegExp(`\\b${MIN_TEXT_LENGTH}\\b`));
    }
  });
});
