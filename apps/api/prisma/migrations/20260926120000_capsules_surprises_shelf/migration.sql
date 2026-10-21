-- Time capsules, birthday surprises, the story shelf and heirloom stickers
-- (docs/07-IMPROVEMENTS.md items 75-82). Every column is new and empty or
-- false, so no existing event changes: nothing is sealed, hidden or shelved.
-- PostgreSQL 12+ adds several enum values in one transaction (this is 18).

ALTER TYPE "NotificationKind" ADD VALUE 'capsule_opened';
ALTER TYPE "NotificationKind" ADD VALUE 'surprise_ready';

ALTER TABLE "Event" ADD COLUMN     "hiddenFromMemberId" TEXT,
ADD COLUMN     "onStoryShelf" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "revealAt" TIMESTAMP(3),
ADD COLUMN     "sealedUntil" TIMESTAMP(3),
ADD COLUMN     "unlockNotifiedAt" TIMESTAMP(3);

ALTER TABLE "EventShareLink" ADD COLUMN     "heirloom" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Event_hiddenFromMemberId_idx" ON "Event"("hiddenFromMemberId");

ALTER TABLE "Event" ADD CONSTRAINT "Event_hiddenFromMemberId_fkey" FOREIGN KEY ("hiddenFromMemberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
