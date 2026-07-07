import { prisma } from "@/lib/prisma";
import { sendLitCalEmail } from "@/lib/google-mail";
import { adjustToBusinessDay, DAY_OF_9AM } from "@/lib/reminders";

export type EmailNotificationType =
  | "TASK_ASSIGNED"
  | "TASK_DUE"
  | "EVENT_REMINDER"
  | "DEADLINE_REMINDER"
  | "DISCOVERY_REMINDER"
  | "REMOTE_APPEARANCE_REMINDER"
  | "RULE_APPROVAL";

type PreferenceFlag =
  | "taskAssignedEmails"
  | "taskDueEmails"
  | "eventReminderEmails"
  | "deadlineReminderEmails"
  | "discoveryReminderEmails"
  | "remoteAppearanceReminderEmails"
  | "ruleApprovalEmails";

const EMAIL_PREF_BY_TYPE: Record<EmailNotificationType, PreferenceFlag> = {
  TASK_ASSIGNED: "taskAssignedEmails",
  TASK_DUE: "taskDueEmails",
  EVENT_REMINDER: "eventReminderEmails",
  DEADLINE_REMINDER: "deadlineReminderEmails",
  DISCOVERY_REMINDER: "discoveryReminderEmails",
  REMOTE_APPEARANCE_REMINDER: "remoteAppearanceReminderEmails",
  RULE_APPROVAL: "ruleApprovalEmails",
};

interface EmailField {
  label: string;
  value: string | null | undefined;
}

interface LoggedEmailInput {
  userId: string;
  workspaceId?: string | null;
  recipientEmail: string | null | undefined;
  emailType: EmailNotificationType;
  relatedEntityType: string;
  relatedEntityId: string;
  reminderKey: string;
  subject: string;
  preview: string;
  heading: string;
  fields: EmailField[];
  actionLabel: string;
  actionPath: string;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function appUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://litcal.app";
  return new URL(path, base).toString();
}

function formatDate(date: Date | string | null | undefined) {
  if (!date) return null;
  return new Date(date).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function daysRemaining(dueDate: Date | string) {
  const today = new Date();
  const todayUTC = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const due = new Date(dueDate);
  const dueUTC = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  return Math.ceil((dueUTC - todayUTC) / 86_400_000);
}

function reminderKeyFromMinutes(minutesBefore: number) {
  if (minutesBefore === DAY_OF_9AM) return "day-of";
  if (minutesBefore % 1440 === 0) return `${minutesBefore / 1440}d`;
  if (minutesBefore % 60 === 0) return `${minutesBefore / 60}h`;
  return `${minutesBefore}m`;
}

function buildEmail({
  preview,
  heading,
  fields,
  actionLabel,
  actionUrl,
}: {
  preview: string;
  heading: string;
  fields: EmailField[];
  actionLabel: string;
  actionUrl: string;
}) {
  const visibleFields = fields.filter((field) => field.value);
  const text = [
    heading,
    "",
    ...visibleFields.map((field) => `${field.label}: ${field.value}`),
    "",
    `${actionLabel}: ${actionUrl}`,
  ].join("\n");

  const rows = visibleFields.map((field) => `
    <tr>
      <td style="padding:10px 0;color:#64748b;font-size:13px;width:150px;">${escapeHtml(field.label)}</td>
      <td style="padding:10px 0;color:#0f172a;font-size:14px;font-weight:600;">${escapeHtml(field.value ?? "")}</td>
    </tr>
  `).join("");

  const html = `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(preview)}</title>
  </head>
  <body style="margin:0;background:#f8fafc;padding:32px 0;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
      <tr>
        <td align="center" style="padding:0 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;border-collapse:collapse;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="padding:28px 30px 18px;border-bottom:1px solid #e2e8f0;">
                <div style="display:flex;align-items:center;gap:10px;">
                  <img src="${escapeHtml(appUrl("/litcal-logo.svg"))}" width="28" height="28" alt="LitCal" style="display:block;" />
                  <div style="font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#0f766e;">LitCal</div>
                </div>
                <h1 style="margin:16px 0 0;font-size:24px;line-height:1.25;color:#0f172a;">${escapeHtml(heading)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 30px 8px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                  ${rows}
                </table>
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0;">
                  <tr>
                    <td>
                      <a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:8px;padding:12px 18px;font-size:14px;font-weight:700;">${escapeHtml(actionLabel)}</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 30px 26px;border-top:1px solid #e2e8f0;">
                <p style="margin:0;font-size:12px;line-height:1.5;color:#94a3b8;">You received this because LitCal email notifications are enabled in your account settings.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { text, html };
}

async function emailEnabled(userId: string, emailType: EmailNotificationType) {
  const prefs = await prisma.userNotificationPreference.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
  return prefs[EMAIL_PREF_BY_TYPE[emailType]];
}

export async function sendLoggedLitCalEmail(input: LoggedEmailInput) {
  if (!input.recipientEmail) return { status: "skipped" as const, reason: "missing_recipient" as const };
  const enabled = await emailEnabled(input.userId, input.emailType);
  if (!enabled) return { status: "skipped" as const, reason: "preference_disabled" as const };

  const existing = await prisma.emailNotificationLog.findUnique({
    where: {
      userId_emailType_relatedEntityType_relatedEntityId_reminderKey: {
        userId: input.userId,
        emailType: input.emailType,
        relatedEntityType: input.relatedEntityType,
        relatedEntityId: input.relatedEntityId,
        reminderKey: input.reminderKey,
      },
    },
  });
  if (existing?.status === "SENT") return { status: "skipped" as const, reason: "duplicate" as const };

  const log = existing
    ? await prisma.emailNotificationLog.update({
        where: { id: existing.id },
        data: {
          workspaceId: input.workspaceId ?? null,
          recipientEmail: input.recipientEmail,
          subject: input.subject,
          status: "PENDING",
          error: null,
        },
      })
    : await prisma.emailNotificationLog.create({
        data: {
          userId: input.userId,
          workspaceId: input.workspaceId ?? null,
          emailType: input.emailType,
          relatedEntityType: input.relatedEntityType,
          relatedEntityId: input.relatedEntityId,
          reminderKey: input.reminderKey,
          recipientEmail: input.recipientEmail,
          subject: input.subject,
          status: "PENDING",
        },
      });

  const actionUrl = appUrl(input.actionPath);
  const email = buildEmail({
    preview: input.preview,
    heading: input.heading,
    fields: input.fields,
    actionLabel: input.actionLabel,
    actionUrl,
  });

  const result = await sendLitCalEmail({
    recipientEmail: input.recipientEmail,
    subject: input.subject,
    text: email.text,
    html: email.html,
  });

  if (result.ok) {
    await prisma.emailNotificationLog.update({
      where: { id: log.id },
      data: { status: "SENT", sentAt: new Date(), error: null },
    });
    return { status: "sent" as const };
  }

  await prisma.emailNotificationLog.update({
    where: { id: log.id },
    data: { status: "FAILED", error: "detail" in result ? result.detail : result.reason },
  });
  return { status: "failed" as const, reason: result.reason };
}

function userName(user: { firstName: string | null; lastName: string | null; email: string }) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
}

export async function sendTaskAssignedEmails(taskId: string, assignerName?: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      workspace: { select: { id: true } },
      caseRef: { select: { id: true, title: true, caseNumber: true } },
      assignees: {
        include: {
          member: {
            select: {
              user: { select: { id: true, email: true, firstName: true, lastName: true } },
            },
          },
        },
      },
    },
  });
  if (!task) return { sent: 0, skipped: 0, failed: 0 };

  const assignedUsers = task.assignees.map((a) => userName(a.member.user)).join(", ");
  const counts = { sent: 0, skipped: 0, failed: 0 };
  for (const assignee of task.assignees) {
    const user = assignee.member.user;
    const result = await sendLoggedLitCalEmail({
      userId: user.id,
      workspaceId: task.workspace.id,
      recipientEmail: user.email,
      emailType: "TASK_ASSIGNED",
      relatedEntityType: "TASK",
      relatedEntityId: task.id,
      reminderKey: "immediate",
      subject: `Task Assigned — ${task.title}`,
      preview: `Task assigned: ${task.title}`,
      heading: "Task Assigned",
      fields: [
        { label: "Case", value: task.caseRef ? `${task.caseRef.title}${task.caseRef.caseNumber ? ` (#${task.caseRef.caseNumber})` : ""}` : null },
        { label: "Task", value: task.title },
        { label: "Due Date", value: formatDate(task.dueDate) },
        { label: "Priority", value: task.priority },
        { label: "Assigned Users", value: assignedUsers },
        { label: "Assigned By", value: assignerName },
      ],
      actionLabel: "Open in LitCal",
      actionPath: `/tasks?taskId=${task.id}`,
    });
    counts[result.status === "sent" ? "sent" : result.status === "failed" ? "failed" : "skipped"]++;
  }
  return counts;
}

export async function sendRuleApprovalEmail(requestId: string) {
  const request = await prisma.courtRuleRequest.findUnique({
    where: { id: requestId },
    include: {
      requestedBy: { select: { id: true, email: true } },
    },
  });
  if (!request) return { status: "skipped" as const };
  return sendLoggedLitCalEmail({
    userId: request.requestedBy.id,
    workspaceId: request.workspaceId,
    recipientEmail: request.requestedBy.email,
    emailType: "RULE_APPROVAL",
    relatedEntityType: "COURT_RULE_REQUEST",
    relatedEntityId: request.id,
    reminderKey: "immediate",
    subject: "Rule Request Approved — LitCal",
    preview: "Your LitCal court rule request was approved.",
    heading: "Rule Request Approved",
    fields: [
      { label: "County", value: request.county },
      { label: "Court", value: request.court },
      { label: "Department", value: request.department },
      { label: "Appearance Type", value: request.appearanceType },
    ],
    actionLabel: "Open in LitCal",
    actionPath: "/settings/court-rules",
  });
}

function eventEmailType(event: {
  eventType: string;
  discoveryLinked: { id: string } | null;
}): EmailNotificationType | null {
  if (event.discoveryLinked) return "DISCOVERY_REMINDER";
  if (event.eventType === "DEADLINE") return "DEADLINE_REMINDER";
  // All other scheduled event types get a generic event reminder email
  if (["HEARING","CONFERENCE","COURT_CALL","CASE_MANAGEMENT_CONFERENCE",
       "DEPOSITION","TRIAL","MEDIATION","MEETING"].includes(event.eventType)) {
    return "EVENT_REMINDER";
  }
  return null;
}

export async function sendEventReminderEmails(reminderIds: string[], coverageMap: Map<string, string> = new Map()) {
  if (reminderIds.length === 0) return { sent: 0, skipped: 0, failed: 0 };
  const reminders = await prisma.eventReminder.findMany({
    where: { id: { in: reminderIds } },
    include: {
      event: {
        include: {
          caseRef: {
            select: {
              id: true,
              title: true,
              caseNumber: true,
              county: true,
              court: true,
              staff: { include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } } },
            },
          },
          assignedAttorney: { select: { id: true, email: true, firstName: true, lastName: true } },
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
          discoveryLinked: { include: { extensions: { select: { id: true } } } },
          generatedDeadline: { include: { triggerEvent: { select: { title: true, eventType: true } } } },
        },
      },
    },
  });

  // Collect all covering user IDs we may need to look up
  const coveringUserIds = [...new Set([...coverageMap.values()])];
  const coveringUsers = coveringUserIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: coveringUserIds } },
        select: { id: true, email: true, firstName: true, lastName: true },
      })
    : [];
  const coveringUserMap = new Map(coveringUsers.map((u) => [u.id, u]));

  const counts = { sent: 0, skipped: 0, failed: 0 };
  for (const reminder of reminders) {
    const event = reminder.event;
    if (event.status === "COMPLETED" || event.status === "CANCELLED") continue;
    const emailType = eventEmailType(event);
    if (!emailType) continue;

    // Recipients: case staff + assigned attorney.
    // Do NOT include event.user (creator) — admins create events but shouldn't get reminder emails.
    // Fall back to creator only when there is no case.
    const recipientMap = new Map<string, { id: string; email: string; firstName: string | null; lastName: string | null }>();
    if (event.assignedAttorney) recipientMap.set(event.assignedAttorney.id, event.assignedAttorney);
    for (const staff of event.caseRef?.staff ?? []) recipientMap.set(staff.user.id, staff.user);
    if (recipientMap.size === 0) recipientMap.set(event.user.id, event.user); // no case — notify creator

    // Add covering attorneys
    for (const [coveredId, coveringId] of coverageMap) {
      if (recipientMap.has(coveredId)) {
        const coveringUser = coveringUserMap.get(coveringId);
        if (coveringUser) recipientMap.set(coveringId, coveringUser);
      }
    }

    const recipients = [...recipientMap.values()];
    const reminderKey = reminderKeyFromMinutes(reminder.minutesBefore);
    const caseLabel = event.caseRef ? `${event.caseRef.title}${event.caseRef.caseNumber ? ` (#${event.caseRef.caseNumber})` : ""}` : null;
    const days = daysRemaining(event.startTime);

    const timeUntil = reminder.minutesBefore === DAY_OF_9AM
      ? "Today"
      : reminder.minutesBefore >= 1440
        ? `${reminder.minutesBefore / 1440} day${reminder.minutesBefore / 1440 === 1 ? "" : "s"}`
        : `${reminder.minutesBefore} minutes`;

    const subject = emailType === "DISCOVERY_REMINDER"
      ? `Discovery Responses Due — ${event.caseRef?.title ?? event.title}`
      : emailType === "EVENT_REMINDER"
        ? `Reminder (${timeUntil}): ${event.title}`
        : `Deadline Approaching — ${event.title}`;

    const heading = emailType === "DISCOVERY_REMINDER"
      ? "Discovery Responses Due"
      : emailType === "EVENT_REMINDER"
        ? `Upcoming Event — ${timeUntil}`
        : "Deadline Approaching";

    const fields = emailType === "DISCOVERY_REMINDER"
      ? [
          { label: "Case", value: caseLabel },
          { label: "Discovery Type", value: event.discoveryLinked?.discoveryType?.replaceAll("_", " ") },
          { label: event.discoveryLinked?.direction === "RECEIVED" ? "Received Date" : "Served Date", value: formatDate(event.discoveryLinked?.servedOrReceivedDate) },
          { label: "Current Due Date", value: formatDate(event.discoveryLinked?.currentDueDate) },
          { label: "Extension Count", value: String(event.discoveryLinked?.extensions.length ?? 0) },
          { label: "Days Remaining", value: `${days}` },
        ]
      : emailType === "EVENT_REMINDER"
        ? [
            { label: "Case", value: caseLabel },
            { label: "Event", value: event.title },
            { label: "Date", value: formatDate(event.startTime) },
            { label: "Time Until Event", value: timeUntil },
            { label: "Location / Dept", value: event.department ?? event.location },
          ]
        : [
            { label: "Case", value: caseLabel },
            { label: "Deadline", value: event.title },
            { label: "Due Date", value: formatDate(event.startTime) },
            { label: "Days Remaining", value: `${days}` },
            { label: "Generated Source", value: event.generatedDeadline?.triggerEvent.title },
          ];

    for (const recipient of recipients) {
      const result = await sendLoggedLitCalEmail({
        userId: recipient.id,
        workspaceId: event.workspaceId,
        recipientEmail: recipient.email,
        emailType,
        relatedEntityType: emailType === "DISCOVERY_REMINDER" ? "DISCOVERY_ITEM" : "EVENT",
        relatedEntityId: event.discoveryLinked?.id ?? event.id,
        reminderKey,
        subject,
        preview: subject,
        heading,
        fields,
        actionLabel: "Open in LitCal",
        actionPath: event.caseId ? `/cases/${event.caseId}` : "/",
      });
      counts[result.status === "sent" ? "sent" : result.status === "failed" ? "failed" : "skipped"]++;
    }
  }
  return counts;
}

function isRecentDue(sendAt: Date, now: Date) {
  return sendAt <= now && sendAt.getTime() >= now.getTime() - 36 * 60 * 60 * 1000;
}

export async function sendDueTaskEmails(now = new Date()) {
  // isRecentDue() only accepts sendAt (dueDate at 9:00 UTC) within the last 36h,
  // so bound the query the same way instead of fetching every open task ever —
  // padded wider than 36h since dueDate's stored time-of-day isn't always 9:00 UTC.
  const windowStart = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);

  const tasks = await prisma.task.findMany({
    where: {
      status: { not: "DONE" },
      dueDate: { not: null, gte: windowStart, lte: windowEnd },
    },
    include: {
      caseRef: { select: { id: true, title: true, caseNumber: true, status: true, court: true } },
      eventRef: { select: { id: true, title: true, department: true } },
      generatedDeadline: { select: { ruleKey: true } },
      assignees: {
        include: {
          member: { include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } } },
        },
      },
    },
  });

  const counts = { sent: 0, skipped: 0, failed: 0 };
  for (const task of tasks) {
    if (!task.dueDate) continue;
    if (task.caseRef?.status === "CLOSED" || task.caseRef?.status === "ARCHIVED") continue;
    // All task types: day-of at 9:00 AM UTC, no weekend adjustment
    {
      const sendAt = new Date(task.dueDate);
      sendAt.setUTCHours(9, 0, 0, 0);
      const minutesBefore = DAY_OF_9AM;
      if (!isRecentDue(sendAt, now)) continue;

      const isRemote = task.title.startsWith("Request Remote Appearance");
      const isDeadlineTask = !!task.generatedDeadline;
      const emailType: EmailNotificationType = isRemote
        ? "REMOTE_APPEARANCE_REMINDER"
        : isDeadlineTask
          ? "DEADLINE_REMINDER"
          : "TASK_DUE";
      const reminderKey = reminderKeyFromMinutes(minutesBefore);
      const assignedUsers = task.assignees.map((a) => userName(a.member.user)).join(", ");
      const caseLabel = task.caseRef ? `${task.caseRef.title}${task.caseRef.caseNumber ? ` (#${task.caseRef.caseNumber})` : ""}` : null;
      const subject = isRemote
        ? `Remote Appearance Request Due — ${task.caseRef?.title ?? task.title}`
        : isDeadlineTask
          ? `Deadline Approaching — ${task.title}`
          : `Task Due — ${task.title}`;

      for (const assignee of task.assignees) {
        const user = assignee.member.user;
        const result = await sendLoggedLitCalEmail({
          userId: user.id,
          workspaceId: task.workspaceId,
          recipientEmail: user.email,
          emailType,
          relatedEntityType: "TASK",
          relatedEntityId: task.id,
          reminderKey,
          subject,
          preview: subject,
          heading: isRemote ? "Remote Appearance Request Due" : isDeadlineTask ? "Deadline Approaching" : "Task Due",
          fields: isRemote
            ? [
                { label: "Case", value: caseLabel },
                { label: "Hearing", value: task.eventRef?.title },
                { label: "Court", value: task.caseRef?.court },
                { label: "Department", value: task.eventRef?.department },
                { label: "Request Due Date", value: formatDate(task.dueDate) },
              ]
            : [
                { label: "Case", value: caseLabel },
                { label: isDeadlineTask ? "Deadline" : "Task", value: task.title },
                { label: "Due Date", value: formatDate(task.dueDate) },
                { label: "Days Remaining", value: `${daysRemaining(task.dueDate)}` },
                { label: "Priority", value: task.priority },
                { label: "Assigned Users", value: assignedUsers },
              ],
          actionLabel: "Open in LitCal",
          actionPath: `/tasks?taskId=${task.id}`,
        });
        counts[result.status === "sent" ? "sent" : result.status === "failed" ? "failed" : "skipped"]++;
      }
    }
  }
  return counts;
}
