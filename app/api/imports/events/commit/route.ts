import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspaces";

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
};

const VALID_EVENT_TYPES = new Set([
  "DEADLINE", "HEARING", "DEPOSITION", "TRIAL", "CONFERENCE",
  "MEETING", "MEDIATION", "COURT_CALL", "CASE_MANAGEMENT_CONFERENCE",
  "REMINDER", "OTHER",
]);

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
  let createdCount = 0;
  const BATCH_SIZE = 20;

  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    const batch = events.slice(i, i + BATCH_SIZE);
    try {
      await prisma.$transaction(
        batch.map((ev) => {
          const safeType = VALID_EVENT_TYPES.has(ev.eventType) ? ev.eventType : "OTHER";
          return prisma.event.create({
            data: {
              userId: currentUser.id,
              workspaceId: workspace.id,
              title: ev.title.trim(),
              description: ev.description || null,
              startTime: new Date(ev.startTime),
              endTime: new Date(ev.endTime),
              timeZone: "America/Los_Angeles",
              allDay: ev.allDay,
              caseId: ev.caseId || null,
              eventType: safeType as never,
              subtype: ev.subtype || null,
              department: ev.department || null,
              location: ev.location || null,
              status: "SCHEDULED" as never,
            },
          });
        }),
      );
      createdCount += batch.length;
    } catch (err) {
      // If batch fails, try individually
      for (const ev of batch) {
        try {
          const safeType = VALID_EVENT_TYPES.has(ev.eventType) ? ev.eventType : "OTHER";
          await prisma.event.create({
            data: {
              userId: currentUser.id,
              workspaceId: workspace.id,
              title: ev.title.trim(),
              description: ev.description || null,
              startTime: new Date(ev.startTime),
              endTime: new Date(ev.endTime),
              timeZone: "America/Los_Angeles",
              allDay: ev.allDay,
              caseId: ev.caseId || null,
              eventType: safeType as never,
              subtype: ev.subtype || null,
              department: ev.department || null,
              location: ev.location || null,
              status: "SCHEDULED" as never,
            },
          });
          createdCount++;
        } catch (innerErr) {
          failed.push({
            title: ev.title,
            error: innerErr instanceof Error ? innerErr.message : "Unknown error",
          });
        }
      }
    }
  }

  return NextResponse.json({
    createdCount,
    failedCount: failed.length,
    failed,
  });
}
