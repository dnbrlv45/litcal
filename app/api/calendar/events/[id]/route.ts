import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessToken, deleteGoogleEvent } from "@/lib/google-calendar";
import { getCurrentWorkspace } from "@/lib/workspaces";
import { detectConflicts } from "@/lib/conflicts";
import { cascadeDeadlineDateChange } from "@/lib/deadline-rules";

// DELETE /api/calendar/events/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await requireUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = currentUser.id;
  const { workspace } = await getCurrentWorkspace(userId);
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 403 });

  const { id } = await params;

  // Fetch event with its Google sync record before deleting
  const event = await prisma.event.findFirst({
    where: {
      id,
      OR: [
        { workspaceId: workspace.id },
        { userId, workspaceId: null },
      ],
    },
    include: { googleSync: true },
  });

  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // Delete from Supabase — cascades to GoogleCalendarSync automatically
  await prisma.event.delete({ where: { id } });

  // Mirror deletion to Google Calendar
  if (event.googleSync) {
    const connection = await prisma.userCalendarConnection.findFirst({
      where: { userId, provider: "GOOGLE", isActive: true },
    });
    if (connection) {
      try {
        const accessToken = await getAccessToken(connection.refreshToken);
        await deleteGoogleEvent(
          accessToken,
          event.googleSync.googleCalendarId,
          event.googleSync.googleEventId
        );
      } catch (err) {
        console.error("Google Calendar delete failed:", err);
      }
    }
  }

  return NextResponse.json({ ok: true });
}

// PATCH /api/calendar/events/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await requireUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = currentUser.id;
  const { workspace } = await getCurrentWorkspace(userId);
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 403 });

  const { id } = await params;

  const body = await request.json() as {
    title?: string;
    description?: string;
    start?: string;
    end?: string;
    eventType?: string;
    location?: string;
    department?: string;
    caseId?: string | null;
    allDay?: boolean;
  };

  const event = await prisma.event.findFirst({
    where: {
      id,
      OR: [
        { workspaceId: workspace.id },
        { userId, workspaceId: null },
      ],
    },
  });
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const validTypes = ["DEADLINE","HEARING","DEPOSITION","TRIAL","CONFERENCE","MEETING","MEDIATION","COURT_CALL","CASE_MANAGEMENT_CONFERENCE","REMINDER","OTHER"];
  const safeEventType = body.eventType && validTypes.includes(body.eventType) ? body.eventType as never : undefined;

  // Detect if this is a user edit of an auto-generated event — mark userModified
  const isDateChanging = body.start !== undefined && new Date(body.start).getTime() !== event.startTime.getTime();
  if (isDateChanging) {
    await prisma.generatedDeadline.updateMany({
      where: { generatedEventId: id },
      data: { userModified: true },
    });
  }

  const updated = await prisma.event.update({
    where: { id },
    data: {
      ...(body.title !== undefined && { title: body.title.trim() }),
      ...(body.description !== undefined && { description: body.description || null }),
      ...(body.start !== undefined && { startTime: new Date(body.start) }),
      ...(body.end !== undefined && { endTime: new Date(body.end) }),
      ...(safeEventType !== undefined && { eventType: safeEventType }),
      ...(body.location !== undefined && { location: body.location || null }),
      ...(body.department !== undefined && { department: body.department.trim() || null }),
      ...("caseId" in body && { caseId: body.caseId || null }),
      ...(body.allDay !== undefined && { allDay: body.allDay }),
    },
    include: { assignedAttorney: { select: { id: true } } },
  });

  // If this is a trigger event and its start date changed, cascade to unmodified generated deadlines
  const newStart = updated.startTime;
  const newEnd = updated.endTime;
  let skippedModified = 0;
  if (isDateChanging) {
    const cascade = await cascadeDeadlineDateChange(id, newStart);
    skippedModified = cascade.skippedModified;
  }

  // Check conflicts against the saved state (non-blocking)
  const conflicts = updated.assignedAttorney
    ? await detectConflicts(updated.assignedAttorney.id, newStart, newEnd, id)
    : [];

  return NextResponse.json({
    event: {
      id: updated.id,
      title: updated.title,
      description: updated.description,
      start: updated.startTime.toISOString(),
      end: updated.endTime.toISOString(),
      allDay: updated.allDay,
      eventType: updated.eventType,
      location: updated.location,
      department: updated.department,
    },
    skippedModified,
    conflicts: conflicts.map((c) => ({
      eventId: c.eventId,
      title: c.title,
      startTime: c.startTime.toISOString(),
      endTime: c.endTime.toISOString(),
      attorneyName: c.attorneyName,
    })),
  });
}
