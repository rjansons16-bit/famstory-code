import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../common/prisma.service';
import { READ_TTL_SECONDS, StorageService } from '../../common/storage/storage.service';
import { VisibilityService, type ViewerContext } from '../visibility/visibility.service';

/**
 * MEDIA ACCESS.
 *
 * `Attachment` stores a `storageKey`, never a public URL. The reason is in
 * docs/02-DATA-MODEL.md: if a photo were reachable through a permanent link,
 * an event's visibility control would mean nothing — one forwarded link would
 * be enough to defeat it.
 *
 * So every read goes through here, and every read starts with the same
 * visibility check the timeline uses. The photo belongs to the event, and the
 * event decides who sees it.
 *
 * THE SIGNING now happens in common/storage — a link that names one key,
 * expires in five minutes and cannot be edited into another one. The bytes sit
 * on this server's disk today and in a bucket later; this file does not know
 * which, and does not need to.
 */
interface AttachmentRow {
  storageKey: string;
  thumbnailKey?: string | null;
}

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visibility: VisibilityService,
    private readonly storage: StorageService,
  ) {}

  async urlFor(
    ctx: ViewerContext,
    attachmentId: string,
    variant: 'original' | 'thumb',
    baseUrl: string,
  ): Promise<{ url: string; expiresIn: number }> {
    const attachment = await this.prisma.attachment.findFirst({
      // Pinned to the family before anything else: an id from another family
      // must not even reach the visibility check. An attachment whose bytes
      // never arrived is not found at all - see `uploadedAt` in the schema.
      where: { id: attachmentId, event: { familyId: ctx.familyId }, uploadedAt: { not: null } },
      select: { storageKey: true, thumbnailKey: true, eventId: true },
    });

    if (!attachment) {
      throw new NotFoundException({ code: 'not_found', message: 'Attachment not found.' });
    }

    // The event decides. This throws 403 with a body that does not reveal
    // whether the event exists.
    await this.visibility.assertCanOpenEvent(ctx, attachment.eventId);

    // A thumbnail this server could not generate - an iPhone HEIC on a build
    // without libheif - falls back to the original rather than to nothing.
    const key =
      variant === 'thumb' ? (attachment.thumbnailKey ?? attachment.storageKey) : attachment.storageKey;

    return this.storage.signedUrl(key, baseUrl);
  }

  /** Exported for the tests. */
  static readonly TTL_SECONDS = READ_TTL_SECONDS;

  /**
   * The same URLs, attached to an event that has already been served.
   *
   * The alternative was a round trip per photograph: the app holding a list of
   * attachment ids and asking for a link for each one, twenty events into
   * sixty requests. The event it belongs to has just passed the visibility
   * check to be in this response at all, so signing here costs an HMAC and
   * saves the requests.
   */
  withSignedUrls<T extends object>(event: T, baseUrl: string): T {
    // Not every endpoint that returns an event includes its attachments -
    // creating one cannot have any yet, and restoring returns the row alone.
    const attachments = (event as { attachments?: AttachmentRow[] }).attachments;
    if (!attachments?.length) return event;

    return {
      ...event,
      attachments: attachments.map((attachment) => ({
        ...attachment,
        url: this.storage.signedUrl(attachment.storageKey, baseUrl).url,
        thumbnailUrl: this.storage.signedUrl(
          attachment.thumbnailKey ?? attachment.storageKey,
          baseUrl,
        ).url,
      })),
    };
  }

}
