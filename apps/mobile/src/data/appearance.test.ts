import assert from 'node:assert/strict';

import { isAppearancePreference, resolveColorScheme, useAppearance } from './appearance';

/**
 * Dark mode, as a choice.
 *
 * The Profile row used to say "Follows your device" and offer nothing to press.
 * These pin the two halves of the fix: the choice beats the device when there is
 * one, and it is still there on the next launch.
 */

const mockStored = new Map<string, unknown>();

jest.mock('./persist', () => ({
  APPEARANCE_KEY: 'famstory.appearance',
  persistedAppearance: {
    read: async () => mockStored.get('appearance') ?? null,
    write: async (value: unknown) => {
      mockStored.set('appearance', value);
    },
    readNowOnWeb: () => null,
  },
}));

describe('Which scheme is drawn', () => {
  it('follows the device while nothing is chosen', () => {
    assert.equal(resolveColorScheme('system', 'dark'), 'dark');
    assert.equal(resolveColorScheme('system', 'light'), 'light');
  });

  it('lets a choice win over the device, both ways', () => {
    assert.equal(resolveColorScheme('dark', 'light'), 'dark');
    assert.equal(resolveColorScheme('light', 'dark'), 'light');
  });

  it('reads a device that says nothing as light', () => {
    assert.equal(resolveColorScheme('system', null), 'light');
    assert.equal(resolveColorScheme('system', undefined), 'light');
  });
});

describe('The choice', () => {
  beforeEach(() => {
    mockStored.clear();
    useAppearance.setState({ preference: 'system', restored: false });
  });

  it('is kept for the next launch', () => {
    useAppearance.getState().setPreference('dark');
    assert.equal(useAppearance.getState().preference, 'dark');
    assert.deepEqual(mockStored.get('appearance'), { preference: 'dark' });
  });

  it('comes back on the next launch, and says when it has been read', async () => {
    mockStored.set('appearance', { preference: 'light' });
    await useAppearance.getState().restore();
    assert.equal(useAppearance.getState().preference, 'light');
    assert.equal(useAppearance.getState().restored, true);
  });

  it('ignores a stored value that is not a choice, and still lets the app start', async () => {
    // The root layout waits for `restored`; a bad value must not hold it forever.
    mockStored.set('appearance', { preference: 'purple' });
    await useAppearance.getState().restore();
    assert.equal(useAppearance.getState().preference, 'system');
    assert.equal(useAppearance.getState().restored, true);
  });

  it('can go back to following the device', () => {
    useAppearance.getState().setPreference('dark');
    useAppearance.getState().setPreference('system');
    assert.deepEqual(mockStored.get('appearance'), { preference: 'system' });
  });

  it('knows its own values', () => {
    assert.equal(isAppearancePreference('dark'), true);
    assert.equal(isAppearancePreference('Dark'), false);
    assert.equal(isAppearancePreference(undefined), false);
  });
});
