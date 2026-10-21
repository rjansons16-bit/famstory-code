import assert from 'node:assert/strict';

import { ApiError, HttpClient, type TokenStore } from './http';

/**
 * HTTP client tests with a fake fetch.
 *
 * The most important one here is "parallel 401s refresh the token only once":
 * with rotating refresh tokens, two concurrent refreshes would invalidate each
 * other, the server would conclude the token was stolen, and the user would be
 * signed out mid-task. That is hard to notice in production; here it is one test.
 */

function tokenStore(initial?: { accessToken: string; refreshToken: string }): TokenStore & {
  saves: number;
  cleared: number;
} {
  return {
    accessToken: initial?.accessToken ?? null,
    refreshToken: initial?.refreshToken ?? null,
    saves: 0,
    cleared: 0,
    save(tokens) {
      this.accessToken = tokens.accessToken;
      this.refreshToken = tokens.refreshToken;
      this.saves++;
    },
    clear() {
      this.accessToken = null;
      this.refreshToken = null;
      this.cleared++;
    },
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('HttpClient — basics', () => {
  it('adds the Bearer token and Accept-Language', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const client = new HttpClient({
      baseUrl: 'https://api.test/v1',
      tokens: tokenStore({ accessToken: 'acc', refreshToken: 'ref' }),
      locale: () => 'en',
      fetchImpl: ((url: string, init: RequestInit) => {
        calls.push({ url, init });
        return Promise.resolve(jsonResponse(200, { ok: true }));
      }) as unknown as typeof fetch,
    });

    await client.get('/families/fam_1/events');

    const headers = calls[0].init.headers as Record<string, string>;
    assert.equal(headers.Authorization, 'Bearer acc');
    assert.equal(headers['Accept-Language'], 'en');
    assert.equal(calls[0].url, 'https://api.test/v1/families/fam_1/events');
  });

  it('query parameters reach the URL and undefined ones are dropped', async () => {
    let seen = '';
    const client = new HttpClient({
      baseUrl: 'https://api.test/v1',
      tokens: tokenStore({ accessToken: 'acc', refreshToken: 'ref' }),
      fetchImpl: ((url: string) => {
        seen = url;
        return Promise.resolve(jsonResponse(200, []));
      }) as unknown as typeof fetch,
    });

    await client.get('/events', { categoryId: 'health', limit: 20, q: undefined });

    assert.ok(seen.includes('categoryId=health'));
    assert.ok(seen.includes('limit=20'));
    assert.ok(!seen.includes('q='));
  });

  it('204 returns undefined instead of failing to parse JSON', async () => {
    const client = new HttpClient({
      baseUrl: 'https://api.test/v1',
      tokens: tokenStore({ accessToken: 'acc', refreshToken: 'ref' }),
      fetchImpl: (() => Promise.resolve(new Response(null, { status: 204 }))) as unknown as typeof fetch,
    });

    assert.equal(await client.delete('/groups/grp_1'), undefined);
  });
});

describe('HttpClient — errors', () => {
  it('the server error code reaches ApiError', async () => {
    const client = new HttpClient({
      baseUrl: 'https://api.test/v1',
      tokens: tokenStore({ accessToken: 'acc', refreshToken: 'ref' }),
      fetchImpl: (() =>
        Promise.resolve(
          jsonResponse(403, { error: { code: 'visibility_denied', message: 'Event not available.' } }),
        )) as unknown as typeof fetch,
    });

    await assert.rejects(
      () => client.get('/events/evt_1'),
      (error: ApiError) => {
        assert.equal(error.code, 'visibility_denied');
        assert.equal(error.status, 403);
        return true;
      },
    );
  });

  it('a plan limit is recognisable without comparing strings', async () => {
    const client = new HttpClient({
      baseUrl: 'https://api.test/v1',
      tokens: tokenStore({ accessToken: 'acc', refreshToken: 'ref' }),
      fetchImpl: (() =>
        Promise.resolve(
          jsonResponse(403, { error: { code: 'plan_limit_reached', message: 'Limit.', limit: 50 } }),
        )) as unknown as typeof fetch,
    });

    await assert.rejects(
      () => client.post('/events', {}),
      (error: ApiError) => {
        assert.equal(error.isPlanLimit, true);
        assert.equal(error.body?.limit, 50);
        return true;
      },
    );
  });

  it('a non-JSON response does not break error handling', async () => {
    const client = new HttpClient({
      baseUrl: 'https://api.test/v1',
      tokens: tokenStore({ accessToken: 'acc', refreshToken: 'ref' }),
      fetchImpl: (() =>
        Promise.resolve(new Response('<html>502</html>', { status: 502 }))) as unknown as typeof fetch,
    });

    await assert.rejects(
      () => client.get('/events'),
      (error: ApiError) => {
        assert.equal(error.status, 502);
        assert.equal(error.code, 'http_502');
        return true;
      },
    );
  });
});

describe('HttpClient — token refresh', () => {
  it('a 401 refreshes the token and retries the request', async () => {
    const tokens = tokenStore({ accessToken: 'stale', refreshToken: 'ref' });
    const seen: string[] = [];

    const client = new HttpClient({
      baseUrl: 'https://api.test/v1',
      tokens,
      fetchImpl: ((url: string, init: RequestInit) => {
        seen.push(url);
        if (url.endsWith('/auth/refresh')) {
          return Promise.resolve(jsonResponse(200, { accessToken: 'fresh', refreshToken: 'ref2' }));
        }
        const auth = (init.headers as Record<string, string>).Authorization;
        return Promise.resolve(
          auth === 'Bearer fresh'
            ? jsonResponse(200, { items: [] })
            : jsonResponse(401, { error: { code: 'invalid_token', message: 'nope' } }),
        );
      }) as unknown as typeof fetch,
    });

    await client.get('/families/fam_1/events');

    assert.equal(tokens.accessToken, 'fresh');
    assert.equal(tokens.refreshToken, 'ref2');
    assert.equal(seen.filter((u) => u.endsWith('/auth/refresh')).length, 1);
  });

  it('five parallel 401s trigger the refresh EXACTLY ONCE', async () => {
    const tokens = tokenStore({ accessToken: 'stale', refreshToken: 'ref' });
    let refreshCalls = 0;

    const client = new HttpClient({
      baseUrl: 'https://api.test/v1',
      tokens,
      fetchImpl: ((url: string, init: RequestInit) => {
        if (url.endsWith('/auth/refresh')) {
          refreshCalls++;
          return new Promise((resolve) =>
            setTimeout(
              () => resolve(jsonResponse(200, { accessToken: 'fresh', refreshToken: 'ref2' })),
              10,
            ),
          );
        }
        const auth = (init.headers as Record<string, string>).Authorization;
        return Promise.resolve(
          auth === 'Bearer fresh'
            ? jsonResponse(200, { ok: true })
            : jsonResponse(401, { error: { code: 'invalid_token', message: 'nope' } }),
        );
      }) as unknown as typeof fetch,
    });

    await Promise.all([
      client.get('/a'),
      client.get('/b'),
      client.get('/c'),
      client.get('/d'),
      client.get('/e'),
    ]);

    assert.equal(refreshCalls, 1, 'rotation would break if refresh happened more than once');
  });

  it('a failed refresh clears the tokens and reports the session end', async () => {
    const tokens = tokenStore({ accessToken: 'stale', refreshToken: 'ref' });
    let expired = 0;

    const client = new HttpClient({
      baseUrl: 'https://api.test/v1',
      tokens,
      onSessionExpired: () => expired++,
      fetchImpl: ((url: string) =>
        Promise.resolve(
          url.endsWith('/auth/refresh')
            ? jsonResponse(401, { error: { code: 'token_reuse_detected', message: 'gone' } })
            : jsonResponse(401, { error: { code: 'invalid_token', message: 'nope' } }),
        )) as unknown as typeof fetch,
    });

    await assert.rejects(() => client.get('/events'));

    assert.equal(tokens.accessToken, null);
    assert.equal(tokens.cleared, 1);
    assert.equal(expired, 1);
  });

  it('the refresh call does not retry itself forever', async () => {
    const tokens = tokenStore({ accessToken: 'stale', refreshToken: 'ref' });
    let calls = 0;

    const client = new HttpClient({
      baseUrl: 'https://api.test/v1',
      tokens,
      fetchImpl: (() => {
        calls++;
        return Promise.resolve(jsonResponse(401, { error: { code: 'invalid_token', message: 'x' } }));
      }) as unknown as typeof fetch,
    });

    await assert.rejects(() => client.get('/events'));

    // One original call plus one refresh attempt. No loop.
    assert.equal(calls, 2);
  });

  it('with no refresh token the refresh is not even attempted', async () => {
    const tokens = tokenStore({ accessToken: 'stale', refreshToken: null as unknown as string });
    let calls = 0;

    const client = new HttpClient({
      baseUrl: 'https://api.test/v1',
      tokens,
      fetchImpl: (() => {
        calls++;
        return Promise.resolve(jsonResponse(401, { error: { code: 'invalid_token', message: 'x' } }));
      }) as unknown as typeof fetch,
    });

    await assert.rejects(() => client.get('/events'));
    assert.equal(calls, 1);
  });
});

describe('HttpClient — when there is no answer', () => {
  it('gives up rather than waiting forever', async () => {
    const client = new HttpClient({
      baseUrl: 'https://api.test/v1',
      tokens: tokenStore(),
      timeoutMs: 20,
      // A server that accepted the request and then said nothing - a phone
      // that has lost signal mid-request looks exactly like this.
      fetchImpl: ((_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            const error = new Error('Aborted');
            error.name = 'AbortError';
            reject(error);
          });
        })) as unknown as typeof fetch,
    });

    const error = await client.get('/events').catch((e: unknown) => e);

    assert.ok(error instanceof ApiError);
    assert.equal(error.code, 'request_timed_out');
    assert.equal(error.status, 0);
  });

  it('says something readable when the connection fails', async () => {
    const client = new HttpClient({
      baseUrl: 'https://api.test/v1',
      tokens: tokenStore(),
      fetchImpl: (() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch,
    });

    const error = await client.get('/events').catch((e: unknown) => e);

    assert.ok(error instanceof ApiError);
    assert.equal(error.code, 'network_unreachable');
    // Never the engine's own wording, which tells a person nothing.
    assert.ok(!error.message.includes('Failed to fetch'));
  });

  it('does not leave a request waiting once it has answered', async () => {
    // A deadline that has already passed by the time the answer is read: the
    // timer must be cleared on the way out, not left to fire into nothing.
    const client = new HttpClient({
      baseUrl: 'https://api.test/v1',
      tokens: tokenStore(),
      timeoutMs: 5,
      fetchImpl: (() => Promise.resolve(jsonResponse(200, { ok: true }))) as unknown as typeof fetch,
    });

    const body = await client.get<{ ok: boolean }>('/events');
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.deepEqual(body, { ok: true });
  });
});
