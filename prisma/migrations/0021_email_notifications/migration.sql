CREATE TABLE "UserNotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskAssignedEmails" BOOLEAN NOT NULL DEFAULT true,
    "taskDueEmails" BOOLEAN NOT NULL DEFAULT true,
    "deadlineReminderEmails" BOOLEAN NOT NULL DEFAULT true,
    "discoveryReminderEmails" BOOLEAN NOT NULL DEFAULT true,
    "remoteAppearanceReminderEmails" BOOLEAN NOT NULL DEFAULT true,
    "ruleApprovalEmails" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "UserNotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailNotificationLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "emailType" TEXT NOT NULL,
    "relatedEntityType" TEXT NOT NULL,
    "relatedEntityId" TEXT NOT NULL,
    "reminderKey" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sentAt" TIMESTAMPTZ,
    "error" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "EmailNotificationLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserNotificationPreference_userId_key" ON "UserNotificationPreference"("userId");
CREATE UNIQUE INDEX "EmailNotificationLog_userId_emailType_relatedEntityType_relatedEntityId_reminderKey_key" ON "EmailNotificationLog"("userId", "emailType", "relatedEntityType", "relatedEntityId", "reminderKey");
CREATE INDEX "EmailNotificationLog_userId_idx" ON "EmailNotificationLog"("userId");
CREATE INDEX "EmailNotificationLog_workspaceId_idx" ON "EmailNotificationLog"("workspaceId");
CREATE INDEX "EmailNotificationLog_emailType_idx" ON "EmailNotificationLog"("emailType");
CREATE INDEX "EmailNotificationLog_status_idx" ON "EmailNotificationLog"("status");
CREATE INDEX "EmailNotificationLog_sentAt_idx" ON "EmailNotificationLog"("sentAt");

ALTER TABLE "UserNotificationPreference" ADD CONSTRAINT "UserNotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailNotificationLog" ADD CONSTRAINT "EmailNotificationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
