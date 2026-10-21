-- CreateTable
CREATE TABLE "MemberBlock" (
    "blockerMemberId" TEXT NOT NULL,
    "blockedMemberId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberBlock_pkey" PRIMARY KEY ("blockerMemberId","blockedMemberId")
);

-- CreateIndex
CREATE INDEX "MemberBlock_blockedMemberId_idx" ON "MemberBlock"("blockedMemberId");

-- CreateIndex
CREATE INDEX "MemberBlock_familyId_idx" ON "MemberBlock"("familyId");

-- AddForeignKey
ALTER TABLE "MemberBlock" ADD CONSTRAINT "MemberBlock_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberBlock" ADD CONSTRAINT "MemberBlock_blockerMemberId_fkey" FOREIGN KEY ("blockerMemberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberBlock" ADD CONSTRAINT "MemberBlock_blockedMemberId_fkey" FOREIGN KEY ("blockedMemberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
