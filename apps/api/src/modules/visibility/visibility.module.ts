import { Module } from '@nestjs/common';

import { VisibilityService } from './visibility.service';

/**
 * The visibility module exports itself to everyone who reads events.
 * No domain module may read events without importing this one.
 */
@Module({
  providers: [VisibilityService],
  exports: [VisibilityService],
})
export class VisibilityModule {}
