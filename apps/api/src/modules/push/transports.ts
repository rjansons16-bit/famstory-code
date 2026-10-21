import { createPrivateKey, sign, type KeyObject } from 'node:crypto';
import { connect, type ClientHttp2Session } from 'node:http2';

import type { PushMessage } from './push-messages';

/**
 * THE TWO WAYS ONTO A PHONE: Apple's APNs for an iPhone, Google's FCM for
 * Android - spoken to directly, with the keys from the two developer
 * accounts, so no third company stands between this server and the phone
 * (docs/12-LAUNCH-RUNBOOK.md, sections 3 and 4).
 *
 * `unregistered` means the phone no longer takes pushes for this app - it was
 * uninstalled, or the token was replaced - and the device row is deleted.
 * Anything else that goes wrong is `failed`: logged, not retried. A late
 * reminder is worse than none (notifications.service.ts says the same).
 */
export type PushOutcome = 'sent' | 'unregistered' | 'failed';

export interface PushTransport {
  readonly configured: boolean;
  send(token: string, message: PushMessage): Promise<PushOutcome>;
}

const base64url = (value: string | Buffer) => Buffer.from(value).toString('base64url');

/**
 * A key as the console gave it, or as it fits on one line of an .env: the
 * PEM itself, the PEM with `\n` written out, or the whole file in base64.
 */
export function pemFrom(value: string | undefined): string {
  const raw = (value ?? '').trim();
  if (!raw) return '';
  if (raw.includes('BEGIN')) return raw.replace(/\\n/g, '\n');
  const decoded = Buffer.from(raw, 'base64').toString('utf8');
  return decoded.includes('BEGIN') ? decoded : '';
}

// ---------------------------------------------------------------------------
// Apple
// ---------------------------------------------------------------------------

export interface ApnsSettings {
  /** The .p8 key: Certificates, Identifiers & Profiles, Keys, with "Apple Push Notifications service". */
  keyPem: string;
  keyId: string;
  teamId: string;
  /** The app's bundle identifier. */
  topic: string;
  /** Development builds; TestFlight and the App Store use production. */
  sandbox: boolean;
}

/** Apple wants a new token between 20 and 60 minutes; refreshed at 50. */
const APNS_TOKEN_MS = 50 * 60 * 1000;

export class ApnsTransport implements PushTransport {
  private session: ClientHttp2Session | null = null;
  private bearer: { token: string; madeAt: number } | null = null;
  private key: KeyObject | null = null;

  constructor(private readonly settings: ApnsSettings) {}

  get configured(): boolean {
    const s = this.settings;
    return Boolean(s.keyPem && s.keyId && s.teamId && s.topic);
  }

  /** The provider token: ES256 over the team and the time, with the key's id. */
  token(now = Date.now()): string {
    if (this.bearer && now - this.bearer.madeAt < APNS_TOKEN_MS) return this.bearer.token;
    this.key ??= createPrivateKey(this.settings.keyPem);
    const head = base64url(JSON.stringify({ alg: 'ES256', kid: this.settings.keyId }));
    const claims = base64url(JSON.stringify({ iss: this.settings.teamId, iat: Math.floor(now / 1000) }));
    const signature = sign('sha256', Buffer.from(`${head}.${claims}`), {
      key: this.key,
      dsaEncoding: 'ieee-p1363',
    }).toString('base64url');
    this.bearer = { token: `${head}.${claims}.${signature}`, madeAt: now };
    return this.bearer.token;
  }

  private connection(): ClientHttp2Session {
    if (this.session && !this.session.closed && !this.session.destroyed) return this.session;
    const host = this.settings.sandbox ? 'api.sandbox.push.apple.com' : 'api.push.apple.com';
    const session = connect(`https://${host}`);
    const forget = () => {
      if (this.session === session) this.session = null;
    };
    session.on('error', forget);
    session.on('goaway', forget);
    session.on('close', forget);
    // Kept open between pushes, as Apple asks, but not forever when idle.
    session.setTimeout(5 * 60 * 1000, () => session.close());
    session.unref();
    this.session = session;
    return session;
  }

  send(token: string, message: PushMessage): Promise<PushOutcome> {
    const body = JSON.stringify({
      aps: { alert: { title: message.title, body: message.body }, sound: 'default' },
      ...message.data,
    });
    return new Promise((resolve) => {
      let request;
      try {
        request = this.connection().request({
          ':method': 'POST',
          ':path': `/3/device/${token}`,
          authorization: `bearer ${this.token()}`,
          'apns-topic': this.settings.topic,
          'apns-push-type': 'alert',
          'apns-priority': '10',
          'content-type': 'application/json',
        });
      } catch {
        resolve('failed');
        return;
      }
      let status = 0;
      let text = '';
      request.setEncoding('utf8');
      request.on('response', (headers) => {
        status = Number(headers[':status']);
      });
      request.on('data', (chunk: string) => {
        text += chunk;
      });
      request.on('end', () => resolve(apnsOutcome(status, text)));
      request.on('error', () => resolve('failed'));
      request.setTimeout(10_000, () => {
        request.close();
        resolve('failed');
      });
      request.end(body);
    });
  }
}

/** Apple's answer: 200 sent, 410 gone; a token Apple calls bad is gone too. */
export function apnsOutcome(status: number, body: string): PushOutcome {
  if (status === 200) return 'sent';
  if (status === 410) return 'unregistered';
  if (status === 400 && /"reason"\s*:\s*"(BadDeviceToken|DeviceTokenNotForTopic)"/.test(body)) return 'unregistered';
  return 'failed';
}

// ---------------------------------------------------------------------------
// Google
// ---------------------------------------------------------------------------

/** The fields of a Firebase service account key this needs. */
export interface FcmAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

/**
 * FCM_SERVICE_ACCOUNT: the JSON file Firebase gives (Project settings,
 * Service accounts, Generate new private key), as it is or in base64.
 */
export function fcmAccountFrom(value: string | undefined): FcmAccount | null {
  const raw = (value ?? '').trim();
  if (!raw) return null;
  const text = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  try {
    const json = JSON.parse(text) as { project_id?: string; client_email?: string; private_key?: string };
    if (!json.project_id || !json.client_email || !json.private_key) return null;
    return { projectId: json.project_id, clientEmail: json.client_email, privateKey: pemFrom(json.private_key) };
  } catch {
    return null;
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

export class FcmTransport implements PushTransport {
  private access: { token: string; until: number } | null = null;

  constructor(
    private readonly account: FcmAccount | null,
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
  ) {}

  get configured(): boolean {
    return this.account !== null;
  }

  /** A signed assertion for Google's OAuth: RS256, the account, the FCM scope, an hour. */
  assertion(now = Date.now()): string {
    const account = this.account!;
    const iat = Math.floor(now / 1000);
    const head = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64url(
      JSON.stringify({ iss: account.clientEmail, scope: FCM_SCOPE, aud: GOOGLE_TOKEN_URL, iat, exp: iat + 3600 }),
    );
    const signature = sign('sha256', Buffer.from(`${head}.${claims}`), createPrivateKey(account.privateKey)).toString(
      'base64url',
    );
    return `${head}.${claims}.${signature}`;
  }

  private async accessToken(now = Date.now()): Promise<string> {
    if (this.access && now < this.access.until) return this.access.token;
    const response = await this.fetchImpl(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: this.assertion(now),
      }).toString(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Google refused the FCM key: ${response.status}`);
    const json = (await response.json()) as { access_token: string; expires_in?: number };
    // Five minutes early, so a token never runs out mid-send.
    this.access = { token: json.access_token, until: now + Math.max(60, (json.expires_in ?? 3600) - 300) * 1000 };
    return json.access_token;
  }

  async send(token: string, message: PushMessage): Promise<PushOutcome> {
    if (!this.account) return 'failed';
    try {
      const response = await this.fetchImpl(
        `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(this.account.projectId)}/messages:send`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${await this.accessToken()}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              token,
              notification: { title: message.title, body: message.body },
              data: message.data,
              android: { priority: 'HIGH', notification: { channel_id: 'default' } },
            },
          }),
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (response.ok) return 'sent';
      if (response.status === 401) this.access = null;
      return fcmOutcome(response.status, await response.text());
    } catch {
      return 'failed';
    }
  }
}

/** Google's answer: a token it no longer knows, or one that never was, is gone. */
export function fcmOutcome(status: number, body: string): PushOutcome {
  if (status === 200) return 'sent';
  if (status === 404 || /UNREGISTERED/.test(body)) return 'unregistered';
  if (status === 400 && /registration token/i.test(body)) return 'unregistered';
  return 'failed';
}
