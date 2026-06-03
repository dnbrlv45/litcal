-- AlterTable
ALTER TABLE "User" ADD COLUMN "microsoftSub" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_microsoftSub_key" ON "User"("microsoftSub");
