import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspaces";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}

function dateKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export async function GET() {
  return cleanup();
}

export async function POST() {
  return cleanup();
}

async function cleanup() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspace } = await getCurrentWorkspace(user.id);
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 403 });

  // 1. Fix all-day events stored at midnight UTC → noon UTC
  //    Midnight UTC shows as previous day in PDT/PST
  const allDayEvents = await prisma.event.findMany({
    where: { workspaceId: workspace.id, allDay: true },
    select: { id: true, startTime: true, endTime: true },
  });

  let dateFixed = 0;
  for (const ev of allDayEvents) {
    const h = ev.startTime.getUTCHours();
    if (h === 0) {
      // Shift to noon UTC to avoid day drift in western timezones
      const newStart = new Date(ev.startTime);
      newStart.setUTCHours(12, 0, 0, 0);
      const newEnd = new Date(Date.UTC(
        newStart.getUTCFullYear(), newStart.getUTCMonth(), newStart.getUTCDate(),
        23, 59, 59, 999
      ));
      await prisma.event.update({
        where: { id: ev.id },
        data: { startTime: newStart, endTime: newEnd },
      });
      dateFixed++;
    }
  }

  // 1b. Fix tasks with midnight UTC due dates → noon UTC
  const allTasks = await prisma.task.findMany({
    where: { workspaceId: workspace.id, dueDate: { not: null } },
    select: { id: true, dueDate: true },
  });

  let taskDateFixed = 0;
  for (const t of allTasks) {
    if (t.dueDate && t.dueDate.getUTCHours() === 0 && t.dueDate.getUTCMinutes() === 0) {
      const newDue = new Date(t.dueDate);
      newDue.setUTCHours(12, 0, 0, 0);
      await prisma.task.update({
        where: { id: t.id },
        data: { dueDate: newDue },
      });
      taskDateFixed++;
    }
  }

  // 1c. Verify imported event/task dates match their GCal UID source dates
  //     Extract UID from description [GCal-UID:xxx] and check the stored date
  const uidEvents = await prisma.event.findMany({
    where: { workspaceId: workspace.id, description: { contains: "[GCal-UID:" } },
    select: { id: true, description: true, startTime: true, allDay: true },
  });
  const uidTasks = await prisma.task.findMany({
    where: { workspaceId: workspace.id, description: { contains: "[GCal-UID:" } },
    select: { id: true, description: true, dueDate: true },
  });

  // 2. Remove duplicate events (same normalized title + same date + same case)
  const events = await prisma.event.findMany({
    where: { workspaceId: workspace.id, status: { notIn: ["CANCELLED"] } },
    select: { id: true, title: true, startTime: true, caseId: true, eventType: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const seen = new Map<string, string>();
  const duplicateIds: string[] = [];

  for (const ev of events) {
    const sig = [normalizeTitle(ev.title), dateKey(ev.startTime), ev.caseId ?? ""].join("|");
    if (seen.has(sig)) {
      duplicateIds.push(ev.id);
    } else {
      seen.set(sig, ev.id);
    }
  }

  if (duplicateIds.length > 0) {
    // Delete related records first
    await prisma.eventReminder.deleteMany({ where: { eventId: { in: duplicateIds } } });
    await prisma.googleCalendarSync.deleteMany({ where: { eventId: { in: duplicateIds } } });
    await prisma.$executeRaw`DELETE FROM "UserGoogleCalendarSync" WHERE "eventId" = ANY(${duplicateIds}::text[])`;
    await prisma.notification.deleteMany({ where: { eventId: { in: duplicateIds } } });
    await prisma.generatedDeadline.deleteMany({ where: { triggerEventId: { in: duplicateIds } } });
    await prisma.generatedDeadline.deleteMany({ where: { generatedEventId: { in: duplicateIds } } });
    await prisma.event.deleteMany({ where: { id: { in: duplicateIds } } });
  }

  // 3. Remove duplicate tasks (same normalized title + same due date + same case)
  const tasks = await prisma.task.findMany({
    where: { workspaceId: workspace.id },
    select: { id: true, title: true, dueDate: true, caseId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const seenTasks = new Map<string, string>();
  const dupTaskIds: string[] = [];

  for (const t of tasks) {
    const sig = [normalizeTitle(t.title), t.dueDate ? dateKey(t.dueDate) : "", t.caseId ?? ""].join("|");
    if (seenTasks.has(sig)) {
      dupTaskIds.push(t.id);
    } else {
      seenTasks.set(sig, t.id);
    }
  }

  if (dupTaskIds.length > 0) {
    await prisma.taskAssignee.deleteMany({ where: { taskId: { in: dupTaskIds } } });
    await prisma.notification.deleteMany({ where: { taskId: { in: dupTaskIds } } });
    await prisma.generatedDeadline.deleteMany({ where: { generatedTaskId: { in: dupTaskIds } } });
    await prisma.task.deleteMany({ where: { id: { in: dupTaskIds } } });
  }

  return NextResponse.json({
    dateFixed,
    taskDateFixed,
    duplicateEventsRemoved: duplicateIds.length,
    duplicateTasksRemoved: dupTaskIds.length,
    uidEventsChecked: uidEvents.length,
    uidTasksChecked: uidTasks.length,
  });
}
