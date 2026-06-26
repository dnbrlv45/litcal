-- Drop the unique constraint that prevents multiple suggestions of the same
-- classification from a single email (e.g. 5 trials in one PDF attachment)
ALTER TABLE "AISuggestion" DROP CONSTRAINT "AISuggestion_workspaceId_gmailMessageId_classification_key";

-- Replace with a regular index for query performance
CREATE INDEX IF NOT EXISTS "AISuggestion_workspaceId_gmailMessageId_classification_idx"
  ON "AISuggestion" ("workspaceId", "gmailMessageId", "classification");
