-- AlterTable
ALTER TABLE "User" ADD COLUMN     "healthConsentAt" TIMESTAMP(3),
ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "termsVersion" VARCHAR(20);
