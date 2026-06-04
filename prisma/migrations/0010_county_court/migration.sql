-- CreateTable County
CREATE TABLE "County" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "County_pkey" PRIMARY KEY ("id")
);

-- CreateTable Court
CREATE TABLE "Court" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "countyId" TEXT NOT NULL,
    CONSTRAINT "Court_pkey" PRIMARY KEY ("id")
);

-- AlterTable Case: add countyId and courtId columns
ALTER TABLE "Case" ADD COLUMN "countyId" TEXT;
ALTER TABLE "Case" ADD COLUMN "courtId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "County_name_key" ON "County"("name");
CREATE UNIQUE INDEX "Court_countyId_name_key" ON "Court"("countyId", "name");
CREATE INDEX "Court_countyId_idx" ON "Court"("countyId");
CREATE INDEX "Case_countyId_idx" ON "Case"("countyId");
CREATE INDEX "Case_courtId_idx" ON "Case"("courtId");

-- AddForeignKey
ALTER TABLE "Court" ADD CONSTRAINT "Court_countyId_fkey"
    FOREIGN KEY ("countyId") REFERENCES "County"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Case" ADD CONSTRAINT "Case_countyId_fkey"
    FOREIGN KEY ("countyId") REFERENCES "County"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Case" ADD CONSTRAINT "Case_courtId_fkey"
    FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: set countyId on existing cases where county text matches a County name
-- (runs after seed populates County table; no-op if seed hasn't run yet — safe)
UPDATE "Case" c
SET "countyId" = co."id"
FROM "County" co
WHERE lower(c."county") = lower(co."name")
  AND c."countyId" IS NULL;

-- Backfill: set courtId on existing cases where court text matches a Court name within matched county
UPDATE "Case" c
SET "courtId" = ct."id"
FROM "Court" ct
WHERE lower(c."court") = lower(ct."name")
  AND ct."countyId" = c."countyId"
  AND c."courtId" IS NULL
  AND c."countyId" IS NOT NULL;
