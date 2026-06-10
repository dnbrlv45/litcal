import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessToken, deleteGoogleEvent, patchGoogleEvent } from "@/lib/google-calendar";
import { buildGoogleEventPayload } from "@/lib/google-calendar-payload";
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

  // If this is a trigger event (Trial/CMC), delete all generated deadlines it spawned
  const generatedDeadlines = await prisma.generatedDeadline.findMany({
    where: { triggerEventId: id },
    select: { generatedEventId: true, generatedTaskId: true },
  });
  const generatedEventIds = generatedDeadlines
    .map((d) => d.generatedEventId)
    .filter(Boolean) as string[];
  const generatedTaskIds = generatedDeadlines
    .map((d) => d.generatedTaskId)
    .filter(Boolean) as string[];
  if (generatedEventIds.length > 0) {
    await prisma.event.deleteMany({ where: { id: { in: generatedEventIds } } });
  }
  if (generatedTaskIds.length > 0) {
    await prisma.task.deleteMany({ where: { id: { in: generatedTaskIds } } });
  }

  // Delete from Supabase — cascades to GoogleCalendarSync and GeneratedDeadline rows
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
    subtype?: string | null;
    subtypeReason?: string | null;
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
      ...("subtype" in body && { subtype: body.subtype?.trim() || null }),
      ...("subtypeReason" in body && { subtypeReason: body.subtypeReason?.trim() || null }),
      ...(body.location !== undefined && { location: body.location || null }),
      ...(body.department !== undefined && { department: body.department.trim() || null }),
      ...("caseId" in body && { caseId: body.caseId || null }),
      ...(body.allDay !== undefined && { allDay: body.allDay }),
    },
    include: {
      assignedAttorney: { select: { id: true, firstName: true, lastName: true } },
      googleSync: true,
      caseRef: { select: { title: true, caseNumber: true, county: true, court: true } },
    },
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

  // Mirror edits to Google Calendar
  if (updated.googleSync) {
    try {
      const connection = await prisma.userCalendarConnection.findFirst({
        where: { userId, provider: "GOOGLE", isActive: true },
        select: { refreshToken: true },
      });
      if (connection) {
        const fullEvent = await prisma.event.findUnique({
          where: { id },
          select: {
            title: true, description: true, location: true, department: true,
            eventType: true, subtype: true, subtypeReason: true, inPerson: true,
            appearanceType: true, remoteLink: true, phoneNumber: true, bridge: true,
            remotePassword: true, requestRequired: true,
          },
        });
        if (fullEvent) {
          const accessToken = await getAccessToken(connection.refreshToken);
          const googlePayload = buildGoogleEventPayload({
            title: fullEvent.title,
            eventType: fullEvent.eventType,
            subtype: fullEvent.subtype,
            subtypeReason: fullEvent.subtypeReason,
            description: fullEvent.description,
            location: fullEvent.location,
            department: fullEvent.department,
            inPerson: fullEvent.inPerson,
            caseName: updated.caseRef?.title ?? null,
            caseNumber: updated.caseRef?.caseNumber ?? null,
            countyName: updated.caseRef?.county ?? null,
            courtName: updated.caseRef?.court ?? null,
            appearanceType: fullEvent.appearanceType,
            remoteLink: fullEvent.remoteLink,
            phoneNumber: fullEvent.phoneNumber,
            bridge: fullEvent.bridge,
            password: fullEvent.remotePassword,
            requestRequired: fullEvent.requestRequired,
            attorneyName: updated.assignedAttorney
              ? [updated.assignedAttorney.firstName, updated.assignedAttorney.lastName].filter(Boolean).join(" ") || null
              : null,
          });
          await patchGoogleEvent(
            accessToken,
            updated.googleSync.googleCalendarId,
            updated.googleSync.googleEventId,
            {
              summary: googlePayload.summary,
              description: googlePayload.description,
              location: googlePayload.location,
              colorId: googlePayload.colorId,
            }
          );
        }
      }
    } catch (err) {
      console.error("Google Calendar patch failed on event edit:", err);
    }
  }

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
