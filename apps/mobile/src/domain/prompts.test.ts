import assert from 'node:assert/strict';

import { lv } from '@/i18n/lv';
import { strings } from '@/i18n/strings';
import { PROMPT_KEYS, hasAnswered, isPromptKey, promptForWeek } from './prompts';
import type { FamilyEvent } from './types';

describe('The question of the week', () => {
  const created = '2026-09-01T10:00:00.000Z';

  it('is the first question in the family’s first week', () => {
    assert.equal(promptForWeek(created, new Date('2026-09-03T10:00:00.000Z')), PROMPT_KEYS[0]);
  });

  it('moves on once a week, the same day for everybody', () => {
    assert.equal(promptForWeek(created, new Date('2026-09-08T09:59:00.000Z')), PROMPT_KEYS[0]);
    assert.equal(promptForWeek(created, new Date('2026-09-08T10:01:00.000Z')), PROMPT_KEYS[1]);
  });

  it('begins again after the last one', () => {
    const later = new Date(Date.parse(created) + PROMPT_KEYS.length * 7 * 864e5 + 1000);
    assert.equal(promptForWeek(created, later), PROMPT_KEYS[0]);
  });

  it('copes with a family date it cannot read', () => {
    assert.equal(promptForWeek('not a date'), PROMPT_KEYS[0]);
  });

  it('has words for every question in both languages', () => {
    for (const key of PROMPT_KEYS) {
      const id = `prompt.${key}` as keyof typeof strings;
      assert.equal(typeof strings[id], 'string', `English is missing ${id}`);
      assert.equal(typeof lv[id], 'string', `Latvian is missing ${id}`);
      assert.ok((strings[id] as string).endsWith('?') || (strings[id] as string).endsWith('.'));
    }
  });

  it('knows an answered question by its key and its author', () => {
    const answer = { promptKey: 'childhood-home', authorMemberId: 'mem_vera' } as FamilyEvent;
    assert.equal(hasAnswered([answer], 'childhood-home', 'mem_vera'), true);
    assert.equal(hasAnswered([answer], 'childhood-home', 'mem_anna'), false);
    assert.equal(hasAnswered([answer], 'first-job', 'mem_vera'), false);
  });

  it('recognises its own keys and nothing else', () => {
    assert.equal(isPromptKey('first-job'), true);
    assert.equal(isPromptKey('../etc'), false);
  });
});
