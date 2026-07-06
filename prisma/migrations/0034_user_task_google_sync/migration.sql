-- CreateTable
CREATE TABLE IF NOT EXISTS "UserTaskGoogleSync" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "googleEventId" TEXT NOT NULL,
    "googleCalendarId" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'SYNCED',
    "lastError" TEXT,

    CONSTRAINT "UserTaskGoogleSync_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "UserTaskGoogleSync_taskId_userId_key" ON "UserTaskGoogleSync"("taskId", "userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UserTaskGoogleSync_userId_idx" ON "UserTaskGoogleSync"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UserTaskGoogleSync_googleEventId_idx" ON "UserTaskGoogleSync"("googleEventId");

-- AddForeignKey
ALTER TABLE "UserTaskGoogleSync" ADD CONSTRAINT "UserTaskGoogleSync_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTaskGoogleSync" ADD CONSTRAINT "UserTaskGoogleSync_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
