import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';

import { CoreModule } from './common/core.module';
import { HealthController } from './common/health.controller';
import { RateLimitGuard } from './common/rate-limit.guard';
import { AccountModule } from './modules/account/account.module';
import { AiModule } from './modules/ai/ai.module';
import { AvatarsModule } from './modules/avatars/avatars.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import { GuestLinksModule } from './modules/guest/guest-links.module';
import { HousekeepingModule } from './modules/housekeeping/housekeeping.module';
import { WishesModule } from './modules/wishes/wishes.module';
import { CommentsModule } from './modules/comments/comments.module';
import { EventsModule } from './modules/events/events.module';
import { FamiliesModule } from './modules/families/families.module';
import { IdentityModule } from './modules/identity/identity.module';
import { JwtAuthGuard } from './modules/identity/jwt-auth.guard';
import { MediaModule } from './modules/media/media.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PushModule } from './modules/push/push.module';
import { BlocksModule } from './modules/blocks/blocks.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { TelemetryModule } from './modules/telemetry/telemetry.module';
import { VisibilityModule } from './modules/visibility/visibility.module';

/**
 * MODULAR MONOLITH.
 *
 * From the feasibility study: "at the MVP stage this architecture does not need
 * to be built as a full microservice system. The practical approach is to start
 * with a modular monolith: one backend application with clearly separated
 * domain modules."
 *
 * Still to build (docs/00-PLAN.md, stage C):
 *   media         — the read path exists (visibility-checked); upload and
 *                   presigning still need an S3-compatible bucket
 *   notifications — a BullMQ reminder queue, if one process is ever not
 *                   enough (push to APNs and FCM is in: modules/push)
 *   subscription  — the stores through RevenueCat are in (modules/subscriptions);
 *                   Stripe for the web is not
 *   export        — PDF/ZIP family chronicle
 *
 * The boundary worth defending: no module reads events without importing
 * VisibilityModule. That is what keeps the modular monolith from dissolving.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CoreModule,
    VisibilityModule,
    IdentityModule,
    AccountModule,
    FamiliesModule,
    EventsModule,
    CommentsModule,
    MediaModule,
    NotificationsModule,
    PushModule,
    ReportsModule,
    BlocksModule,
    SubscriptionsModule,
    CalendarModule,
    WishesModule,
    GuestLinksModule,
    AvatarsModule,
    AiModule,
    TelemetryModule,
    HousekeepingModule,
  ],
  controllers: [HealthController],
  providers: [
    // Counting comes first, before anything that costs work. The endpoints
    // worth guessing at are the ones nobody has signed in to yet, so a limit
    // that ran after authentication would run after the expensive part.
    { provide: APP_GUARD, useClass: RateLimitGuard },
    // Authentication is the DEFAULT, not the exception. Public endpoints are
    // marked explicitly with @Public(). The other way round is dangerous: a
    // forgotten guard would open data silently, and nobody would notice until
    // it was too late.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
