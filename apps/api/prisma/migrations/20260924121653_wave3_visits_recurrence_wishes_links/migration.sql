-- CreateEnum
CREATE TYPE "RepeatRule" AS ENUM ('daily', 'weekly', 'monthly', 'yearly');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "promptKey" TEXT,
ADD COLUMN     "repeat" "RepeatRule",
ADD COLUMN     "repeatSkips" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "repeatTimeZone" TEXT,
ADD COLUMN     "repeatUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "avatarKey" TEXT,
ADD COLUMN     "diedOn" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MemberVisit" (
    "memberId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberVisit_pkey" PRIMARY KEY ("memberId")
);

-- CreateTable
CREATE TABLE "CalendarFeed" (
    "memberId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastFetchedAt" TIMESTAMP(3),

    CONSTRAINT "CalendarFeed_pkey" PRIMARY KEY ("memberId")
);

-- CreateTable
CREATE TABLE "WishItem" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "forMemberId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "addedByMemberId" TEXT NOT NULL,
    "claimedByMemberId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "WishItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventShareLink" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdByMemberId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "lastViewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WishItem_familyId_forMemberId_idx" ON "WishItem"("familyId", "forMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "EventShareLink_tokenHash_key" ON "EventShareLink"("tokenHash");

-- CreateIndex
CREATE INDEX "EventShareLink_eventId_idx" ON "EventShareLink"("eventId");

-- AddForeignKey
ALTER TABLE "MemberVisit" ADD CONSTRAINT "MemberVisit_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarFeed" ADD CONSTRAINT "CalendarFeed_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WishItem" ADD CONSTRAINT "WishItem_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WishItem" ADD CONSTRAINT "WishItem_forMemberId_fkey" FOREIGN KEY ("forMemberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WishItem" ADD CONSTRAINT "WishItem_addedByMemberId_fkey" FOREIGN KEY ("addedByMemberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WishItem" ADD CONSTRAINT "WishItem_claimedByMemberId_fkey" FOREIGN KEY ("claimedByMemberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventShareLink" ADD CONSTRAINT "EventShareLink_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventShareLink" ADD CONSTRAINT "EventShareLink_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventShareLink" ADD CONSTRAINT "EventShareLink_createdByMemberId_fkey" FOREIGN KEY ("createdByMemberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
