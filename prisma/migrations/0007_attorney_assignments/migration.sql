-- Case: attorney assignment fields
ALTER TABLE "Case" ADD COLUMN "assignedAttorneyId"  TEXT;
ALTER TABLE "Case" ADD COLUMN "assignedParalegalId" TEXT;
ALTER TABLE "Case" ADD COLUMN "assignedAssistantId" TEXT;

ALTER TABLE "Case"
  ADD CONSTRAINT "Case_assignedAttorneyId_fkey"
    FOREIGN KEY ("assignedAttorneyId") REFERENCES "User"(id) ON DELETE SET NULL,
  ADD CONSTRAINT "Case_assignedParalegalId_fkey"
    FOREIGN KEY ("assignedParalegalId") REFERENCES "User"(id) ON DELETE SET NULL,
  ADD CONSTRAINT "Case_assignedAssistantId_fkey"
    FOREIGN KEY ("assignedAssistantId") REFERENCES "User"(id) ON DELETE SET NULL;

CREATE INDEX "Case_assignedAttorneyId_idx"  ON "Case"("assignedAttorneyId");
CREATE INDEX "Case_assignedParalegalId_idx" ON "Case"("assignedParalegalId");
CREATE INDEX "Case_assignedAssistantId_idx" ON "Case"("assignedAssistantId");

-- Event: attorney inheritance field
ALTER TABLE "Event" ADD COLUMN "assignedAttorneyId" TEXT;

ALTER TABLE "Event"
  ADD CONSTRAINT "Event_assignedAttorneyId_fkey"
    FOREIGN KEY ("assignedAttorneyId") REFERENCES "User"(id) ON DELETE SET NULL;

CREATE INDEX "Event_assignedAttorneyId_idx" ON "Event"("assignedAttorneyId");
