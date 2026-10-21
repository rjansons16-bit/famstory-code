import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import { TelemetryService } from './telemetry.service';

/** Limits counted in days need no more than a daily look. */
const EVERY_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * What makes "kept 400 days" and "kept 90 days" true (telemetry.service.ts).
 *
 * The same shape as AccountPurge, for the same reasons: one API process and no
 * scheduler to forget, a run at boot for a machine that is off more than on,
 * and `unref` so the timer never keeps the process alive by itself.
 */
@Injectable()
export class TelemetrySweeper implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelemetrySweeper.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly telemetry: TelemetryService) {}

  onModuleInit(): void {
    void this.run();

    this.timer = setInterval(() => void this.run(), EVERY_DAY_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async run(): Promise<void> {
    try {
      await this.telemetry.sweep();
    } catch (error) {
      this.logger.error('Telemetry sweep failed', error as Error);
    }
  }
}
