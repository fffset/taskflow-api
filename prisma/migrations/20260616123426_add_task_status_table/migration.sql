/*
  Warnings:

  - You are about to drop the column `status` on the `tasks` table. All the data in the column will be lost.
  - Added the required column `statusId` to the `tasks` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "tasks_status_idx";

-- AlterTable
ALTER TABLE "tasks" DROP COLUMN "status",
ADD COLUMN     "statusId" TEXT NOT NULL;

-- DropEnum
DROP TYPE "TaskStatus";

-- CreateTable
CREATE TABLE "task_statuses" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6B7280',
    "position" INTEGER NOT NULL DEFAULT 0,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_statuses_workspaceId_idx" ON "task_statuses"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "task_statuses_workspaceId_name_key" ON "task_statuses"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "tasks_statusId_idx" ON "tasks"("statusId");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "task_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_statuses" ADD CONSTRAINT "task_statuses_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
