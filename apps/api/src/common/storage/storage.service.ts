import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createReadStream, createWriteStream, type ReadStream } from 'node:fs';
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/**
 * WHERE THE PHOTOGRAPHS GO.
 *
 * Until now they went nowhere: the picker worked, the file stayed on the phone
 * that took it, and a family memory product whose photographs live on one
 * device is a demonstration rather than a product.
 *
 * ONE INTERFACE, TWO PLACES TO PUT BYTES. Today the bytes land on the server's
 * own disk, because the server is a machine in the house and a bucket is a
 * credit card away. The shape here is the shape S3 needs, so the switch later
 * is a driver and an environment variable rather than a rewrite: an upload is
 * "ask for a target, put the bytes there, say you are done", which is exactly
 * what a presigned PUT is.
 *
 * NOTHING IS PUBLIC. `Attachment` stores a storage key, never a URL - the
 * reason is in docs/02-DATA-MODEL.md: a photograph reachable through a
 * permanent link would defeat the visibility model completely, because one
 * forwarded message would be enough. Every read URL is signed, carries an
 * expiry, and is produced only after the event's own visibility check has
 * passed (modules/media/media.service.ts).
 */

/** Big enough for a phone photograph, small enough to bound one request. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * Photographs and voice notes.
 *
 * Not video yet: a video needs a frame grabbed for its thumbnail, which needs
 * ffmpeg on the server - a different piece of work with a different failure
 * mode. Refusing clearly beats storing something the timeline cannot draw.
 *
 * The audio types are what browsers record into: Chrome, Edge and Firefox make
 * Opus in WebM or Ogg, Safari makes AAC in MP4. A voice note needs no preview,
 * so there is nothing to generate and nothing that can fail after the upload.
 */
export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
  'audio/aac',
] as const;

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/aac': 'aac',
};

/**
 * A voice note's ceiling. Five minutes of Safari's AAC is about 5 MB and of
 * Opus under 3; anything much larger is not a voice note.
 */
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

/**
 * The type without its parameters, lower-cased: a recorder reports
 * "audio/webm;codecs=opus", and the list above names "audio/webm".
 */
export function baseMimeType(mimeType: string): string {
  return mimeType.split(';')[0].trim().toLowerCase();
}

/** Served back with the type it was stored as - the extension says which. */
export function contentTypeForKey(key: string): string {
  if (key.endsWith('_thumb.jpg') || key.endsWith('.jpg') || key.endsWith('.jpeg')) return 'image/jpeg';
  if (key.endsWith('.png')) return 'image/png';
  if (key.endsWith('.webp')) return 'image/webp';
  if (key.endsWith('.heic') || key.endsWith('.heif')) return 'image/heic';
  if (key.endsWith('.webm')) return 'audio/webm';
  if (key.endsWith('.ogg')) return 'audio/ogg';
  if (key.endsWith('.m4a')) return 'audio/mp4';
  if (key.endsWith('.mp3')) return 'audio/mpeg';
  if (key.endsWith('.aac')) return 'audio/aac';
  return 'application/octet-stream';
}

/**
 * How long a read link lives.
 *
 * Half an hour, which is a compromise between two real failures. Too short and
 * a family scrolling their own timeline watches the photographs turn into
 * broken images while they read - the links are handed out with the event list,
 * not fetched per image. Too long and a link that leaks stays useful. Half an
 * hour means a forwarded message is already dead when it is opened, and the
 * app re-signs everything on every refresh anyway.
 */
export const READ_TTL_SECONDS = 30 * 60;

/**
 * How long the client has to actually send the bytes.
 *
 * Longer than a read link: this one has to survive a 20 MB photograph going up
 * a home connection, and the person who started it walking into a lift.
 */
export const UPLOAD_TTL_SECONDS = 15 * 60;

/** A key this server generated, and the only shape it will ever serve. */
const KEY_PATTERN =
  /^families\/[a-z0-9]+\/(?:\d{4}\/[a-z0-9]+(?:_thumb)?|avatars\/[a-z0-9]+)\.[a-z0-9]+$/;

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(private readonly config: ConfigService) {}

  /** Where files live. Outside `apps/`, so a rebuild never touches them. */
  private get root(): string {
    return resolve(this.config.get<string>('MEDIA_ROOT') ?? join(process.cwd(), 'var', 'media'));
  }

  /**
   * The secret that makes a read URL unforgeable.
   *
   * Falls back to the JWT secret so a deployment that has one has both; a
   * server with neither gets a random one per boot, which means yesterday's
   * links stop working after a restart. That is the right failure: an
   * unsigned-but-accepted URL would be a silent hole.
   */
  private get secret(): string {
    const configured =
      this.config.get<string>('MEDIA_SIGNING_SECRET') ?? this.config.get<string>('JWT_SECRET');

    if (configured) return configured;

    this.bootSecret ??= randomBytes(32).toString('hex');
    return this.bootSecret;
  }

  private bootSecret: string | null = null;

  // ---------------------------------------------------------------------------
  // Keys
  // ---------------------------------------------------------------------------

  /** The key a new attachment's bytes will live under. */
  keyFor(familyId: string, attachmentId: string, mimeType: string): string {
    const year = new Date().getFullYear();
    return `families/${familyId}/${year}/${attachmentId}.${EXTENSIONS[mimeType] ?? 'bin'}`;
  }

  /**
   * Where a member's photograph lives. A new name every time it changes, so
   * a signed link to the old face cannot show the new one, and the other way
   * round: a phone that cached one is never shown a stale picture under it.
   */
  avatarKeyFor(familyId: string, memberId: string): string {
    return `families/${familyId}/avatars/${memberId}${randomBytes(4).toString('hex')}.webp`;
  }

  /**
   * Member rows on their way out, with a signed `avatarUrl` for every stored
   * photograph and the key itself left behind. Takes one member row or
   * anything carrying `members` (the family snapshot), and leaves anything
   * else as it is.
   */
  withAvatarUrls<T extends object>(value: T, baseUrl: string): T {
    const sign = (member: Record<string, unknown>) => {
      if (!('avatarKey' in member)) return member;
      const { avatarKey, ...rest } = member;
      return {
        ...rest,
        avatarUrl:
          typeof avatarKey === 'string' ? this.signedUrl(avatarKey, baseUrl).url : rest.avatarUrl ?? null,
      };
    };

    const row = value as Record<string, unknown>;
    if (Array.isArray(row.members)) {
      return { ...row, members: (row.members as Record<string, unknown>[]).map(sign) } as T;
    }
    return sign(row) as T;
  }

  /** The thumbnail beside it. Always a JPEG - it is 320px of preview, not an archive. */
  thumbnailKeyFor(storageKey: string): string {
    return storageKey.replace(/\.[a-z0-9]+$/, '_thumb.jpg');
  }

  // ---------------------------------------------------------------------------
  // Writing
  // ---------------------------------------------------------------------------

  /**
   * Stream a request body onto the disk, refusing anything over the cap.
   *
   * The cap is counted here rather than trusted from Content-Length: the
   * header is whatever the client wrote in it.
   */
  async write(key: string, body: Readable, limit: number = MAX_UPLOAD_BYTES): Promise<number> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });

    let bytes = 0;
    const count = async function* (source: Readable) {
      for await (const chunk of source) {
        bytes += (chunk as Buffer).length;
        // The ceiling for what this file is, counted as it arrives: the size
        // a client declared is a claim, the bytes are the fact.
        if (bytes > limit) throw new PayloadTooLarge();
        yield chunk;
      }
    };

    try {
      await pipeline(body, count, createWriteStream(path));
    } catch (error) {
      // A half-written file is worse than none: the next read would serve a
      // truncated photograph rather than an error.
      await this.remove(key);
      throw error;
    }

    return bytes;
  }

  /** Write a buffer, for the thumbnails this server generates itself. */
  async writeBuffer(key: string, data: Buffer): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await pipeline(Readable.from(data), createWriteStream(path));
  }

  async remove(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  /**
   * Every file a family has - photographs, thumbnails, voice notes, profile
   * pictures - when the family itself is deleted for good (housekeeping).
   * Only an id of the shape this server makes, so no value can reach outside
   * `families/`.
   */
  async removeFamily(familyId: string): Promise<void> {
    if (!/^[a-z0-9]+$/.test(familyId)) throw new Error(`Not a family id: ${familyId}`);
    await rm(join(this.root, 'families', familyId), { recursive: true, force: true });
  }

  async sizeOf(key: string): Promise<number | null> {
    try {
      return (await stat(this.pathFor(key))).size;
    } catch {
      return null;
    }
  }

  /** The file, or one inclusive byte range of it - what a media player seeks with. */
  read(key: string, range?: { start: number; end: number }): ReadStream {
    return createReadStream(this.pathFor(key), range);
  }

  /**
   * The whole file in memory, for the thumbnail generator.
   *
   * Bounded by MAX_UPLOAD_BYTES, and it is the one operation that genuinely
   * needs the bytes rather than a stream: an image library cannot resize what
   * it has not finished reading. A bucket driver fetches the object here.
   */
  async readBuffer(key: string): Promise<Buffer> {
    return readFile(this.pathFor(key));
  }

  // ---------------------------------------------------------------------------
  // Reading, with a signature
  // ---------------------------------------------------------------------------

  /**
   * A URL that works for five minutes and cannot be edited into another one.
   *
   * The signature covers the key AND the expiry, so moving either invalidates
   * it - without that, an expiry is a suggestion.
   */
  signedUrl(key: string, baseUrl: string): { url: string; expiresIn: number } {
    const expires = Math.floor(Date.now() / 1000) + READ_TTL_SECONDS;
    const signature = this.sign(key, expires);

    const url = `${baseUrl.replace(/\/+$/, '')}/v1/media/${encodeURI(key)}?expires=${expires}&signature=${signature}`;
    return { url, expiresIn: READ_TTL_SECONDS };
  }

  /** Does this signature belong to this key and this expiry, and is it still in date? */
  verify(key: string, expires: string | undefined, signature: string | undefined): boolean {
    if (!KEY_PATTERN.test(key) || !expires || !signature) return false;

    const deadline = Number(expires);
    if (!Number.isFinite(deadline) || deadline * 1000 < Date.now()) return false;

    const expected = Buffer.from(this.sign(key, deadline));
    const given = Buffer.from(signature);

    // Compared in constant time, and only when the lengths match - timingSafeEqual
    // throws on a length mismatch, which would itself be a signal.
    return expected.length === given.length && timingSafeEqual(expected, given);
  }

  private sign(key: string, expires: number): string {
    return createHmac('sha256', this.secret).update(`${key}:${expires}`).digest('hex');
  }

  // ---------------------------------------------------------------------------
  // Writing, with the same signature
  // ---------------------------------------------------------------------------

  /**
   * Where to put the bytes of an attachment that has just been created.
   *
   * Signed rather than authenticated, so that the client code is the same code
   * that will one day PUT to a presigned S3 URL: ask, put the bytes where you
   * were told, say you are done. The signature is bound to the one attachment
   * and expires, so it cannot be replayed onto another.
   */
  uploadUrl(attachmentId: string, baseUrl: string): { url: string; expiresIn: number } {
    const expires = Math.floor(Date.now() / 1000) + UPLOAD_TTL_SECONDS;
    const signature = this.signUpload(attachmentId, expires);

    const url = `${baseUrl.replace(/\/+$/, '')}/v1/uploads/${attachmentId}/bytes?expires=${expires}&signature=${signature}`;
    return { url, expiresIn: UPLOAD_TTL_SECONDS };
  }

  verifyUpload(
    attachmentId: string,
    expires: string | undefined,
    signature: string | undefined,
  ): boolean {
    if (!expires || !signature) return false;

    const deadline = Number(expires);
    if (!Number.isFinite(deadline) || deadline * 1000 < Date.now()) return false;

    const expected = Buffer.from(this.signUpload(attachmentId, deadline));
    const given = Buffer.from(signature);

    return expected.length === given.length && timingSafeEqual(expected, given);
  }

  private signUpload(attachmentId: string, expires: number): string {
    return createHmac('sha256', this.secret).update(`upload:${attachmentId}:${expires}`).digest('hex');
  }

  // ---------------------------------------------------------------------------

  /**
   * A key becomes a path here and nowhere else.
   *
   * Every key this server serves was generated by `keyFor`, but the one that
   * arrives on the read endpoint came from the network, so it is matched
   * against the pattern and then checked to be inside the root. Two defences
   * for the same thing, because a path traversal here would hand over every
   * family's photographs at once.
   */
  private pathFor(key: string): string {
    if (!KEY_PATTERN.test(key)) throw new InvalidStorageKey();

    const path = resolve(join(this.root, key));
    if (path !== this.root && !path.startsWith(this.root + sep)) throw new InvalidStorageKey();

    return path;
  }
}

export class PayloadTooLarge extends Error {
  constructor() {
    super('The upload is larger than the limit.');
    this.name = 'PayloadTooLarge';
  }
}

export class InvalidStorageKey extends Error {
  constructor() {
    super('Not a storage key this server issued.');
    this.name = 'InvalidStorageKey';
  }
}
