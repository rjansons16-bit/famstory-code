import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { AttachmentKind } from '@prisma/client';
import type { Readable } from 'node:stream';
import sharp from 'sharp';

import { AuditService } from '../../common/audit.service';
import { PrismaService } from '../../common/prisma.service';
import {
  ALLOWED_MIME_TYPES,
  MAX_AUDIO_BYTES,
  MAX_UPLOAD_BYTES,
  PayloadTooLarge,
  StorageService,
  baseMimeType,
} from '../../common/storage/storage.service';
import { PLAN_SELECT, isPremium } from '../subscriptions/premium';
import { VisibilityService, type ViewerContext } from '../visibility/visibility.service';

/**
 * PUTTING A PHOTOGRAPH ON THE SERVER.
 *
 * Three steps, in the shape a presigned S3 upload has, because that is what
 * this becomes when a bucket exists (common/storage/storage.service.ts):
 *
 *   1. ASK.      The client says what it is about to send. The server checks
 *                who is asking, whether the event will take another photograph,
 *                and whether the type is one it can serve - then creates the
 *                row and hands back a URL.
 *   2. SEND.     The bytes go to that URL and nowhere else. The URL is signed
 *                and expires; it is not a second way into the API.
 *   3. CONFIRM.  The client says it finished. Only now does the server read the
 *                image, make the thumbnail, and mark the attachment real.
 *
 * WHY A ROW BEFORE THE BYTES. The alternative - upload first, attach after -
 * needs somewhere to keep an orphan, and an orphan with no owner is exactly
 * the thing nobody cleans up. Here an abandoned upload is a row with no
 * `uploadedAt`, which every read already filters out and one query can sweep.
 *
 * WHY THE EVENT EXISTS FIRST. The composer saves the event and then sends the
 * photographs, so the id is always there to attach to. It also means a failed
 * upload costs the photograph, not the memory somebody just wrote down.
 */

/** The longest side of the preview the timeline and the calendar draw. */
const THUMBNAIL_PX = 480;

/** Free plan, per event. Mirrors `apps/mobile/src/domain/plans.ts`. */
const FREE_MAX_ATTACHMENTS = 3;
const PREMIUM_MAX_ATTACHMENTS = 20;

/**
 * Voice notes are counted apart from photographs: a grandmother's story does
 * not use up the room for the pictures of the day it is about. Mirrors plans.ts.
 */
const FREE_MAX_VOICE_NOTES = 2;
const PREMIUM_MAX_VOICE_NOTES = 10;

/** Fifteen minutes, which no voice note reaches; only a display value. */
const MAX_DURATION_SEC = 15 * 60;

/** What a stored type is, and so what may be done with it. */
function kindOf(mimeType: string): AttachmentKind {
  return mimeType.startsWith('audio/') ? AttachmentKind.audio : AttachmentKind.image;
}

function limitFor(kind: AttachmentKind): number {
  return kind === AttachmentKind.audio ? MAX_AUDIO_BYTES : MAX_UPLOAD_BYTES;
}

function tooLarge(kind: AttachmentKind) {
  return new PayloadTooLargeException({
    code: 'file_too_large',
    message:
      kind === AttachmentKind.audio
        ? 'That voice note is longer than the limit.'
        : 'That photograph is larger than the limit.',
    limit: limitFor(kind),
  });
}

export interface UploadTarget {
  attachmentId: string;
  uploadUrl: string;
  /** What the client should do with the URL. PUT today, PUT against S3 later. */
  method: 'PUT';
  expiresIn: number;
  maxBytes: number;
}

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly visibility: VisibilityService,
    private readonly audit: AuditService,
  ) {}

  /** Step 1: may this person add this photograph or voice note to this event, and where. */
  async requestUpload(
    ctx: ViewerContext,
    eventId: string,
    input: { mimeType: string; sizeBytes: number; fileName?: string; durationSec?: number },
    baseUrl: string,
  ): Promise<UploadTarget> {
    const mimeType = baseMimeType(input.mimeType);
    if (!ALLOWED_MIME_TYPES.includes(mimeType as (typeof ALLOWED_MIME_TYPES)[number])) {
      throw new BadRequestException({
        code: 'unsupported_media_type',
        message: 'Only photographs and voice notes can be uploaded for now.',
        allowed: ALLOWED_MIME_TYPES,
      });
    }
    const kind = kindOf(mimeType);

    if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
      throw new BadRequestException({ code: 'invalid_size', message: 'Size is required.' });
    }

    if (input.sizeBytes > limitFor(kind)) throw tooLarge(kind);

    // The same check the timeline uses, and it runs before anything is written:
    // an event this person cannot see must not gain an attachment.
    await this.visibility.assertCanOpenEvent(ctx, eventId);

    const event = await this.prisma.event.findFirst({
      where: { id: eventId, familyId: ctx.familyId, deletedAt: null },
      select: { id: true, authorMemberId: true, familyId: true },
    });

    if (!event) {
      throw new NotFoundException({ code: 'not_found', message: 'Event not found.' });
    }

    // Adding a photograph is editing the event, so it answers to the same rule.
    const own = event.authorMemberId === ctx.memberId;
    this.visibility.assertCan(ctx, own ? 'event.edit_own' : 'event.edit_any');

    await this.assertWithinPlanLimit(event.familyId, eventId, kind);

    // How long it is, for "1:24" beside the play button - the recorder knows,
    // and nothing here plays it to find out. Photographs have none.
    const durationSec =
      kind === AttachmentKind.audio && Number.isFinite(input.durationSec)
        ? Math.min(MAX_DURATION_SEC, Math.max(1, Math.round(input.durationSec as number)))
        : null;

    const attachment = await this.prisma.attachment.create({
      data: {
        eventId,
        kind,
        durationSec,
        // A placeholder until the id exists; rewritten immediately below,
        // because the key is built FROM the id so that one file belongs to
        // exactly one row and a retry cannot overwrite somebody else's.
        storageKey: '',
        mimeType,
        sizeBytes: input.sizeBytes,
      },
      select: { id: true },
    });

    const storageKey = this.storage.keyFor(event.familyId, attachment.id, mimeType);
    await this.prisma.attachment.update({
      where: { id: attachment.id },
      data: { storageKey },
    });

    const { url, expiresIn } = this.storage.uploadUrl(attachment.id, baseUrl);

    return {
      attachmentId: attachment.id,
      uploadUrl: url,
      method: 'PUT',
      expiresIn,
      maxBytes: limitFor(kind),
    };
  }

  /**
   * Step 2: the bytes.
   *
   * Authorised by the signature on the URL rather than by a token, exactly as
   * a presigned S3 PUT is, so that the client code does not change when the
   * bucket arrives. The signature names one attachment and expires.
   */
  async receive(
    attachmentId: string,
    query: { expires?: string; signature?: string },
    body: Readable,
  ): Promise<void> {
    if (!this.storage.verifyUpload(attachmentId, query.expires, query.signature)) {
      throw new ForbiddenException({
        code: 'upload_not_authorised',
        message: 'This upload link is not valid any more.',
      });
    }

    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
      select: { storageKey: true, uploadedAt: true, kind: true },
    });

    if (!attachment?.storageKey) {
      throw new NotFoundException({ code: 'not_found', message: 'Upload not found.' });
    }

    // Uploading twice over the same signature would let a valid link be reused
    // to replace a photograph the family has already seen.
    if (attachment.uploadedAt) {
      throw new ForbiddenException({
        code: 'already_uploaded',
        message: 'This photograph has already been uploaded.',
      });
    }

    try {
      const bytes = await this.storage.write(attachment.storageKey, body, limitFor(attachment.kind));
      await this.prisma.attachment.update({
        where: { id: attachmentId },
        data: { sizeBytes: bytes },
      });
    } catch (error) {
      if (error instanceof PayloadTooLarge) throw tooLarge(attachment.kind);
      throw error;
    }
  }

  /**
   * Step 3: make it real.
   *
   * The thumbnail is generated here rather than on the phone because the
   * phone's copy is the one thing this server cannot check, and a timeline of
   * twenty 4 MB photographs is the difference between a product that opens and
   * one that does not.
   *
   * A format sharp cannot read - an iPhone HEIC on a build without libheif -
   * is not an error the family should see: the original is already stored and
   * readable by their browser, so the attachment completes without a thumbnail
   * and the read path falls back to the original.
   */
  async complete(ctx: ViewerContext, attachmentId: string) {
    const attachment = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, event: { familyId: ctx.familyId } },
      select: { id: true, eventId: true, storageKey: true, mimeType: true, uploadedAt: true, kind: true },
    });

    if (!attachment) {
      throw new NotFoundException({ code: 'not_found', message: 'Upload not found.' });
    }

    await this.visibility.assertCanOpenEvent(ctx, attachment.eventId);

    const size = await this.storage.sizeOf(attachment.storageKey);
    if (size === null) {
      throw new BadRequestException({
        code: 'upload_incomplete',
        message: 'The photograph did not arrive. Please try again.',
      });
    }

    if (attachment.uploadedAt) return this.serialise(attachment.id);

    let width: number | null = null;
    let height: number | null = null;
    let thumbnailKey: string | null = null;

    // A voice note has nothing to measure and nothing to preview.
    if (attachment.kind !== AttachmentKind.image) {
      await this.prisma.attachment.update({
        where: { id: attachment.id },
        data: { uploadedAt: new Date(), sizeBytes: size },
      });
      return this.serialise(attachment.id);
    }

    try {
      const original = await this.storage.readBuffer(attachment.storageKey);
      const meta = await sharp(original, { failOn: 'none' }).metadata();
      width = meta.width ?? null;
      height = meta.height ?? null;

      const thumbnail = await sharp(original, { failOn: 'none' })
        // The phone's own orientation flag, applied rather than carried: a
        // sideways preview is the most obvious bug a photo grid can have.
        .rotate()
        .resize(THUMBNAIL_PX, THUMBNAIL_PX, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 72, mozjpeg: true })
        .toBuffer();

      thumbnailKey = this.storage.thumbnailKeyFor(attachment.storageKey);
      await this.storage.writeBuffer(thumbnailKey, thumbnail);
    } catch (error) {
      thumbnailKey = null;
      this.logger.warn(
        `No thumbnail for ${attachment.id} (${attachment.mimeType}): ${(error as Error).message}`,
      );
    }

    await this.prisma.attachment.update({
      where: { id: attachment.id },
      data: { uploadedAt: new Date(), sizeBytes: size, width, height, thumbnailKey },
    });

    return this.serialise(attachment.id);
  }

  /**
   * Rows whose bytes never arrived.
   *
   * Called on a schedule (media.sweeper.ts). An hour is far longer than any
   * upload this server accepts, so anything older was abandoned.
   */
  async sweepAbandoned(olderThanMinutes = 60): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);

    const abandoned = await this.prisma.attachment.findMany({
      where: { uploadedAt: null, createdAt: { lt: cutoff } },
      select: { id: true, storageKey: true },
    });

    for (const row of abandoned) {
      if (row.storageKey) await this.storage.remove(row.storageKey).catch(() => undefined);
      await this.prisma.attachment.delete({ where: { id: row.id } }).catch(() => undefined);
    }

    return abandoned.length;
  }

  /**
   * Taking a photograph or a voice note out of an event.
   *
   * The same rule as editing the event, because that is what it is. The row
   * goes and so do its files: a family that deletes a recording of somebody's
   * voice means it to be gone, not unlinked.
   */
  async remove(ctx: ViewerContext, attachmentId: string): Promise<void> {
    const attachment = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, event: { familyId: ctx.familyId, deletedAt: null } },
      select: {
        id: true,
        kind: true,
        storageKey: true,
        thumbnailKey: true,
        eventId: true,
        event: { select: { authorMemberId: true } },
      },
    });

    if (!attachment) {
      throw new NotFoundException({ code: 'not_found', message: 'Not found.' });
    }

    // Seeing it comes first, so an id from another audience answers exactly
    // like one that does not exist.
    await this.visibility.assertCanOpenEvent(ctx, attachment.eventId);
    const own = attachment.event.authorMemberId === ctx.memberId;
    this.visibility.assertCan(ctx, own ? 'event.edit_own' : 'event.edit_any');

    await this.prisma.attachment.delete({ where: { id: attachment.id } });

    for (const key of [attachment.storageKey, attachment.thumbnailKey]) {
      if (key) await this.storage.remove(key).catch(() => undefined);
    }

    await this.audit.record({
      familyId: ctx.familyId,
      action: 'attachment.deleted',
      entityType: 'Attachment',
      entityId: attachment.id,
      metadata: { kind: attachment.kind, eventId: attachment.eventId },
    });
  }

  // ---------------------------------------------------------------------------

  private async assertWithinPlanLimit(
    familyId: string,
    eventId: string,
    kind: AttachmentKind,
  ): Promise<void> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { familyId },
      select: PLAN_SELECT,
    });

    const premium = isPremium(subscription);
    const voice = kind === AttachmentKind.audio;
    const limit = voice
      ? premium
        ? PREMIUM_MAX_VOICE_NOTES
        : FREE_MAX_VOICE_NOTES
      : premium
        ? PREMIUM_MAX_ATTACHMENTS
        : FREE_MAX_ATTACHMENTS;

    // Rows still waiting for their bytes count: two tabs asking at once must
    // not both be told yes. Each kind against its own limit.
    const used = await this.prisma.attachment.count({
      where: { eventId, kind: voice ? AttachmentKind.audio : { not: AttachmentKind.audio } },
    });

    if (used >= limit) {
      throw new ForbiddenException({
        code: 'plan_limit_reached',
        message: voice
          ? 'This event already has as many voice notes as the plan allows.'
          : 'This event already has as many photographs as the plan allows.',
        limit,
      });
    }
  }

  private serialise(attachmentId: string) {
    return this.prisma.attachment.findUniqueOrThrow({
      where: { id: attachmentId },
      select: {
        id: true,
        eventId: true,
        kind: true,
        mimeType: true,
        sizeBytes: true,
        width: true,
        height: true,
        durationSec: true,
        thumbnailKey: true,
        createdAt: true,
        uploadedAt: true,
      },
    });
  }
}
