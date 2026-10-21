import { Module } from '@nestjs/common';

import { VisibilityModule } from '../visibility/visibility.module';
import { GuestLinksController, GuestViewController } from './guest-links.controller';
import { GuestLinksService } from './guest-links.service';

/** One event shared outside the family. Reads events, so VisibilityModule. */
@Module({
  imports: [VisibilityModule],
  controllers: [GuestLinksController, GuestViewController],
  providers: [GuestLinksService],
})
export class GuestLinksModule {}
