-- What a person likes, for gift ideas; and the days a family marks.
-- docs/07-IMPROVEMENTS.md items 91-93.

-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'special_day';

-- AlterTable
ALTER TABLE "Member" ADD COLUMN "interests" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN "dayKey" TEXT,
ADD COLUMN "dayOn" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Notification_memberId_dayKey_dayOn_key" ON "Notification"("memberId", "dayKey", "dayOn");
