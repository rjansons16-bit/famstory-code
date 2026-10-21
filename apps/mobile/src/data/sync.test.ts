import assert from 'node:assert/strict';

import { ApiError } from './http';
import { useApp } from './store';

/**
 * `syncNow` — the refresh a pull-down and a return to the app both ask for.
 *
 * Driven against a fake backend whose `me()` returns a user with no family:
 * `refresh` stops there, which is exactly the part this file does not care
 * about. What it does care about is the wrapper — one request for two callers,
 * a refusal that reaches the banner, and a dead session that does not.
 */

const mockMe = jest.fn();

jest.mock('./backend', () => ({
  ...jest.requireActual('./backend'),
  getApi: () => ({ me: mockMe }),
}));

const noFamily = {
  id: 'u1',
  email: 'a@b.c',
  displayName: 'A',
  avatarUrl: null,
  locale: 'en',
  createdAt: new Date().toISOString(),
  members: [],
};

beforeEach(() => {
  mockMe.mockReset().mockResolvedValue(noFamily);
  useApp.setState({ lastError: null, lastSyncedAt: null });
});

describe('syncNow', () => {
  it('asks the server once when two screens pull at the same time', async () => {
    const both = Promise.all([useApp.getState().syncNow(), useApp.getState().syncNow()]);
    await both;

    assert.equal(mockMe.mock.calls.length, 1);
  });

  it('asks again once the first answer has arrived', async () => {
    await useApp.getState().syncNow();
    await useApp.getState().syncNow();

    assert.equal(mockMe.mock.calls.length, 2);
  });

  it('records when the data arrived', async () => {
    await useApp.getState().syncNow();

    assert.ok((useApp.getState().lastSyncedAt ?? 0) > 0);
  });

  it('reports a refusal instead of throwing', async () => {
    mockMe.mockRejectedValue(new ApiError(500, 'server_error', 'Something broke'));

    await useApp.getState().syncNow();

    assert.equal(useApp.getState().lastError?.code, 'server_error');
    // Nothing arrived, so nothing may claim it did.
    assert.equal(useApp.getState().lastSyncedAt, null);
  });

  it('says nothing about a session that has already ended', async () => {
    // The HTTP client is signing the user out; a banner would land on the
    // welcome screen, about a family the reader no longer appears to be in.
    mockMe.mockRejectedValue(new ApiError(401, 'unauthorized', 'Token expired'));

    await useApp.getState().syncNow();

    assert.equal(useApp.getState().lastError, null);
  });

  it('leaves a dropped connection readable', async () => {
    mockMe.mockRejectedValue(new TypeError('Failed to fetch'));

    await useApp.getState().syncNow();

    assert.equal(useApp.getState().lastError?.code, 'network_unreachable');
  });

  it('does not sign somebody back in with an answer that arrives after they signed out', async () => {
    // Coming back to the window starts a refresh; "Sign out" pressed while it
    // is on its way used to be undone by its answer - the second press worked.
    let answer: (value: typeof noFamily) => void = () => {};
    mockMe.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );

    const sync = useApp.getState().syncNow();
    useApp.getState().signOut();
    answer(noFamily);
    await sync;

    assert.equal(useApp.getState().session, null);
    assert.equal(useApp.getState().lastSyncedAt, null);
  });

  it('says nothing about a refusal that arrives after the sign-out', async () => {
    let refuse: (error: Error) => void = () => {};
    mockMe.mockReturnValue(
      new Promise((_resolve, reject) => {
        refuse = reject;
      }),
    );

    const sync = useApp.getState().syncNow();
    useApp.getState().signOut();
    refuse(new ApiError(500, 'server_error', 'Something broke'));
    await sync;

    assert.equal(useApp.getState().lastError, null);
  });
});
