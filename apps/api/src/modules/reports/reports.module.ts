import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';
import { VisibilityModule } from '../visibility/visibility.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [VisibilityModule, NotificationsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
