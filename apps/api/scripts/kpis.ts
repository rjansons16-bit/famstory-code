/**
 * THE BETA KPIs, read off the database.
 *
 *     npm --prefix apps/api run kpis            # the last 30 days
 *     npm --prefix apps/api run kpis -- --days 7
 *     npm --prefix apps/api run kpis -- --json
 *
 * The table in docs/00-PLAN.md section 6, each row with the rule it was
 * counted by printed beside it - a number whose definition has to be guessed
 * at the month-12 decision is not evidence of anything.
 *
 * Most rows come from the family's own tables (events, members, visits,
 * subscriptions), which exist whether or not anybody allowed counting. The
 * rows that need a history of visits - retention - come from `app_opened` in
 * AnalyticsEvent, so they cover only families who share usage counts, and
 * only from the day that table began. The report says so rather than
 * presenting a partial number as the whole.
 *
 * Read-only. It prints; it never writes.
 */
import { PrismaClient, VisibilityKind } from '@prisma/client';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Where test/smoke.ts makes its accounts. */
const TEST_DOMAIN = '@example.test';

interface Row {
  kpi: string;
  target: string;
  value: string;
  rule: string;
}

function pct(part: number, whole: number): string {
  if (whole === 0) return 'n/a';
  return `${Math.round((part / whole) * 1000) / 10}% (${part}/${whole})`;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const days = Math.max(1, Number(argValue('--days') ?? 30) || 30);
  const now = new Date();
  const since = new Date(now.getTime() - days * DAY_MS);

  try {
    // The smoke test makes a family on every run (test/smoke.ts), all of its
    // people on @example.test. A family with nobody else in it is not a beta
    // family, and counting it would flatter every row below.
    const allFamilies = await prisma.family.count({ where: { deletedAt: null } });
    const families = await prisma.family.findMany({
      where: {
        deletedAt: null,
        members: { some: { user: { email: { not: { endsWith: TEST_DOMAIN } } } } },
      },
      select: { id: true, createdAt: true },
    });
    const familyIds = new Set(families.map((f) => f.id));
    const rows: Row[] = [];

    rows.push({
      kpi: 'Beta families',
      target: '50–200',
      value: String(families.length),
      rule: `families not deleted, not the smoke test's (${allFamilies - families.length} left out)`,
    });

    // --- Events ---
    const eventCounts = await prisma.event.groupBy({
      by: ['familyId'],
      where: { deletedAt: null },
      _count: { _all: true },
    });
    const threeOrMore = eventCounts.filter((c) => familyIds.has(c.familyId) && c._count._all >= 3).length;
    rows.push({
      kpi: 'Families with ≥3 events',
      target: '>50%',
      value: pct(threeOrMore, families.length),
      rule: 'events ever added, not deleted',
    });

    const recentEvents = await prisma.event.groupBy({
      by: ['familyId'],
      where: { deletedAt: null, createdAt: { gte: since } },
      _count: { _all: true },
    });
    const perFamily = families.map(
      (f) => recentEvents.find((c) => c.familyId === f.id)?._count._all ?? 0,
    );
    const scale = 30 / days;
    rows.push({
      kpi: 'Events per family per month',
      target: '5–10',
      value:
        families.length === 0
          ? 'n/a'
          : `median ${Math.round(median(perFamily) * scale * 10) / 10}, mean ${
              Math.round((perFamily.reduce((a, b) => a + b, 0) / families.length) * scale * 10) / 10
            }`,
      rule: `added in the last ${days} days, scaled to 30`,
    });

    // --- Retention, from app_opened ---
    const opens = await prisma.analyticsEvent.findMany({
      where: { name: 'app_opened', familyId: { not: null } },
      select: { familyId: true, createdAt: true },
    });
    const firstOpen = opens.reduce<Date | null>(
      (min, o) => (min === null || o.createdAt < min ? o.createdAt : min),
      null,
    );
    const opensBy = new Map<string, number[]>();
    for (const o of opens) {
      const list = opensBy.get(o.familyId!) ?? [];
      list.push(o.createdAt.getTime());
      opensBy.set(o.familyId!, list);
    }

    // A family counts once the window after its start has fully passed, and
    // only if it began after counting did - otherwise "no visit" may just be
    // "no record".
    const retention = (fromDay: number, toDay: number) => {
      const cohort = families.filter(
        (f) =>
          firstOpen !== null &&
          f.createdAt >= firstOpen &&
          f.createdAt.getTime() + toDay * DAY_MS <= now.getTime(),
      );
      const kept = cohort.filter((f) =>
        (opensBy.get(f.id) ?? []).some(
          (t) => t >= f.createdAt.getTime() + fromDay * DAY_MS && t < f.createdAt.getTime() + toDay * DAY_MS,
        ),
      ).length;
      return cohort.length === 0 ? 'n/a (no family old enough since counting began)' : pct(kept, cohort.length);
    };

    rows.push({
      kpi: '7-day retention',
      target: '>45%',
      value: retention(7, 14),
      rule: 'families opening the app in days 7–13 after they began',
    });
    rows.push({
      kpi: '30-day retention',
      target: '>35–40%',
      value: retention(30, 37),
      rule: 'families opening the app in days 30–36 after they began',
    });

    // --- More than one active member ---
    const visits = await prisma.memberVisit.findMany({
      where: { lastSeenAt: { gte: since } },
      select: { member: { select: { familyId: true } } },
    });
    const activeByFamily = new Map<string, number>();
    for (const v of visits) {
      activeByFamily.set(v.member.familyId, (activeByFamily.get(v.member.familyId) ?? 0) + 1);
    }
    const activeFamilies = [...activeByFamily.keys()].filter((id) => familyIds.has(id));
    const moreThanOne = activeFamilies.filter((id) => (activeByFamily.get(id) ?? 0) > 1).length;
    rows.push({
      kpi: 'Families with >1 active member',
      target: '>40%',
      value: pct(moreThanOne, families.length),
      rule: `two or more members who opened the app in the last ${days} days`,
    });

    // --- Visibility and groups ---
    const narrowed = await prisma.event.findMany({
      where: {
        deletedAt: null,
        createdAt: { gte: since },
        visibilityKind: { not: VisibilityKind.family },
      },
      select: { familyId: true },
      distinct: ['familyId'],
    });
    const narrowedIds = new Set(narrowed.map((e) => e.familyId));
    rows.push({
      kpi: 'Use of visibility/groups',
      target: '>25% of active families',
      value: pct(activeFamilies.filter((id) => narrowedIds.has(id)).length, activeFamilies.length),
      rule: `active families that added an event not for the whole family in the last ${days} days`,
    });

    // --- Premium ---
    const premium = await prisma.subscription.count({
      where: { plan: 'premium', status: 'active', familyId: { in: [...familyIds] } },
    });
    rows.push({
      kpi: 'Free → Premium',
      target: '3–7%',
      value: pct(premium, families.length),
      rule: 'families with an active Premium subscription',
    });

    rows.push({ kpi: 'NPS', target: '>30', value: 'not measured', rule: 'needs the in-app survey (docs/08)' });

    // --- Suggestions ---
    const suggestions = await prisma.analyticsEvent.findMany({
      where: {
        name: { in: ['suggestion_shown', 'suggestion_accepted', 'suggestion_rejected'] },
        createdAt: { gte: since },
      },
      select: { name: true, props: true },
    });
    const byKind = new Map<string, { shown: number; accepted: number; rejected: number }>();
    for (const s of suggestions) {
      const kind = String((s.props as { kind?: unknown } | null)?.kind ?? 'unknown');
      const tally = byKind.get(kind) ?? { shown: 0, accepted: 0, rejected: 0 };
      if (s.name === 'suggestion_shown') tally.shown++;
      if (s.name === 'suggestion_accepted') tally.accepted++;
      if (s.name === 'suggestion_rejected') tally.rejected++;
      byKind.set(kind, tally);
    }
    for (const [kind, tally] of byKind) {
      rows.push({
        kpi: `Suggestions: ${kind}`,
        target: '—',
        value: `accepted ${pct(tally.accepted, tally.shown)}, declined ${tally.rejected}`,
        rule: `shown in the last ${days} days`,
      });
    }

    // --- Errors ---
    const errors = await prisma.clientError.groupBy({
      by: ['message'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { message: 'desc' } },
      take: 5,
    });
    const errorTotal = await prisma.clientError.count({ where: { createdAt: { gte: since } } });

    if (process.argv.includes('--json')) {
      console.log(JSON.stringify({ days, generatedAt: now.toISOString(), rows, errors: { total: errorTotal, top: errors.map((e) => ({ message: e.message, count: e._count._all })) } }, null, 2));
      return;
    }

    const width = (key: keyof Row) => Math.max(...rows.map((r) => r[key].length), key.length);
    const line = (r: Row) =>
      `${r.kpi.padEnd(width('kpi'))}  ${r.target.padEnd(width('target'))}  ${r.value.padEnd(width('value'))}  ${r.rule}`;

    console.log(`FamStory KPIs - last ${days} days, ${now.toISOString().slice(0, 10)}`);
    if (firstOpen) console.log(`Visits counted since ${firstOpen.toISOString().slice(0, 10)}.`);
    console.log('');
    console.log(line({ kpi: 'KPI', target: 'Target', value: 'Now', rule: 'Counted as' }));
    for (const r of rows) console.log(line(r));
    console.log('');
    console.log(`App errors in the last ${days} days: ${errorTotal}`);
    for (const e of errors) console.log(`  ${String(e._count._all).padStart(4)}  ${e.message.slice(0, 100)}`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
