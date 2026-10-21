import { Module } from '@nestjs/common';

import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';
import { TelemetrySweeper } from './telemetry.sweeper';

/**
 * No VisibilityModule: nothing here reads events. What arrives is the app's
 * counters and its errors, and neither may carry family content
 * (known-events.ts, scrub.ts).
 */
@Module({
  controllers: [TelemetryController],
  providers: [TelemetryService, TelemetrySweeper],
})
export class TelemetryModule {}
