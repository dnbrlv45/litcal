import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendDueTaskEmails, sendEventReminderEmails } from "@/lib/email-notifications";
import { DAY_OF_9AM } from "@/lib/reminders";

export async function GET(request: NextRequest) {
  const configuredSecret = process.env.CRON_SECRET;
  if (configuredSecret) {
    const url = new URL(request.url);
    const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const providedSecret = url.searchParams.get("secret") ?? bearer;
    if (providedSecret !== configuredSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();

  // Find all unsent reminders whose sendAt has passed
  const due = await prisma.eventReminder.findMany({
    where: { sent: false, sendAt: { lte: now } },
    include: {
      event: {
        select: {
          id: true,
          title: true,
          startTime: true,
          eventType: true,
          caseId: true,
          userId: true,
          workspaceId: true,
          caseRef: {
            select: {
              id: true, title: true, caseNumber: true,
              staff: { select: { userId: true } },
            },
          },
          assignedAttorney: { select: { id: true } },
        },
      },
    },
  });

  if (due.length === 0) {
    const taskEmails = await sendDueTaskEmails(now);
    return NextResponse.json({ sent: 0, notifications: 0, emails: { event: { sent: 0, skipped: 0, failed: 0 }, task: taskEmails } });
  }

  // Build notification rows — one per reminder per recipient
  type NotifRow = {
    userId: string;
    workspaceId: string;
    type: "EVENT_REMINDER";
    title: string;
    body: string | null;
    eventId: string;
    caseId: string | null;
  };

  const rows: NotifRow[] = [];

  for (const reminder of due) {
    const ev = reminder.event;
    if (!ev.workspaceId) continue;

    const minutesBefore = reminder.minutesBefore;
    const timeLabel =
      minutesBefore === DAY_OF_9AM ? "Today" :
      minutesBefore >= 1440        ? `${minutesBefore / 1440}d` :
      minutesBefore >= 60          ? `${minutesBefore / 60}h` :
                                     `${minutesBefore}m`;

    const title = `Reminder: ${ev.title} in ${timeLabel}`;
    const dateStr = ev.startTime.toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit",
    });
    const body = [
      `Date: ${dateStr}`,
      ev.caseRef ? `Case: ${ev.caseRef.caseNumber ? `#${ev.caseRef.caseNumber} · ` : ""}${ev.caseRef.title}` : null,
    ].filter(Boolean).join("\n");

    // Collect all unique recipients: event owner, event attorney, case staff
    const recipientIds = new Set<string>([ev.userId]);
    if (ev.assignedAttorney) recipientIds.add(ev.assignedAttorney.id);
    for (const s of ev.caseRef?.staff ?? []) recipientIds.add(s.userId);

    for (const userId of recipientIds) {
      rows.push({
        userId,
        workspaceId: ev.workspaceId,
        type:        "EVENT_REMINDER",
        title,
        body,
        eventId: ev.id,
        caseId:  ev.caseId ?? null,
      });
    }
  }

  if (rows.length > 0) {
    await prisma.notification.createMany({ data: rows, skipDuplicates: true });
  }

  const eventEmails = await sendEventReminderEmails(due.map((r) => r.id));
  const taskEmails = await sendDueTaskEmails(now);

  // Mark reminders sent
  await prisma.eventReminder.updateMany({
    where: { id: { in: due.map((r) => r.id) } },
    data: { sent: true },
  });

  return NextResponse.json({
    sent: due.length,
    notifications: rows.length,
    emails: { event: eventEmails, task: taskEmails },
  });
}
