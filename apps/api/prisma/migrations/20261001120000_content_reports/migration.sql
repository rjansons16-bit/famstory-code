-- Reports: "this should not be here", for an entry or a comment (App Review 1.2).
-- docs/02-DATA-MODEL.md, Reports; docs/09-APP-STORES.md section 3.3.

-- CreateEnum
CREATE TYPE "ReportTarget" AS ENUM ('event', 'comment');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('inappropriate', 'harassment', 'spam', 'other');

-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'content_reported';

-- CreateTable
CREATE TABLE "ContentReport" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "reporterMemberId" TEXT NOT NULL,
    "target" "ReportTarget" NOT NULL,
    "eventId" TEXT NOT NULL,
    "commentId" TEXT,
    "reason" "ReportReason" NOT NULL,
    "note" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ContentReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentReport_resolvedAt_createdAt_idx" ON "ContentReport"("resolvedAt", "createdAt");

-- CreateIndex
CREATE INDEX "ContentReport_familyId_idx" ON "ContentReport"("familyId");

-- CreateIndex
CREATE INDEX "ContentReport_reporterMemberId_eventId_idx" ON "ContentReport"("reporterMemberId", "eventId");

-- AddForeignKey
ALTER TABLE "ContentReport" ADD CONSTRAINT "ContentReport_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentReport" ADD CONSTRAINT "ContentReport_reporterMemberId_fkey" FOREIGN KEY ("reporterMemberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentReport" ADD CONSTRAINT "ContentReport_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentReport" ADD CONSTRAINT "ContentReport_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
