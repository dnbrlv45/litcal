import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspaces";
import { computeReminders } from "@/lib/reminders";

export const runtime = "nodejs";

type ImportEvent = {
  uid: string;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  allDay: boolean;
  eventType: string;
  subtype: string | null;
  department: string | null;
  location: string | null;
  caseId: string | null;
  importAs?: "event" | "task";
};

const VALID_EVENT_TYPES = new Set([
  "DEADLINE", "HEARING", "DEPOSITION", "TRIAL", "CONFERENCE",
  "MEETING", "MEDIATION", "COURT_CALL", "CASE_MANAGEMENT_CONFERENCE",
  "REMINDER", "OTHER",
]);

function uidFromDescription(description: string | null | undefined): string | null {
  return description?.match(/\[GCal-UID:(.+?)\]/)?.[1] ?? null;
}

function shouldImportAsTask(ev: ImportEvent): boolean {
  if (ev.importAs) return ev.importAs === "task";
  const title = ev.title.trim();
  return (
    ev.subtype === "File CMS" ||
    ev.subtype === "Request Remote Appearance" ||
    ev.subtype === "Mediation Brief" ||
    ev.subtype === "FSC Documents" ||
    /^Follow Up\b/i.test(title)
  );
}

function taskPriority(ev: ImportEvent): "MEDIUM" | "HIGH" | "URGENT" {
  if (ev.subtype === "Request Remote Appearance") return "URGENT";
  if (ev.subtype === "File CMS" || ev.subtype === "Mediation Brief" || ev.subtype === "FSC Documents") return "HIGH";
  return "MEDIUM";
}

async function caseStaffMemberIds(workspaceId: string, caseId: string | null): Promise<string[]> {
  if (!caseId) return [];
  const staff = await prisma.caseStaff.findMany({
    where: { caseId, role: { in: ["ATTORNEY", "PARALEGAL"] } },
    select: { userId: true },
    orderBy: { createdAt: "asc" },
  });
  const userIds = [...new Set(staff.map((s) => s.userId))];
  if (userIds.length === 0) return [];
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId, userId: { in: userIds } },
    select: { id: true },
  });
  return members.map((m) => m.id);
}

export async function POST(request: NextRequest) {
  const currentUser = await requireUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspace } = await getCurrentWorkspace(currentUser.id);
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 403 });

  const body = await request.json() as { events?: ImportEvent[] };
  const events = body.events ?? [];
  if (!events.length) return NextResponse.json({ error: "No events to import." }, { status: 400 });
  if (events.length > 2000) return NextResponse.json({ error: "Import is limited to 2000 events at a time." }, { status: 400 });

  const failed: { title: string; error: string }[] = [];
  let createdEventCount = 0;
  let createdTaskCount = 0;
  let skippedDuplicates = 0;
  let createdCount = 0;

  const existingEvents = await prisma.event.findMany({
    where: { workspaceId: workspace.id, description: { contains: "[GCal-UID:" } },
    select: { description: true },
  });
  const existingTasks = await prisma.task.findMany({
    where: { workspaceId: workspace.id, description: { contains: "[GCal-UID:" } },
    select: { description: true },
  });
  const existingUids = new Set<string>();
  for (const row of [...existingEvents, ...existingTasks]) {
    const uid = uidFromDescription(row.description);
    if (uid) existingUids.add(uid);
  }

  for (const ev of events) {
    try {
      const uid = uidFromDescription(ev.description);
      if (uid && existingUids.has(uid)) {
        skippedDuplicates++;
        continue;
      }

      const caseId = ev.caseId || null;
      if (caseId) {
        const caseExists = await prisma.case.findFirst({
          where: { id: caseId, workspaceId: workspace.id, status: { notIn: ["ARCHIVED", "CLOSED"] } },
          select: { id: true },
        });
        if (!caseExists) throw new Error("Matched case is missing, archived, closed, or outside this workspace.");
      }

      if (shouldImportAsTask(ev)) {
        const assigneeIds = await caseStaffMemberIds(workspace.id, caseId);
        await prisma.task.create({
          data: {
            workspaceId: workspace.id,
            title: ev.title.trim(),
            description: ev.description || null,
            status: "TODO" as never,
            priority: taskPriority(ev) as never,
            dueDate: new Date(ev.startTime),
            caseId,
            assignees: assigneeIds.length > 0
              ? { create: assigneeIds.map((memberId) => ({ memberId })) }
              : undefined,
          },
        });
        createdTaskCount++;
      } else {
        const safeType = VALID_EVENT_TYPES.has(ev.eventType) ? ev.eventType : "OTHER";
        const linkedCase = caseId
          ? await prisma.case.findUnique({
              where: { id: caseId },
              select: {
                staff: {
                  where: { role: "ATTORNEY" },
                  select: { userId: true },
                  orderBy: { createdAt: "asc" },
                  take: 1,
                },
              },
            })
          : null;
        const event = await prisma.event.create({
            data: {
              userId: currentUser.id,
              workspaceId: workspace.id,
              title: ev.title.trim(),
              description: ev.description || null,
              startTime: new Date(ev.startTime),
              endTime: new Date(ev.endTime),
              timeZone: "America/Los_Angeles",
              allDay: ev.allDay,
              caseId,
              assignedAttorneyId: linkedCase?.staff[0]?.userId ?? null,
              eventType: safeType as never,
              subtype: ev.subtype || null,
              department: ev.department || null,
              location: ev.location || null,
              status: "SCHEDULED" as never,
            },
          });
        const reminders = computeReminders(event.startTime, event.eventType);
        if (reminders.length > 0) {
          await prisma.eventReminder.createMany({
            data: reminders.map((reminder) => ({
              eventId: event.id,
              minutesBefore: reminder.minutesBefore,
              sendAt: reminder.sendAt,
            })),
          });
        }
        createdEventCount++;
      }
      if (uid) existingUids.add(uid);
      createdCount++;
    } catch (err) {
      failed.push({
        title: ev.title,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({
    createdCount,
    createdEventCount,
    createdTaskCount,
    skippedDuplicates,
    failedCount: failed.length,
    failed,
  });
}
