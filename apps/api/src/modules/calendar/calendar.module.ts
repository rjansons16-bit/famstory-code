import { Module } from '@nestjs/common';

import { VisibilityModule } from '../visibility/visibility.module';
import { CalendarFeedController, CalendarFileController } from './calendar.controller';
import { CalendarService } from './calendar.service';

/** The read-only calendar feed. Reads events, so it goes through VisibilityModule. */
@Module({
  imports: [VisibilityModule],
  controllers: [CalendarFeedController, CalendarFileController],
  providers: [CalendarService],
})
export class CalendarModule {}
