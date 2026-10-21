import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import { CurrentUser, type AuthenticatedUser } from '../identity/jwt-auth.guard';
import { MediaService } from '../media/media.service';
import { VisibilityService } from '../visibility/visibility.service';
import type {
  CreateEventDto,
  ListEventsQuery,
  UpdateEventDto,
  VisibilityDto,
} from './events.dto';
import { EventsService } from './events.service';

/**
 * Event endpoints. See docs/05-API.md.
 *
 * THE PATTERN EVERY CONTROLLER FOLLOWS:
 *   1. Get the ViewerContext (userId + familyId -> member, role, groups)
 *   2. Pass it to the service
 *   3. The service calls VisibilityService
 *
 * `contextFor()` throws 403 when the user is not an active member of this
 * family — so the family-membership check does not have to be repeated in every
 * method.
 */
@Controller('v1/families/:familyId/events')
export class EventsController {
  constructor(
    private readonly events: EventsService,
    private readonly visibility: VisibilityService,
    private readonly media: MediaService,
  ) {}

  /**
   * Every event leaves here with its photographs already signed.
   *
   * The links are built against the address the caller just used, so the same
   * server answers correctly on the LAN, through a tunnel and on a domain
   * without being told which one it is behind.
   */
  private withPhotos<T extends object>(event: T, req: Request): T {
    return this.media.withSignedUrls(event, originOf(req));
  }

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
    @Query() query: ListEventsQuery,
    @Req() req: Request,
  ) {
    const ctx = await this.visibility.contextFor(user.id, familyId);
    const page = await this.events.list(ctx, query);

    return { ...page, items: page.items.map((event) => this.withPhotos(event, req)) };
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
    @Body() dto: CreateEventDto,
    @Req() req: Request,
  ) {
    const ctx = await this.visibility.contextFor(user.id, familyId);
    return this.withPhotos(await this.events.create(ctx, dto), req);
  }

  @Get(':id')
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const ctx = await this.visibility.contextFor(user.id, familyId);
    return this.withPhotos(await this.events.findOne(ctx, id), req);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateEventDto,
    @Req() req: Request,
  ) {
    const ctx = await this.visibility.contextFor(user.id, familyId);
    return this.withPhotos(await this.events.update(ctx, id, dto), req);
  }

  /** Soft delete. The undo below is what makes it soft rather than tidy. */
  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
    @Param('id') id: string,
  ) {
    const ctx = await this.visibility.contextFor(user.id, familyId);
    await this.events.remove(ctx, id);
  }

  @Post(':id/restore')
  async restore(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const ctx = await this.visibility.contextFor(user.id, familyId);
    return this.withPhotos(await this.events.restore(ctx, id), req);
  }

  @Patch(':id/visibility')
  async changeVisibility(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId') familyId: string,
    @Param('id') id: string,
    @Body() dto: VisibilityDto,
  ) {
    const ctx = await this.visibility.contextFor(user.id, familyId);
    return this.events.changeVisibility(ctx, id, dto);
  }
}

/** Where this server is reachable, as the client just reached it. */
function originOf(req: Request): string {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const protocol = typeof forwardedProto === 'string' ? forwardedProto.split(',')[0] : req.protocol;

  return `${protocol}://${req.headers.host ?? 'localhost'}`;
}
