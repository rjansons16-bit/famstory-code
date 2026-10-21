import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';
import { VisibilityModule } from '../visibility/visibility.module';
import { FamiliesController } from './families.controller';
import { FamiliesService } from './families.service';

@Module({
  imports: [VisibilityModule, NotificationsModule],
  controllers: [FamiliesController],
  providers: [FamiliesService],
  exports: [FamiliesService],
})
export class FamiliesModule {}
