import { Module } from '@nestjs/common';

import { MediaModule } from '../media/media.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { VisibilityModule } from '../visibility/visibility.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  // MediaModule for the signing: an event leaves this module with its
  // photographs already carrying links (events.controller.ts).
  imports: [VisibilityModule, NotificationsModule, MediaModule],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
