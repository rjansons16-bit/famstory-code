import { generateKeyPairSync, verify } from 'node:crypto';

import {
  ApnsTransport,
  FcmTransport,
  apnsOutcome,
  fcmAccountFrom,
  fcmOutcome,
  pemFrom,
} from './transports';

/**
 * The two doors onto a phone. Nothing here reaches Apple or Google: the
 * tokens are checked with the public half of keys made for the test, and
 * Google's two addresses are a recording fetch.
 */

const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const ecPem = ec.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const rsaPem = rsa.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

const message = { title: 'Atgādinājums', body: 'Drīz kaut kas notiek.', data: { kind: 'event_reminder', eventId: 'evt_1' } };

describe('Keys as an .env holds them', () => {
  it('takes the PEM as it is, with its line breaks written out, or in base64', () => {
    expect(pemFrom(ecPem)).toBe(ecPem.trim());
    expect(pemFrom(ecPem.trim().replace(/\n/g, '\\n'))).toBe(ecPem.trim());
    expect(pemFrom(Buffer.from(ecPem).toString('base64'))).toBe(ecPem);
    expect(pemFrom('not a key')).toBe('');
    expect(pemFrom(undefined)).toBe('');
  });

  it("reads Firebase's service account file, as JSON or in base64, and nothing less", () => {
    const file = JSON.stringify({ project_id: 'famstory-lv', client_email: 'push@famstory-lv.iam', private_key: rsaPem });
    expect(fcmAccountFrom(file)).toEqual({ projectId: 'famstory-lv', clientEmail: 'push@famstory-lv.iam', privateKey: rsaPem.trim() });
    expect(fcmAccountFrom(Buffer.from(file).toString('base64'))?.projectId).toBe('famstory-lv');
    expect(fcmAccountFrom(JSON.stringify({ project_id: 'x' }))).toBeNull();
    expect(fcmAccountFrom('{broken')).toBeNull();
    expect(fcmAccountFrom('')).toBeNull();
  });
});

describe('Apple', () => {
  const settings = { keyPem: ecPem, keyId: 'KEY1234567', teamId: 'TEAM123456', topic: 'lv.famstory.app', sandbox: false };

  it('is off without every part of the key', () => {
    expect(new ApnsTransport({ ...settings, keyId: '' }).configured).toBe(false);
    expect(new ApnsTransport(settings).configured).toBe(true);
  });

  it('signs its provider token with the key, ES256, naming the key and the team', () => {
    const now = Date.UTC(2026, 9, 12, 9, 0, 0);
    const token = new ApnsTransport(settings).token(now);
    const [head, claims, signature] = token.split('.');

    expect(decode(head)).toEqual({ alg: 'ES256', kid: 'KEY1234567' });
    expect(decode(claims)).toEqual({ iss: 'TEAM123456', iat: now / 1000 });
    const valid = verify(
      'sha256',
      Buffer.from(`${head}.${claims}`),
      { key: ec.publicKey, dsaEncoding: 'ieee-p1363' },
      Buffer.from(signature, 'base64url'),
    );
    expect(valid).toBe(true);
  });

  it('keeps one token for fifty minutes, as Apple asks, and then makes a new one', () => {
    const apns = new ApnsTransport(settings);
    const start = Date.UTC(2026, 9, 12, 9, 0, 0);
    const first = apns.token(start);
    expect(apns.token(start + 49 * 60_000)).toBe(first);
    expect(apns.token(start + 51 * 60_000)).not.toBe(first);
  });

  it("reads Apple's answers: sent, gone, or a token it calls bad", () => {
    expect(apnsOutcome(200, '')).toBe('sent');
    expect(apnsOutcome(410, '{"reason":"Unregistered"}')).toBe('unregistered');
    expect(apnsOutcome(400, '{"reason":"BadDeviceToken"}')).toBe('unregistered');
    expect(apnsOutcome(400, '{"reason":"PayloadTooLarge"}')).toBe('failed');
    expect(apnsOutcome(403, '{"reason":"InvalidProviderToken"}')).toBe('failed');
  });
});

describe('Google', () => {
  const account = { projectId: 'famstory-lv', clientEmail: 'push@famstory-lv.iam', privateKey: rsaPem };

  function recording(answers: { status: number; body: unknown }[]) {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = async (url: string, init?: RequestInit) => {
      calls.push({ url, init: init ?? {} });
      const answer = answers.shift() ?? { status: 500, body: {} };
      return new Response(typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body), {
        status: answer.status,
      });
    };
    return { calls, fetchImpl };
  }

  it("asks Google's OAuth with an RS256 assertion for the messaging scope", () => {
    const now = Date.UTC(2026, 9, 12, 9, 0, 0);
    const [head, claims, signature] = new FcmTransport(account).assertion(now).split('.');
    expect(decode(head)).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(decode(claims)).toEqual({
      iss: 'push@famstory-lv.iam',
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now / 1000,
      exp: now / 1000 + 3600,
    });
    expect(verify('sha256', Buffer.from(`${head}.${claims}`), rsa.publicKey, Buffer.from(signature, 'base64url'))).toBe(true);
  });

  it('sends to the project with the access token, and reuses the token for the next one', async () => {
    const { calls, fetchImpl } = recording([
      { status: 200, body: { access_token: 'at_1', expires_in: 3600 } },
      { status: 200, body: { name: 'projects/famstory-lv/messages/1' } },
      { status: 200, body: { name: 'projects/famstory-lv/messages/2' } },
    ]);
    const fcm = new FcmTransport(account, fetchImpl);

    expect(await fcm.send('fcm-token-1', message)).toBe('sent');
    expect(await fcm.send('fcm-token-2', message)).toBe('sent');

    expect(calls.map((c) => c.url)).toEqual([
      'https://oauth2.googleapis.com/token',
      'https://fcm.googleapis.com/v1/projects/famstory-lv/messages:send',
      'https://fcm.googleapis.com/v1/projects/famstory-lv/messages:send',
    ]);
    const sent = JSON.parse(String(calls[1].init.body));
    expect((calls[1].init.headers as Record<string, string>).authorization).toBe('Bearer at_1');
    expect(sent.message).toEqual({
      token: 'fcm-token-1',
      notification: { title: message.title, body: message.body },
      data: message.data,
      android: { priority: 'HIGH', notification: { channel_id: 'default' } },
    });
  });

  it('a token Google no longer knows is gone; a refused access token is asked for again', async () => {
    const { calls, fetchImpl } = recording([
      { status: 200, body: { access_token: 'at_1', expires_in: 3600 } },
      { status: 404, body: { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } } },
      { status: 401, body: { error: { status: 'UNAUTHENTICATED' } } },
      { status: 200, body: { access_token: 'at_2', expires_in: 3600 } },
      { status: 200, body: {} },
    ]);
    const fcm = new FcmTransport(account, fetchImpl);

    expect(await fcm.send('old-token', message)).toBe('unregistered');
    expect(await fcm.send('fcm-token', message)).toBe('failed');
    expect(await fcm.send('fcm-token', message)).toBe('sent');
    expect(calls.filter((c) => c.url.includes('oauth2')).length).toBe(2);
  });

  it("reads Google's answers", () => {
    expect(fcmOutcome(200, '')).toBe('sent');
    expect(fcmOutcome(404, '')).toBe('unregistered');
    expect(fcmOutcome(400, '{"error":{"message":"The registration token is not a valid FCM registration token"}}')).toBe(
      'unregistered',
    );
    expect(fcmOutcome(400, '{"error":{"message":"Invalid JSON payload"}}')).toBe('failed');
    expect(fcmOutcome(503, '')).toBe('failed');
  });
});
