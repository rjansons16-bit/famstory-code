import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { IsInt, IsMimeType, IsOptional, IsString, Max, Min } from 'class-validator';
import type { Request, Response } from 'express';

import { parseRange } from '../../common/storage/range';
import {
  MAX_UPLOAD_BYTES,
  READ_TTL_SECONDS,
  StorageService,
  contentTypeForKey,
} from '../../common/storage/storage.service';
import { CurrentUser, Public, type AuthenticatedUser } from '../identity/jwt-auth.guard';
import { VisibilityService } from '../visibility/visibility.service';
import { UploadsService } from './uploads.service';

export class RequestUploadDto {
  @IsMimeType()
  mimeType!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_UPLOAD_BYTES)
  sizeBytes!: number;

  @IsOptional()
  @IsString()
  fileName?: string;

  /** A voice note's length in seconds, as the recorder measured it. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(15 * 60)
  durationSec?: number;
}

/**
 * Asking for somewhere to put a photograph, and saying it arrived.
 *
 * Under `/families/:familyId` like every other resource: there is no endpoint
 * in this API that returns or accepts data without a family context.
 */
@Controller('v1/families/:familyId')
export class UploadsController {
  constructor(
    private readonly uploads: UploadsService,
    private readonly visibility: VisibilityService,
  ) {}

  @Post('events/:eventId/uploads')
  async request(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
    @Param('eventId') eventId: string,
    @Body() dto: RequestUploadDto,
    @Req() req: Request,
  ) {
    const ctx = await this.visibility.contextFor(user.id, familyId);
    return this.uploads.requestUpload(ctx, eventId, dto, originOf(req));
  }

  @Post('uploads/:attachmentId/complete')
  @HttpCode(200)
  async complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    const ctx = await this.visibility.contextFor(user.id, familyId);
    return this.uploads.complete(ctx, attachmentId);
  }

  /** A photograph or a voice note taken out of its event - the file with it. */
  @Delete('attachments/:attachmentId')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
    @Param('attachmentId') attachmentId: string,
  ): Promise<void> {
    const ctx = await this.visibility.contextFor(user.id, familyId);
    await this.uploads.remove(ctx, attachmentId);
  }
}

/**
 * The two endpoints that carry bytes.
 *
 * Both are `@Public()` and both are authorised by a signature instead, which
 * is not a shortcut - it is the shape of the thing they will become. When a
 * bucket exists, the upload URL is a presigned S3 PUT and the read URL is a
 * presigned GET, neither of which carries a session token either. Writing them
 * this way means the client code does not change on that day.
 *
 * What protects them meanwhile: the signature covers one id (or one key) plus
 * an expiry, is compared in constant time, and is minted only after the
 * visibility check has already passed on an authenticated request.
 */
@Controller('v1')
export class MediaBytesController {
  constructor(
    private readonly uploads: UploadsService,
    private readonly storage: StorageService,
  ) {}

  @Public()
  @Put('uploads/:attachmentId/bytes')
  @HttpCode(204)
  async receive(
    @Param('attachmentId') attachmentId: string,
    @Query('expires') expires: string,
    @Query('signature') signature: string,
    @Req() req: Request,
  ): Promise<void> {
    // The raw request stream: no body parser touches these content types, so
    // a 20 MB photograph is never held in memory as a parsed body.
    await this.uploads.receive(attachmentId, { expires, signature }, req);
  }

  /**
   * Serving a stored file to a link that was signed for it.
   *
   * `*key` rather than a parameter, because a storage key has slashes in it.
   * The key is checked against the shape this server issues before it is ever
   * turned into a path (storage.service.ts).
   */
  @Public()
  @Get('media/*key')
  async serve(
    @Param('key') key: string | string[],
    @Query('expires') expires: string,
    @Query('signature') signature: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const storageKey = Array.isArray(key) ? key.join('/') : key;

    if (!this.storage.verify(storageKey, expires, signature)) {
      // 404 rather than 403: a wrong signature and a file that does not exist
      // should be indistinguishable from outside.
      throw new NotFoundException({ code: 'not_found', message: 'Not found.' });
    }

    const size = await this.storage.sizeOf(storageKey);
    if (size === null) throw new NotFoundException({ code: 'not_found', message: 'Not found.' });

    res.setHeader('Content-Type', contentTypeForKey(storageKey));
    // Cacheable for exactly as long as the link is valid, and never by a proxy:
    // this is one family's photograph, not a public asset.
    res.setHeader('Cache-Control', `private, max-age=${READ_TTL_SECONDS}`);
    // A voice note is played in pieces: the player asks for the start, then
    // for wherever the listener drags to, and Safari plays nothing from a
    // server that cannot answer that (common/storage/range.ts).
    res.setHeader('Accept-Ranges', 'bytes');

    const range = parseRange(req.headers.range, size);
    if (range === 'unsatisfiable') {
      res.status(416).setHeader('Content-Range', `bytes */${size}`);
      res.end();
      return;
    }
    if (range) {
      res.status(206);
      res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
      res.setHeader('Content-Length', String(range.end - range.start + 1));
    } else {
      res.setHeader('Content-Length', String(size));
    }

    const stream = this.storage.read(storageKey, range ?? undefined);
    stream.on('error', () => {
      if (!res.headersSent) res.status(404).json({ error: { code: 'not_found', message: 'Not found.' } });
      else res.destroy();
    });

    stream.pipe(res);
  }
}

/** Where this server is reachable, as the client just reached it. */
function originOf(req: Request): string {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const protocol = typeof forwardedProto === 'string' ? forwardedProto.split(',')[0] : req.protocol;

  return `${protocol}://${req.headers.host ?? 'localhost'}`;
}

