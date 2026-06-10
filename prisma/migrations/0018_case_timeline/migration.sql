CREATE TABLE IF NOT EXISTS "CaseTimeline" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "caseId"      TEXT NOT NULL REFERENCES "Case"("id") ON DELETE CASCADE,
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "actorUserId" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "type"        TEXT NOT NULL,
  "title"       TEXT NOT NULL,
  "description" TEXT,
  "metadata"    JSONB,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CaseTimeline_caseId_createdAt_idx" ON "CaseTimeline"("caseId", "createdAt");
CREATE INDEX IF NOT EXISTS "CaseTimeline_workspaceId_idx" ON "CaseTimeline"("workspaceId");
