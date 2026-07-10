import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessToken, deleteGoogleEvent, patchGoogleEvent, GoogleReauthRequiredError } from "@/lib/google-calendar";
import { buildGoogleEventPayload, eventSupportsRemoteAppearance } from "@/lib/google-calendar-payload";
import { addTimelineEntry } from "@/lib/case-timeline";
import { canDelete, canEdit, getCurrentWorkspace } from "@/lib/workspaces";
import { detectConflicts } from "@/lib/conflicts";
import { cascadeDeadlineDateChange } from "@/lib/deadline-rules";
import { replaceEventReminders } from "@/lib/reminders";
import { allDayDateToNoonUTCISOString, googleAllDayExclusiveEndDate } from "@/lib/all-day-dates";

// GET /api/calendar/events/[id] — single event, same shape as the list/search endpoint
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await requireUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = currentUser.id;
  const { workspace } = await getCurrentWorkspace(userId);
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 403 });

  const { id } = await params;

  const event = await prisma.event.findFirst({
    where: {
      id,
      OR: [
        { workspaceId: workspace.id },
        { userId, workspaceId: null },
      ],
    },
    include: {
      caseRef: { select: { id: true, title: true, status: true, county: true, court: true, caseNumber: true } },
      assignedAttorney: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const supportsRemoteAppearance = eventSupportsRemoteAppearance(event.eventType);
  const conflicts = event.assignedAttorney
    ? await detectConflicts(event.assignedAttorney.id, event.startTime, event.endTime, event.id, event.caseId)
    : [];

  return NextResponse.json({
    event: {
      id: event.id,
      title: event.title,
      description: event.description,
      start: event.startTime.toISOString(),
      end: event.endTime.toISOString(),
      allDay: event.allDay,
      eventType: event.eventType,
      subtype: event.subtype,
      subtypeReason: event.subtypeReason,
      location: event.location,
      department: event.department,
      caseId: event.caseId,
      caseTitle: event.caseRef?.title ?? null,
      caseNumber: event.caseRef?.caseNumber ?? null,
      caseStatus: event.caseRef?.status ?? null,
      assignedAttorneyId: event.assignedAttorney?.id ?? null,
      assignedAttorneyName: event.assignedAttorney
        ? [event.assignedAttorney.firstName, event.assignedAttorney.lastName].filter(Boolean).join(" ") || null
        : null,
      hasConflict: conflicts.length > 0,
      conflicts: conflicts.map((c) => ({
        eventId: c.eventId,
        title: c.title,
        startTime: c.startTime.toISOString(),
        endTime: c.endTime.toISOString(),
        attorneyName: c.attorneyName,
      })),
      caseCounty: event.caseRef?.county ?? null,
      caseCourt: event.caseRef?.court ?? null,
      inPerson: event.inPerson,
      appearanceType: supportsRemoteAppearance ? event.appearanceType : null,
      remoteLink: supportsRemoteAppearance ? event.remoteLink : null,
      phoneNumber: supportsRemoteAppearance ? event.phoneNumber : null,
      bridge: supportsRemoteAppearance ? event.bridge : null,
      remotePassword: supportsRemoteAppearance ? event.remotePassword : null,
      requestRequired: supportsRemoteAppearance ? event.requestRequired : null,
      requestContactEmail: supportsRemoteAppearance ? event.requestContactEmail : null,
      requestNotes: supportsRemoteAppearance ? event.requestNotes : null,
    },
  });
}

// DELETE /api/calendar/events/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await requireUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = currentUser.id;
  const { workspace, membership } = await getCurrentWorkspace(userId);
  if (!workspace || !membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  if (!canDelete(membership.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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

  // Gather ALL Google sync info BEFORE deleting (cascade will remove these rows)
  const googleSyncInfo = event.googleSync;
  const userSync = await prisma.$queryRaw<Array<{ googleEventId: string; googleCalendarId: string }>>`
    SELECT "googleEventId", "googleCalendarId" FROM "UserGoogleCalendarSync"
    WHERE "eventId" = ${id} AND "userId" = ${userId} AND "googleCalendarId" != 'ics-import'
    LIMIT 1
  `.then((rows) => rows[0] ?? null);

  // Prefer UserGoogleCalendarSync (has real IDs from sync-all), fall back to GoogleCalendarSync
  const syncToDelete = userSync ?? googleSyncInfo;

  // Delete from Supabase — cascades to GoogleCalendarSync, UserGoogleCalendarSync, etc.
  await prisma.event.delete({ where: { id } });

  if (event.caseId && workspace) {
    void addTimelineEntry({
      caseId: event.caseId,
      workspaceId: workspace.id,
      actorUserId: userId,
      type: "event.deleted",
      title: `Event removed: ${event.title}`,
      metadata: { eventType: event.eventType },
    });
  }

  // Mirror deletion to Google Calendar
  if (syncToDelete) {
    const connection = await prisma.userCalendarConnection.findFirst({
      where: { userId, provider: "GOOGLE", isActive: true },
    });
    if (connection) {
      try {
        const accessToken = await getAccessToken(connection.refreshToken);
        await deleteGoogleEvent(
          accessToken,
          syncToDelete.googleCalendarId,
          syncToDelete.googleEventId
        );
      } catch (err) {
        if (err instanceof GoogleReauthRequiredError) {
          await prisma.userCalendarConnection.update({ where: { id: connection.id }, data: { isActive: false } });
        }
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
  const { workspace, membership } = await getCurrentWorkspace(userId);
  if (!workspace || !membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  if (!canEdit(membership.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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
  const effectiveAllDay = body.allDay ?? event.allDay;
  const normalizedStart = body.start !== undefined
    ? effectiveAllDay ? new Date(allDayDateToNoonUTCISOString(body.start.slice(0, 10))) : new Date(body.start)
    : undefined;
  let normalizedEnd = body.end !== undefined
    ? effectiveAllDay ? new Date(allDayDateToNoonUTCISOString(body.end.slice(0, 10))) : new Date(body.end)
    : undefined;

  if (
    effectiveAllDay &&
    normalizedStart &&
    normalizedEnd &&
    normalizedStart.getTime() !== normalizedEnd.getTime() &&
    new Date(body.end!).getTime() - new Date(body.start!).getTime() < 24 * 60 * 60 * 1000
  ) {
    normalizedEnd = normalizedStart;
  }

  // Detect if this is a user edit of an auto-generated event — mark userModified
  const isDateChanging = normalizedStart !== undefined && normalizedStart.getTime() !== event.startTime.getTime();
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
      ...(normalizedStart !== undefined && { startTime: normalizedStart }),
      ...(normalizedEnd !== undefined && { endTime: normalizedEnd }),
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
  if (isDateChanging || safeEventType !== undefined) {
    await replaceEventReminders(prisma, id, newStart, updated.eventType);
  }
  if (isDateChanging) {
    const cascade = await cascadeDeadlineDateChange(id, newStart);
    skippedModified = cascade.skippedModified;
    await prisma.discoveryItem.updateMany({
      where: { linkedEventId: id },
      data: { currentDueDate: newStart },
    });
  }

  // Check conflicts against the saved state (non-blocking)
  const conflicts = updated.assignedAttorney
    ? await detectConflicts(updated.assignedAttorney.id, newStart, newEnd, id, updated.caseId)
    : [];

  // Timeline: event edited
  if (updated.caseId && workspace) {
    void addTimelineEntry({
      caseId: updated.caseId,
      workspaceId: workspace.id,
      actorUserId: userId,
      type: "event.edited",
      title: `Event updated: ${updated.title}`,
      metadata: { eventId: id },
    });
  }

  // Mirror edits to Google Calendar
  if (updated.googleSync) {
    let editConnectionId: string | null = null;
    try {
      const connection = await prisma.userCalendarConnection.findFirst({
        where: { userId, provider: "GOOGLE", isActive: true },
        select: { id: true, refreshToken: true },
      });
      if (connection) {
        editConnectionId = connection.id;
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
          const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
          await patchGoogleEvent(
            accessToken,
            updated.googleSync.googleCalendarId,
            updated.googleSync.googleEventId,
            {
              summary: googlePayload.summary,
              description: googlePayload.description,
              location: googlePayload.location,
              colorId: googlePayload.colorId,
              ...(isDateChanging && {
                start: updated.allDay
                  ? { date: newStart.toISOString().slice(0, 10) }
                  : { dateTime: newStart.toISOString(), timeZone },
                end: updated.allDay
                  ? { date: googleAllDayExclusiveEndDate(newEnd) }
                  : { dateTime: newEnd.toISOString(), timeZone },
              }),
            }
          );
          if (updated.caseId && workspace) {
            void addTimelineEntry({
              caseId: updated.caseId,
              workspaceId: workspace.id,
              actorUserId: null,
              type: "event.google_synced",
              title: "Google Calendar event updated",
              metadata: { eventId: id },
            });
          }
        }
      }
    } catch (err) {
      if (err instanceof GoogleReauthRequiredError && editConnectionId) {
        await prisma.userCalendarConnection.update({ where: { id: editConnectionId }, data: { isActive: false } });
      }
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
