-- Per-user Google Calendar sync tracking.
-- Existing GoogleCalendarSync is retained for legacy edit/delete paths.
CREATE TABLE "UserGoogleCalendarSync" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "googleEventId" TEXT NOT NULL,
    "googleCalendarId" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'SYNCED',
    "lastError" TEXT,

    CONSTRAINT "UserGoogleCalendarSync_pkey" PRIMARY KEY ("id")
);

INSERT INTO "UserGoogleCalendarSync" (
    "id",
    "eventId",
    "userId",
    "googleEventId",
    "googleCalendarId",
    "syncedAt",
    "updatedAt",
    "syncStatus",
    "lastError"
)
SELECT
    'ugcs_' || md5(g."eventId" || ':' || c."userId"),
    g."eventId",
    c."userId",
    g."googleEventId",
    g."googleCalendarId",
    g."syncedAt",
    g."updatedAt",
    g."syncStatus",
    g."lastError"
FROM "GoogleCalendarSync" g
JOIN "UserCalendarConnection" c
  ON c."providerCalendarId" = g."googleCalendarId"
 AND c."provider" = 'GOOGLE'
ON CONFLICT DO NOTHING;

CREATE UNIQUE INDEX "UserGoogleCalendarSync_eventId_userId_key" ON "UserGoogleCalendarSync"("eventId", "userId");
CREATE INDEX "UserGoogleCalendarSync_userId_idx" ON "UserGoogleCalendarSync"("userId");
CREATE INDEX "UserGoogleCalendarSync_googleEventId_idx" ON "UserGoogleCalendarSync"("googleEventId");

ALTER TABLE "UserGoogleCalendarSync" ADD CONSTRAINT "UserGoogleCalendarSync_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserGoogleCalendarSync" ADD CONSTRAINT "UserGoogleCalendarSync_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
