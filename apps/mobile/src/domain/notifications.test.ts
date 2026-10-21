import assert from 'node:assert/strict';

import { useLocale } from '@/data/locale';
import { describeNotification } from './notifications';

/**
 * A notification put into words - in the reader's language, at the moment it
 * is drawn, from facts the server sent rather than a sentence it composed.
 */

afterEach(() => {
  useLocale.setState({ locale: 'en' });
});

const fromServer = {
  id: 'ntf_1',
  kind: 'event_created' as const,
  eventId: 'evt_1',
  eventTitle: 'Beach afternoon',
  actorName: 'Martin',
  createdAt: new Date().toISOString(),
};

describe('describeNotification', () => {
  it('says who did what, and to which event', () => {
    const { title, body } = describeNotification(fromServer);

    assert.equal(title, 'Martin added something new');
    assert.equal(body, 'Beach afternoon');
  });

  it('follows the language the reader chose', () => {
    useLocale.setState({ locale: 'lv' });

    assert.equal(describeNotification(fromServer).title, 'Martin pievienoja kaut ko jaunu');
  });

  it('copes with somebody whose name is gone', () => {
    const { title } = describeNotification({ ...fromServer, kind: 'comment_added', actorName: undefined });

    assert.equal(title, 'Somebody replied');
  });

  it("counts a special day from the day it is read, and names it in the reader's language", () => {
    const special = {
      id: 'ntf_2',
      kind: 'special_day' as const,
      dayKey: 'mothers-day',
      dayOn: '2026-05-10T12:00:00.000Z',
      createdAt: '2026-05-07T07:00:00.000Z',
    };
    const thursday = new Date(2026, 4, 7, 9);

    assert.equal(describeNotification(special, thursday).title, "Mother’s Day in 3 days");
    assert.equal(describeNotification(special, new Date(2026, 4, 9, 9)).title, 'Mother’s Day tomorrow');
    assert.equal(describeNotification(special, new Date(2026, 4, 12, 9)).title, 'Mother’s Day');

    useLocale.setState({ locale: 'lv' });
    assert.equal(describeNotification(special, thursday).title, 'Mātes diena pēc 3 dienām');
  });

  it('keeps the sample family’s own words', () => {
    const { title, body } = describeNotification({ ...fromServer, title: 'Written', body: 'By hand' });

    assert.deepEqual({ title, body }, { title: 'Written', body: 'By hand' });
  });
});
