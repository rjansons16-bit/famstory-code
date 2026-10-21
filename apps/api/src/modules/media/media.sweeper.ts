import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import { UploadsService } from './uploads.service';

/** Hourly: an upload that has not finished in an hour is not going to. */
const EVERY_HOUR_MS = 60 * 60 * 1000;

/**
 * Throwing away uploads that never arrived.
 *
 * A picker that was cancelled, a connection that died halfway, a file over the
 * limit: each leaves an attachment row with no bytes behind it. Every read
 * already filters those out, so nobody sees them - which is exactly why they
 * would accumulate forever without something like this.
 *
 * A timer in this process rather than a queue, for the same reason as
 * account.purge.ts: this deployment is one API process, and work that only
 * happens if somebody installed a scheduled task is work that will not happen.
 */
@Injectable()
export class MediaSweeper implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MediaSweeper.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly uploads: UploadsService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.run(), EVERY_HOUR_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async run(): Promise<void> {
    try {
      const removed = await this.uploads.sweepAbandoned();
      if (removed > 0) this.logger.log(`Removed ${removed} abandoned upload(s).`);
    } catch (error) {
      this.logger.error('Upload sweep failed', error as Error);
    }
  }
}
