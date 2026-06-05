import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Vercel Cron calls this with a secret header to prevent public invocation.
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
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
          caseRef: { select: { id: true, title: true, caseNumber: true } },
          assignedAttorney: { select: { id: true } },
        },
      },
    },
  });

  if (due.length === 0) {
    return NextResponse.json({ sent: 0 });
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
      minutesBefore >= 43200 ? `${minutesBefore / 1440}d` :
      minutesBefore >= 1440  ? `${minutesBefore / 1440}d` :
      minutesBefore >= 60    ? `${minutesBefore / 60}h`   :
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

    // Notify the event owner
    rows.push({
      userId:      ev.userId,
      workspaceId: ev.workspaceId,
      type:        "EVENT_REMINDER",
      title,
      body,
      eventId: ev.id,
      caseId:  ev.caseId ?? null,
    });

    // Also notify the assigned attorney if different from owner
    if (ev.assignedAttorney && ev.assignedAttorney.id !== ev.userId) {
      rows.push({
        userId:      ev.assignedAttorney.id,
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

  // Mark reminders sent
  await prisma.eventReminder.updateMany({
    where: { id: { in: due.map((r) => r.id) } },
    data: { sent: true },
  });

  return NextResponse.json({ sent: due.length, notifications: rows.length });
}
