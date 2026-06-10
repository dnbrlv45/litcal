-- Add hearing subtype fields to Event
ALTER TABLE "Event"
  ADD COLUMN IF NOT EXISTS "subtype" TEXT,
  ADD COLUMN IF NOT EXISTS "subtypeReason" TEXT;
