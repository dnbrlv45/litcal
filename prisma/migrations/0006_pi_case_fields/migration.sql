-- Rename jurisdiction to county (idempotent)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Case' AND column_name = 'jurisdiction'
  ) THEN
    ALTER TABLE "Case" RENAME COLUMN "jurisdiction" TO "county";
  END IF;
END $$;

-- Add defendant / defense fields (idempotent)
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "defendant"       TEXT;
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "defenseFirm"     TEXT;
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "defenseAttorney" TEXT;

-- Replace CaseType enum with PI-specific values (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CaseType_new') THEN
    CREATE TYPE "CaseType_new" AS ENUM (
      'AUTO_ACCIDENT',
      'SLIP_AND_FALL',
      'GOVERNMENT_CLAIM',
      'DOG_BITE',
      'PREMISES_LIABILITY',
      'MEDICAL_MALPRACTICE',
      'WRONGFUL_DEATH',
      'PRODUCT_LIABILITY',
      'OTHER'
    );
  END IF;
END $$;

-- Drop existing default so type change can proceed
ALTER TABLE "Case" ALTER COLUMN "caseType" DROP DEFAULT;

-- Change column type, mapping all old values to OTHER
ALTER TABLE "Case"
  ALTER COLUMN "caseType" TYPE "CaseType_new"
  USING 'OTHER'::"CaseType_new";

-- Set new default
ALTER TABLE "Case"
  ALTER COLUMN "caseType" SET DEFAULT 'AUTO_ACCIDENT'::"CaseType_new";

-- Swap the type names
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CaseType') THEN
    DROP TYPE "CaseType";
  END IF;
END $$;
ALTER TYPE "CaseType_new" RENAME TO "CaseType";
