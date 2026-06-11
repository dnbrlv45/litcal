INSERT INTO "EventReminder" ("id", "eventId", "minutesBefore", "sendAt", "sent", "createdAt")
SELECT
  'cmc-7d-' || e."id",
  e."id",
  10080,
  CASE
    WHEN EXTRACT(DOW FROM (e."startTime" - INTERVAL '10080 minutes')) = 6
      THEN e."startTime" - INTERVAL '10080 minutes' - INTERVAL '1 day'
    WHEN EXTRACT(DOW FROM (e."startTime" - INTERVAL '10080 minutes')) = 0
      THEN e."startTime" - INTERVAL '10080 minutes' - INTERVAL '2 days'
    ELSE e."startTime" - INTERVAL '10080 minutes'
  END,
  false,
  NOW()
FROM "Event" e
WHERE e."eventType" = 'CASE_MANAGEMENT_CONFERENCE'
  AND e."status" NOT IN ('COMPLETED', 'CANCELLED')
  AND e."startTime" >= NOW()
  AND NOT EXISTS (
    SELECT 1 FROM "EventReminder" r
    WHERE r."eventId" = e."id" AND r."minutesBefore" = 10080
  );

INSERT INTO "EventReminder" ("id", "eventId", "minutesBefore", "sendAt", "sent", "createdAt")
SELECT
  'cmc-1d-' || e."id",
  e."id",
  1440,
  CASE
    WHEN EXTRACT(DOW FROM (e."startTime" - INTERVAL '1440 minutes')) = 6
      THEN e."startTime" - INTERVAL '1440 minutes' - INTERVAL '1 day'
    WHEN EXTRACT(DOW FROM (e."startTime" - INTERVAL '1440 minutes')) = 0
      THEN e."startTime" - INTERVAL '1440 minutes' - INTERVAL '2 days'
    ELSE e."startTime" - INTERVAL '1440 minutes'
  END,
  false,
  NOW()
FROM "Event" e
WHERE e."eventType" = 'CASE_MANAGEMENT_CONFERENCE'
  AND e."status" NOT IN ('COMPLETED', 'CANCELLED')
  AND e."startTime" >= NOW()
  AND NOT EXISTS (
    SELECT 1 FROM "EventReminder" r
    WHERE r."eventId" = e."id" AND r."minutesBefore" = 1440
  );
