import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import { NotificationsService } from './notifications.service';

/** A reminder set for 16:00 should not arrive at 16:04. */
const EVERY_MINUTE_MS = 60 * 1000;

/**
 * What makes a stored reminder arrive.
 *
 * Until this existed a reminder was a row with a `scheduledFor` that nothing
 * ever read: the composer offered "1 hour before", saved it, and the hour came
 * and went. Now it becomes a notification in the bell. Push is the next layer
 * on the same queue once there are FCM/APNs credentials to send with.
 *
 * A timer in this process rather than BullMQ and Redis, for the same reason as
 * the account purge: one API process on one machine, and a reminder that only
 * fires if a second service happens to be running is a reminder that will not
 * fire. The query behind it is indexed on (scheduledFor, deliveredAt), which
 * is what the schema added the column for.
 */
@Injectable()
export class RemindersWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RemindersWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly notifications: NotificationsService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.run(), EVERY_MINUTE_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async run(): Promise<void> {
    // A slow database must not stack runs on top of each other; the claim in
    // deliverDueReminders makes overlap safe, and this makes it rare.
    if (this.running) return;
    this.running = true;

    try {
      const delivered = await this.notifications.deliverDueReminders();
      if (delivered > 0) this.logger.log(`Delivered ${delivered} reminder notification(s).`);
      // Capsules whose day has come and surprises whose morning it is: the same
      // minute, the same kind of claim, so each is said once.
      const unlocked = await this.notifications.deliverUnlocks();
      if (unlocked > 0) this.logger.log(`Told ${unlocked} person(s) about an opened capsule or a surprise.`);
      // Mother's Day, Midsummer, Christmas Eve: three days ahead, once a day.
      const announced = await this.notifications.deliverSpecialDays();
      if (announced > 0) this.logger.log(`Told ${announced} person(s) about a special day.`);
    } catch (error) {
      this.logger.error('Reminder delivery failed', error as Error);
    } finally {
      this.running = false;
    }
  }
}
