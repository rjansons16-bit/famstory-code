import assert from 'node:assert/strict';

import { track } from '@/domain/analytics';
import type { Family, Session } from '@/domain/types';

import { useApp } from './store';
import { flush, installTelemetry, reportError } from './telemetry';

/**
 * The sink against a pretend server: what is sent, when nothing is, and that
 * a switch turned off holds on this side too.
 */

const mockSend = jest.fn();
const mockReport = jest.fn();

jest.mock('./backend', () => ({
  ...jest.requireActual('./backend'),
  getApi: () => ({ sendTelemetry: mockSend, reportError: mockReport }),
}));

function session(shareUsageStats?: boolean): Session {
  return {
    user: {
      id: 'usr_1',
      email: 'anna@example.com',
      displayName: 'Anna',
      locale: 'en',
      createdAt: '2026-09-01T00:00:00.000Z',
      shareUsageStats,
    },
    activeFamilyId: 'fam_1',
    activeMemberId: 'mem_anna',
  };
}

const family = { id: 'fam_1', name: 'The Bergs', createdAt: '2026-09-01T00:00:00.000Z', plan: 'free', locale: 'en' } as Family;

let uninstall: () => void = () => {};

beforeEach(() => {
  mockSend.mockReset().mockResolvedValue(undefined);
  mockReport.mockReset().mockResolvedValue(undefined);
  useApp.setState({ session: session(true), family });
  uninstall = installTelemetry();
});

afterEach(async () => {
  uninstall();
  // Nothing left in line for the next test.
  useApp.setState({ session: null, family: null });
  await flush();
});

describe('The analytics sink', () => {
  it('sends what was tracked in one batch, under the family', async () => {
    track({ name: 'comment_added' });
    track({ name: 'reaction_added', kind: 'heart' });
    await flush();

    assert.equal(mockSend.mock.calls.length, 1);
    const [familyId, events] = mockSend.mock.calls[0];
    assert.equal(familyId, 'fam_1');
    assert.deepEqual(
      events.map((e: { name: string; props: object }) => [e.name, e.props]),
      [
        ['comment_added', {}],
        ['reaction_added', { kind: 'heart' }],
      ],
    );
    assert.ok(!Number.isNaN(Date.parse(events[0].at)));
  });

  it('keeps nothing for somebody who switched counting off', async () => {
    useApp.setState({ session: session(false) });
    track({ name: 'comment_added' });
    await flush();

    assert.equal(mockSend.mock.calls.length, 0);
  });

  it('keeps nothing while nobody is signed in', async () => {
    useApp.setState({ session: null });
    track({ name: 'comment_added' });
    await flush();

    assert.equal(mockSend.mock.calls.length, 0);
  });

  it('puts a failed batch back in line', async () => {
    mockSend.mockRejectedValueOnce(new Error('offline'));
    track({ name: 'group_created' });

    await flush();
    await flush();

    assert.equal(mockSend.mock.calls.length, 2);
    assert.equal(mockSend.mock.calls[1][1][0].name, 'group_created');
  });
});

describe('Error reports', () => {
  it('reports a message once, however often it happens', () => {
    reportError(new TypeError('cannot read title'));
    reportError(new TypeError('cannot read title'));

    assert.equal(mockReport.mock.calls.length, 1);
    assert.equal(mockReport.mock.calls[0][0].message, 'TypeError: cannot read title');
  });

  it('says nothing for somebody who switched counting off', () => {
    useApp.setState({ session: session(false) });
    reportError(new Error('another one'));

    assert.equal(mockReport.mock.calls.length, 0);
  });

  it('reports before anybody has signed in - the report carries nobody', () => {
    useApp.setState({ session: null });
    reportError(new Error('on the welcome screen'));

    assert.equal(mockReport.mock.calls.length, 1);
  });
});
