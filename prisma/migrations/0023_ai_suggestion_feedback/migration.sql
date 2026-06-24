ALTER TABLE "AISuggestion"
  ADD COLUMN "originalExtractedJson" JSONB,
  ADD COLUMN "finalApprovedJson" JSONB,
  ADD COLUMN "correctedFields" JSONB,
  ADD COLUMN "userAction" TEXT,
  ADD COLUMN "reviewedBy" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3);

UPDATE "AISuggestion"
SET "originalExtractedJson" = "extractedData"
WHERE "originalExtractedJson" IS NULL;

CREATE INDEX "AISuggestion_userAction_idx" ON "AISuggestion"("userAction");
CREATE INDEX "AISuggestion_reviewedAt_idx" ON "AISuggestion"("reviewedAt");
