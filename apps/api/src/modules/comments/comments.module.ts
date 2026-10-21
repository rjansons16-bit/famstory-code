import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';
import { VisibilityModule } from '../visibility/visibility.module';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';

@Module({
  imports: [VisibilityModule, NotificationsModule],
  controllers: [CommentsController],
  providers: [CommentsService],
  exports: [CommentsService],
})
export class CommentsModule {}
