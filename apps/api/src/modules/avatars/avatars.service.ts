import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { MemberRole, MemberStatus } from '@prisma/client';
import type { Readable } from 'node:stream';
import sharp from 'sharp';

import { AuditService } from '../../common/audit.service';
import { PrismaService } from '../../common/prisma.service';
import { ALLOWED_MIME_TYPES, StorageService } from '../../common/storage/storage.service';
import type { ViewerContext } from '../visibility/visibility.service';

/** A phone photograph is a few MB; this is a face, and the limit says so. */
export const MAX_AVATAR_BYTES = 10 * 1024 * 1024;
/** Square, and large enough for the biggest circle the app draws (96pt) at 3x and then some. */
const AVATAR_PX = 512;

/**
 * A MEMBER'S PHOTOGRAPH.
 *
 * Until now "About you" asked for one and kept it on the phone that took it -
 * a file:// address nobody else could open. Now it is uploaded, cut to a
 * square around what matters in it (sharp's "attention" crop finds the face
 * more often than the centre does), turned the right way up and stored as a
 * key like any attachment: the snapshot signs a short-lived link into
 * `avatarUrl`, because a child's face must not sit behind a permanent address.
 *
 * Whose photograph can be changed: your own; a child's, by the adult who
 * manages the child profile; anybody's, by an admin. The bytes come straight
 * in the request body - a face is small enough not to need the presigned
 * two-step event photographs use, and the server has to re-encode it anyway.
 */
@Injectable()
export class AvatarsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  async set(
    ctx: ViewerContext,
    memberId: string,
    contentType: string | undefined,
    body: Readable,
  ): Promise<{ avatarKey: string }> {
    const member = await this.requireEditable(ctx, memberId);

    const type = (contentType ?? '').split(';')[0].trim().toLowerCase();
    if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(type)) {
      throw new BadRequestException({
        code: 'unsupported_media_type',
        message: 'A photograph: JPEG, PNG, WebP or HEIC.',
      });
    }

    const original = await readAll(body, MAX_AVATAR_BYTES);

    let square: Buffer;
    try {
      square = await sharp(original, { failOn: 'none' })
        .rotate()
        .resize(AVATAR_PX, AVATAR_PX, { fit: 'cover', position: 'attention' })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      throw new BadRequestException({
        code: 'unreadable_image',
        message: 'That file could not be read as a photograph.',
      });
    }

    const key = this.storage.avatarKeyFor(ctx.familyId, memberId);
    await this.storage.writeBuffer(key, square);
    await this.prisma.member.update({
      where: { id: memberId },
      // The old free-text URL (a file:// from the first build) goes with it.
      data: { avatarKey: key, avatarUrl: null },
    });
    if (member.avatarKey) await this.storage.remove(member.avatarKey).catch(() => undefined);

    if (member.role === MemberRole.child) {
      await this.audit.record({
        familyId: ctx.familyId,
        action: 'child_profile.updated',
        entityType: 'Member',
        entityId: memberId,
        metadata: { field: 'avatar' },
      });
    }

    return { avatarKey: key };
  }

  async clear(ctx: ViewerContext, memberId: string): Promise<void> {
    const member = await this.requireEditable(ctx, memberId);
    await this.prisma.member.update({
      where: { id: memberId },
      data: { avatarKey: null, avatarUrl: null },
    });
    if (member.avatarKey) await this.storage.remove(member.avatarKey).catch(() => undefined);
  }

  private async requireEditable(ctx: ViewerContext, memberId: string) {
    const member = await this.prisma.member.findFirst({
      where: { id: memberId, familyId: ctx.familyId, status: { not: MemberStatus.removed } },
      select: { id: true, role: true, managedByMemberId: true, avatarKey: true },
    });
    if (!member) throw new NotFoundException({ code: 'member_not_found', message: 'Member not found.' });

    const mayEdit =
      memberId === ctx.memberId ||
      ctx.role === MemberRole.admin ||
      (member.role === MemberRole.child && member.managedByMemberId === ctx.memberId);
    if (!mayEdit) {
      throw new ForbiddenException({
        code: 'insufficient_role',
        message: "Only they, an admin, or a child's own parent can change this photograph.",
      });
    }
    return member;
  }
}

/** The whole body, refusing it as soon as it passes `limit` rather than after. */
async function readAll(body: Readable, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of body) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    size += buffer.length;
    if (size > limit) {
      throw new PayloadTooLargeException({
        code: 'file_too_large',
        message: 'That photograph is too large.',
      });
    }
    chunks.push(buffer);
  }
  if (size === 0) {
    throw new BadRequestException({ code: 'empty_upload', message: 'No photograph arrived.' });
  }
  return Buffer.concat(chunks);
}
