/**
 * THE REPORTS, for whoever runs FamStory.
 *
 *     npm --prefix apps/api run reports                  # open ones, oldest first
 *     npm --prefix apps/api run reports -- --all         # resolved ones too
 *     npm --prefix apps/api run reports -- --resolve <id>
 *
 * The terms promise action within 24 hours (docs/legal/terms-of-use.md,
 * "Reporting", and App Review guideline 1.2): this is read every day, and
 * where they are read. It prints what each report is:
 * when, which family, an entry or a comment, the reason, the reporter's note,
 * and whether the thing is still there. It does not print what the family
 * wrote. Acting on that is the family admins' job, and they were told
 * (docs/02-DATA-MODEL.md, Reports).
 *
 * Read-only, except --resolve, which marks one report as dealt with.
 */
import { PrismaClient } from '@prisma/client';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const args = process.argv.slice(2);
  try {
    const resolveAt = args.indexOf('--resolve');
    if (resolveAt >= 0) {
      const id = args[resolveAt + 1];
      if (!id) throw new Error('--resolve needs the id of a report');
      const done = await prisma.contentReport.updateMany({
        where: { id, resolvedAt: null },
        data: { resolvedAt: new Date() },
      });
      console.log(done.count ? `resolved ${id}` : `no open report ${id}`);
      return;
    }

    const reports = await prisma.contentReport.findMany({
      where: args.includes('--all') ? {} : { resolvedAt: null },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        createdAt: true,
        resolvedAt: true,
        target: true,
        reason: true,
        note: true,
        familyId: true,
        eventId: true,
        commentId: true,
        family: { select: { name: true } },
        event: { select: { deletedAt: true } },
        comment: { select: { deletedAt: true } },
      },
    });

    if (reports.length === 0) {
      console.log('No open reports.');
      return;
    }
    for (const report of reports) {
      const gone = report.target === 'comment' ? report.comment?.deletedAt : report.event.deletedAt;
      console.log(
        [
          `${report.id}  ${report.createdAt.toISOString().slice(0, 16).replace('T', ' ')}`,
          `  family   ${report.family.name} (${report.familyId})`,
          `  ${report.target.padEnd(8)} ${report.commentId ?? report.eventId}${gone ? '  - already deleted' : ''}`,
          `  reason   ${report.reason}`,
          report.note ? `  note     ${report.note}` : null,
          report.resolvedAt ? `  resolved ${report.resolvedAt.toISOString().slice(0, 10)}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
      );
    }
    console.log(`\n${reports.length} report(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
