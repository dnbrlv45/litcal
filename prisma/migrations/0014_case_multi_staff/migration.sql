CREATE TYPE "CaseStaffRole" AS ENUM ('ATTORNEY', 'PARALEGAL', 'ASSISTANT');

CREATE TABLE "CaseStaff" (
  "id"        TEXT NOT NULL,
  "caseId"    TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "role"      "CaseStaffRole" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CaseStaff_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CaseStaff_caseId_userId_role_key" UNIQUE ("caseId", "userId", "role"),
  CONSTRAINT "CaseStaff_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE,
  CONSTRAINT "CaseStaff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE INDEX "CaseStaff_caseId_idx" ON "CaseStaff"("caseId");
CREATE INDEX "CaseStaff_userId_idx" ON "CaseStaff"("userId");

ALTER TABLE "Case"
  DROP COLUMN IF EXISTS "assignedAttorneyId",
  DROP COLUMN IF EXISTS "assignedParalegalId",
  DROP COLUMN IF EXISTS "assignedAssistantId";
