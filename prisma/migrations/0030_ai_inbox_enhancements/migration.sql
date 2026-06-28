ALTER TABLE "AISuggestion" ADD COLUMN "correctionCount" INT NOT NULL DEFAULT 0;
ALTER TABLE "AISuggestion" ADD COLUMN "notes" TEXT;
ALTER TABLE "AISuggestion" ADD COLUMN "matchedEventId" TEXT;
