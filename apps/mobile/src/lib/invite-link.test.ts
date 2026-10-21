import assert from 'node:assert/strict';
import { Platform } from 'react-native';

import { inviteLink, inviteMessage } from './invite-link';

/**
 * The address an invitation points at.
 *
 * On the web it has to be THIS build's address, whatever that is - the LAN IP
 * at home today, a domain later. A hardcoded host would produce an invitation
 * that works for the person who sent it and for nobody else.
 */

describe('inviteLink', () => {
  it('points at the address this app is being used from', () => {
    // This suite runs once per platform (jest-expo), and the answer differs:
    // a browser has an address to share, a phone has the app's own scheme.
    if (Platform.OS === 'web') {
      assert.equal(inviteLink('FAM-1234'), `${window.location.origin}/join/FAM-1234`);
    } else {
      assert.equal(inviteLink('FAM-1234'), 'famstory://join/FAM-1234');
    }
  });

  it("from a phone, the public site's address: it opens the app, or the web app without it", () => {
    if (Platform.OS === 'web') return;
    assert.equal(inviteLink('FAM-1234', 'https://famstory.lv'), 'https://famstory.lv/join/FAM-1234');
    // Not an https site (a LAN build): the scheme, never an address that only works at home.
    assert.equal(inviteLink('FAM-1234', 'http://192.168.1.5:8081'), 'famstory://join/FAM-1234');
  });

  it('escapes a code rather than pasting it into a path', () => {
    assert.ok(inviteLink('FAM 12/34').endsWith('/join/FAM%2012%2F34'));
  });
});

describe('inviteMessage', () => {
  it('carries the family, the link and the code', () => {
    const message = inviteMessage('The Bergs', 'FAM-1234');

    assert.ok(message.includes('The Bergs'));
    assert.ok(message.includes('/join/FAM-1234'));
    // The code on its own line: some messengers eat a link they do not know,
    // and somebody reading this on a laptop has to be able to type it.
    assert.ok(message.trim().endsWith('FAM-1234'));
  });
});
