CREATE TABLE "AskLitCalLog" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "caseId" TEXT,
  "question" TEXT NOT NULL,
  "answer" TEXT NOT NULL,
  "model" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AskLitCalLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AskLitCalLog_workspaceId_idx" ON "AskLitCalLog"("workspaceId");
CREATE INDEX "AskLitCalLog_userId_idx" ON "AskLitCalLog"("userId");
CREATE INDEX "AskLitCalLog_createdAt_idx" ON "AskLitCalLog"("createdAt");

ALTER TABLE "AskLitCalLog" ADD CONSTRAINT "AskLitCalLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE;
ALTER TABLE "AskLitCalLog" ADD CONSTRAINT "AskLitCalLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
