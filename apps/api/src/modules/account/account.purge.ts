import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import { AccountService } from './account.service';

/** Once a day is often enough for a deadline measured in 30 days. */
const EVERY_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * What makes the 30 days actually end.
 *
 * A grace period with nothing to close it is not a grace period - it is data
 * kept forever with a flag on it, which is the opposite of what a person
 * pressing "Delete account" asked for.
 *
 * Deliberately a timer in this process rather than a queue or a cron entry:
 * the deployment is one API process (tools/lan-host), and a deletion that only
 * happens if somebody remembered to install a scheduled task is a deletion
 * that will not happen. It runs once at boot - which covers a machine that is
 * off more than it is on - and then once a day.
 *
 * `unref` so an idle timer never keeps the process alive on its own.
 */
@Injectable()
export class AccountPurge implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AccountPurge.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly account: AccountService) {}

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
      await this.account.purgeExpired();
    } catch (error) {
      // A failed sweep must not take the API down with it; the next one will
      // find the same rows, because the work is derived from state.
      this.logger.error('Account purge failed', error as Error);
    }
  }
}
