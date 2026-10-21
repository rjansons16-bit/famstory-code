-- CreateEnum
CREATE TYPE "PurchaseStore" AS ENUM ('app_store', 'play_store', 'promotional', 'other');

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "sandbox" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "store" "PurchaseStore",
ADD COLUMN     "syncedAt" TIMESTAMP(3);
