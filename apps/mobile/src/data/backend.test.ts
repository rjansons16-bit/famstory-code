import assert from 'node:assert/strict';

import { resolveBaseUrl } from './backend';

/**
 * Where the app thinks the server is.
 *
 * Small rule, expensive mistake: a wrong answer here is a build that talks to
 * nothing, on every device at once, with no error that names the cause.
 */

describe('The API address', () => {
  it('is absent when nothing is configured — the app runs on mock data', () => {
    assert.equal(resolveBaseUrl(undefined, 'http://192.168.1.10:8081'), null);
    assert.equal(resolveBaseUrl('   ', 'http://192.168.1.10:8081'), null);
  });

  it('is used as written when it is absolute', () => {
    assert.equal(
      resolveBaseUrl('http://192.168.1.10:3000/v1', 'http://example.invalid'),
      'http://192.168.1.10:3000/v1',
    );
  });

  it('follows the page when it is relative, so no IP is baked into the bundle', () => {
    // The same build opened at a new DHCP lease still finds its server.
    assert.equal(resolveBaseUrl('/v1', 'http://192.168.1.10:8081'), 'http://192.168.1.10:8081/v1');
    assert.equal(resolveBaseUrl('/v1', 'http://192.168.1.77:8081'), 'http://192.168.1.77:8081/v1');
  });

  it('does not double a slash when the origin carries one', () => {
    assert.equal(resolveBaseUrl('/v1', 'http://localhost:8081/'), 'http://localhost:8081/v1');
  });

  it('refuses a relative address where there is no page to be relative to', () => {
    // A native build: better to run on mock data than to talk to nothing.
    assert.equal(resolveBaseUrl('/v1', undefined), null);
  });
});
