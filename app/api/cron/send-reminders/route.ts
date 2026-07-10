import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendDueTaskEmails, sendEventReminderEmails } from "@/lib/email-notifications";
import { DAY_OF_9AM, dayOf9AMReminderSendAt } from "@/lib/reminders";
import { isAuthorizedCron } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const deliverable = [];
  const deferred: Array<{ id: string; sendAt: Date }> = [];
  for (const reminder of due) {
    if (reminder.minutesBefore === DAY_OF_9AM) {
      const intendedSendAt = dayOf9AMReminderSendAt(reminder.event.startTime);
      if (now < intendedSendAt) {
        deferred.push({ id: reminder.id, sendAt: intendedSendAt });
        continue;
      }
    }
    deliverable.push(reminder);
  }

  await Promise.all(deferred.map((reminder) =>
    prisma.eventReminder.update({
      where: { id: reminder.id },
      data: { sendAt: reminder.sendAt },
    })
  ));

  if (deliverable.length === 0) {
    const taskEmails = await sendDueTaskEmails(now);
    return NextResponse.json({ sent: 0, deferred: deferred.length, notifications: 0, emails: { event: { sent: 0, skipped: 0, failed: 0 }, task: taskEmails } });
  }

  // Load active coverage assignments for all affected workspaces
  const workspaceIds = [...new Set(deliverable.map((r) => r.event.workspaceId).filter(Boolean) as string[])];
  const coverageAssignments = await prisma.coverageAssignment.findMany({
    where: {
      workspaceId: { in: workspaceIds },
      startDate: { lte: now },
      endDate: { gte: now },
    },
    select: { coveredUserId: true, coveringUserId: true },
  });
  // Map coveredUserId -> coveringUserId for quick lookup
  const coverageMap = new Map<string, string>();
  for (const a of coverageAssignments) coverageMap.set(a.coveredUserId, a.coveringUserId);

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

  for (const reminder of deliverable) {
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

    // Recipients: case staff + assigned attorney only.
    // Do NOT include ev.userId (event creator) — admins create events but shouldn't get notifications.
    // Fall back to creator only when there is no case (personal/uncategorized events).
    const recipientIds = new Set<string>();
    if (ev.assignedAttorney) recipientIds.add(ev.assignedAttorney.id);
    for (const s of ev.caseRef?.staff ?? []) recipientIds.add(s.userId);
    if (recipientIds.size === 0) recipientIds.add(ev.userId); // no case — notify creator

    // Add covering attorneys for any covered recipient
    for (const userId of [...recipientIds]) {
      const covering = coverageMap.get(userId);
      if (covering) recipientIds.add(covering);
    }

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

  const eventEmails = await sendEventReminderEmails(deliverable.map((r) => r.id), coverageMap);
  const taskEmails = await sendDueTaskEmails(now);

  // Mark reminders sent
  await prisma.eventReminder.updateMany({
    where: { id: { in: deliverable.map((r) => r.id) } },
    data: { sent: true },
  });

  return NextResponse.json({
    sent: deliverable.length,
    deferred: deferred.length,
    notifications: rows.length,
    emails: { event: eventEmails, task: taskEmails },
  });
}
