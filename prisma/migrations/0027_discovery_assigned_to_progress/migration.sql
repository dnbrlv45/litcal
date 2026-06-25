-- CreateEnum
CREATE TYPE "DiscoveryProgressStatus" AS ENUM ('NOT_STARTED', 'QUESTIONNAIRE_SENT', 'IN_PROGRESS');

-- AlterTable
ALTER TABLE "DiscoveryItem" ADD COLUMN "assignedToId" TEXT;
ALTER TABLE "DiscoveryItem" ADD COLUMN "progressStatus" "DiscoveryProgressStatus" NOT NULL DEFAULT 'NOT_STARTED';

-- CreateIndex
CREATE INDEX "DiscoveryItem_assignedToId_idx" ON "DiscoveryItem"("assignedToId");

-- AddForeignKey
ALTER TABLE "DiscoveryItem" ADD CONSTRAINT "DiscoveryItem_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
