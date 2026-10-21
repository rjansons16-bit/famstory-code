import { Module } from '@nestjs/common';

import { PushModule } from '../push/push.module';
import { VisibilityModule } from '../visibility/visibility.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { RemindersWorker } from './reminders.worker';

@Module({
  imports: [VisibilityModule, PushModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, RemindersWorker],
  exports: [NotificationsService],
})
export class NotificationsModule {}
