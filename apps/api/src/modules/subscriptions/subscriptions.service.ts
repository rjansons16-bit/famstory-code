import { timingSafeEqual } from 'node:crypto';

import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Prisma, type Subscription } from '@prisma/client';

import { PrismaService } from '../../common/prisma.service';
import { effectivePlan } from './premium';
import { RevenueCatClient, familyIdsInWebhook, stateFromSubscriber } from './revenuecat';

/** What the app is told about the family's plan (docs/05-API.md, Subscription). */
export interface FamilyPlan {
  plan: 'free' | 'premium';
  status: Subscription['status'] | null;
  period: Subscription['period'];
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  store: Subscription['store'];
}

export function familyPlan(row: Subscription | null, now: Date = new Date()): FamilyPlan {
  return {
    plan: effectivePlan(row, now),
    status: row?.status ?? null,
    period: row?.period ?? null,
    currentPeriodEnd: row?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: row?.cancelAtPeriodEnd ?? false,
    store: row?.store ?? null,
  };
}

function sameSecret(given: string | undefined, expected: string): boolean {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * THE FAMILY'S PLAN, AS THE STORES SEE IT (docs/02-DATA-MODEL.md, Subscriptions).
 *
 * Two ways in, one way through: the app asks right after a purchase or a
 * restore, so the family does not wait for a webhook to see Premium; RevenueCat's
 * webhook covers everything the app never sees - a renewal at night, a
 * cancellation in the phone's settings, a refund. Both end in `sync`, which
 * reads the truth from RevenueCat and writes it.
 */
@Injectable()
export class SubscriptionsService {
  private readonly log = new Logger(SubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly revenueCat: RevenueCatClient,
  ) {}

  async sync(familyId: string, now: Date = new Date()): Promise<FamilyPlan> {
    const subscriber = await this.revenueCat.subscriber(familyId);
    const state = stateFromSubscriber(subscriber, now);
    const existing = await this.prisma.subscription.findUnique({ where: { familyId } });

    if (!state) {
      // RevenueCat has nothing for this family. A plan an operator set by hand
      // (no store) is theirs and stays. One RevenueCat set before has moved to
      // another family or was never real, and ends here.
      if (!existing?.store) return familyPlan(existing, now);
      const ended = await this.prisma.subscription.update({
        where: { familyId },
        data: { plan: 'free', status: 'expired', cancelAtPeriodEnd: false, syncedAt: now },
      });
      return familyPlan(ended, now);
    }

    // A purchase replaces a plan set by hand: from now on the store is what
    // keeps it going, and what ends it.
    const data = { ...state, syncedAt: now };
    let row: Subscription;
    try {
      row = await this.prisma.subscription.upsert({
        where: { familyId },
        create: { familyId, ...data },
        update: data,
      });
    } catch (error) {
      // The app's sync and the webhook can both create the row at once.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      row = await this.prisma.subscription.update({ where: { familyId }, data });
    }
    return familyPlan(row, now);
  }

  /**
   * RevenueCat's webhook. Its body only says which families to read again; it
   * is authenticated by the shared value in `Authorization`, and even a body
   * that got past that could not grant anything - `sync` asks RevenueCat.
   */
  async webhook(authorization: string | undefined, body: unknown): Promise<{ synced: number }> {
    if (!sameSecret(authorization?.trim(), this.revenueCat.webhookAuthorization)) {
      throw new UnauthorizedException({ code: 'webhook_unauthorized', message: 'Not RevenueCat.' });
    }

    const ids = familyIdsInWebhook(body);
    if (ids.length === 0) return { synced: 0 };

    const families = await this.prisma.family.findMany({ where: { id: { in: ids } }, select: { id: true } });
    for (const family of families) {
      await this.sync(family.id);
    }
    if (families.length > 0) this.log.log(`RevenueCat: ${families.length} family plan(s) read again`);
    return { synced: families.length };
  }
}
