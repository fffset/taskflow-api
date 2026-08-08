/*
  Warnings:

  - You are about to drop the column `isRead` on the `notifications` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "notifications_userId_isRead_idx";

-- AlterTable
ALTER TABLE "notifications" DROP COLUMN "isRead",
ADD COLUMN     "readAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "notifications_userId_idx" ON "notifications"("userId");
