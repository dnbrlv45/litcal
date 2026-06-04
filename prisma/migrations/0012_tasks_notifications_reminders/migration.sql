-- Add new EventType values
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'COURT_CALL';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'CASE_MANAGEMENT_CONFERENCE';

-- Create TaskAssignee join table
CREATE TABLE "TaskAssignee" (
    "taskId"   TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    CONSTRAINT "TaskAssignee_pkey" PRIMARY KEY ("taskId", "memberId")
);
CREATE INDEX "TaskAssignee_memberId_idx" ON "TaskAssignee"("memberId");

-- Migrate existing single assignees to the join table
INSERT INTO "TaskAssignee" ("taskId", "memberId")
SELECT "id", "assignedToId"
FROM "Task"
WHERE "assignedToId" IS NOT NULL;

-- Drop old single-assignee column
ALTER TABLE "Task" DROP COLUMN IF EXISTS "assignedToId";

-- Add FK constraints for TaskAssignee
ALTER TABLE "TaskAssignee"
    ADD CONSTRAINT "TaskAssignee_taskId_fkey"
        FOREIGN KEY ("taskId")   REFERENCES "Task"("id")            ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskAssignee"
    ADD CONSTRAINT "TaskAssignee_memberId_fkey"
        FOREIGN KEY ("memberId") REFERENCES "WorkspaceMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create EventReminder table
CREATE TABLE "EventReminder" (
    "id"            TEXT NOT NULL,
    "eventId"       TEXT NOT NULL,
    "minutesBefore" INTEGER NOT NULL,
    "sendAt"        TIMESTAMP(3) NOT NULL,
    "sent"          BOOLEAN NOT NULL DEFAULT false,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventReminder_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EventReminder_eventId_idx"   ON "EventReminder"("eventId");
CREATE INDEX "EventReminder_sendAt_sent_idx" ON "EventReminder"("sendAt", "sent");
ALTER TABLE "EventReminder"
    ADD CONSTRAINT "EventReminder_eventId_fkey"
        FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create NotificationType enum
CREATE TYPE "NotificationType" AS ENUM ('TASK_ASSIGNED', 'EVENT_REMINDER');

-- Create Notification table
CREATE TABLE "Notification" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type"        "NotificationType" NOT NULL,
    "title"       TEXT NOT NULL,
    "body"        TEXT,
    "read"        BOOLEAN NOT NULL DEFAULT false,
    "taskId"      TEXT,
    "eventId"     TEXT,
    "caseId"      TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Notification_userId_read_idx"  ON "Notification"("userId", "read");
CREATE INDEX "Notification_workspaceId_idx"  ON "Notification"("workspaceId");
CREATE INDEX "Notification_taskId_idx"       ON "Notification"("taskId");
ALTER TABLE "Notification"
    ADD CONSTRAINT "Notification_userId_fkey"
        FOREIGN KEY ("userId")      REFERENCES "User"("id")      ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification"
    ADD CONSTRAINT "Notification_workspaceId_fkey"
        FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification"
    ADD CONSTRAINT "Notification_taskId_fkey"
        FOREIGN KEY ("taskId")  REFERENCES "Task"("id")  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Notification"
    ADD CONSTRAINT "Notification_eventId_fkey"
        FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Notification"
    ADD CONSTRAINT "Notification_caseId_fkey"
        FOREIGN KEY ("caseId")  REFERENCES "Case"("id")  ON DELETE SET NULL ON UPDATE CASCADE;
