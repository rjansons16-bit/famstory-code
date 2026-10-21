import { Module } from '@nestjs/common';

import { HousekeepingService, HousekeepingSweeper } from './housekeeping.service';

/** Deletes the rows that stopped doing anything. No routes; nothing reads events. */
@Module({
  providers: [HousekeepingService, HousekeepingSweeper],
})
export class HousekeepingModule {}
