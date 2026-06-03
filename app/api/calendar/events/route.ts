import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessToken, createGoogleEvent, createLitCalCalendar } from "@/lib/google-calendar";
import type { GoogleCalEvent } from "@/lib/google-calendar";
import { getCurrentWorkspace } from "@/lib/workspaces";
import { detectConflicts, getConflictedEventIds } from "@/lib/conflicts";

// GET /api/calendar/events?start=ISO&end=ISO
export async function GET(request: NextRequest) {
  const currentUser = await requireUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = currentUser.id;
  const { workspace } = await getCurrentWorkspace(userId);
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  if (!start || !end) return NextResponse.json({ error: "Missing start/end" }, { status: 400 });

  const timeFilter = { gte: new Date(start), lte: new Date(end) };

  const [events, connection, conflictedIds] = await Promise.all([
    prisma.event.findMany({
      where: {
        startTime: timeFilter,
        OR: [
          { workspaceId: workspace.id },
          { userId, workspaceId: null },
        ],
      },
      include: {
        googleSync: true,
        caseRef: { select: { id: true, title: true, status: true } },
        assignedAttorney: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { startTime: "asc" },
    }),
    prisma.userCalendarConnection.findFirst({
      where: { userId, provider: "GOOGLE", isActive: true },
    }),
    getConflictedEventIds(workspace.id),
  ]);

  return NextResponse.json({
    events: events.map((e: (typeof events)[number]) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      start: e.startTime.toISOString(),
      end: e.endTime.toISOString(),
      allDay: e.allDay,
      eventType: e.eventType,
      location: e.location,
      caseId: e.caseId,
      caseTitle: e.caseRef?.title ?? null,
      caseStatus: e.caseRef?.status ?? null,
      assignedAttorneyId: e.assignedAttorney?.id ?? null,
      assignedAttorneyName: e.assignedAttorney
        ? [e.assignedAttorney.firstName, e.assignedAttorney.lastName].filter(Boolean).join(" ") || null
        : null,
      hasConflict: conflictedIds.has(e.id),
    })),
    connected: !!connection,
  });
}

// POST /api/calendar/events  body: { title, description?, start, end, timeZone }
export async function POST(request: NextRequest) {
  const currentUser = await requireUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = currentUser.id;
  const { workspace } = await getCurrentWorkspace(userId);
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 403 });

  const body = await request.json();
  const { title, description, start, end, timeZone, eventType, location, caseId, allDay } = body as {
    title: string;
    description?: string;
    start: string;
    end: string;
    timeZone: string;
    eventType?: string;
    location?: string;
    caseId?: string;
    allDay?: boolean;
  };

  if (!title?.trim() || !start || !end)
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

  let inheritedAttorneyId: string | null = null;
  if (caseId) {
    const linkedCase = await prisma.case.findUnique({ where: { id: caseId }, select: { status: true, assignedAttorneyId: true } });
    if (!linkedCase) return NextResponse.json({ error: "Case not found" }, { status: 404 });
    if (linkedCase.status === "ARCHIVED" || linkedCase.status === "CLOSED")
      return NextResponse.json({ error: "Cannot add events to an archived or closed case" }, { status: 422 });
    inheritedAttorneyId = linkedCase.assignedAttorneyId;
  }

  const validTypes = ["DEADLINE","HEARING","DEPOSITION","TRIAL","CONFERENCE","MEETING","MEDIATION","REMINDER","OTHER"];
  const safeEventType = validTypes.includes(eventType ?? "") ? eventType as never : "OTHER";

  // Check conflicts before creating (non-blocking)
  const startDate = new Date(start);
  const endDate = new Date(end);
  const preConflicts = inheritedAttorneyId
    ? await detectConflicts(inheritedAttorneyId, startDate, endDate)
    : [];

  // Create the event in Supabase (source of truth)
  const event = await prisma.event.create({
    data: {
      userId,
      workspaceId: workspace.id,
      orgId: null,
      title: title.trim(),
      description: description || null,
      startTime: startDate,
      endTime: endDate,
      timeZone: timeZone ?? "UTC",
      allDay: allDay ?? false,
      eventType: safeEventType,
      location: location || null,
      caseId: caseId || null,
      assignedAttorneyId: inheritedAttorneyId,
    },
  });

  // Push to Google Calendar if connected
  let googlePush: { ok: boolean; error?: string | null } = { ok: false, error: "Google not connected" };

  const connection = await prisma.userCalendarConnection.findFirst({
    where: { userId, provider: "GOOGLE", isActive: true },
  });

  if (connection) {
    try {
      const accessToken = await getAccessToken(connection.refreshToken);

      // Resolve the dedicated LitCal calendar, creating it once if needed
      let litCalId = connection.providerCalendarId;
      if (!litCalId) {
        litCalId = await createLitCalCalendar(accessToken);
        await prisma.userCalendarConnection.update({
          where: { id: connection.id },
          data: { providerCalendarId: litCalId },
        });
      }

      const gEvent: GoogleCalEvent = await createGoogleEvent(
        accessToken,
        { summary: event.title, description: event.description ?? undefined, start, end, timeZone: timeZone ?? "UTC" },
        litCalId
      );

      // Store sync record
      await prisma.googleCalendarSync.create({
        data: {
          eventId: event.id,
          googleEventId: gEvent.id,
          googleCalendarId: litCalId,
          syncStatus: "SYNCED",
        },
      });

      googlePush = { ok: true };
    } catch (err) {
      console.error("Google Calendar push failed (event saved to DB):", err);
      googlePush = { ok: false, error: String(err) };
    }
  }

  return NextResponse.json({
    event: {
      id: event.id,
      title: event.title,
      description: event.description,
      start: event.startTime.toISOString(),
      end: event.endTime.toISOString(),
      allDay: event.allDay,
      eventType: event.eventType,
      location: event.location,
      caseId: event.caseId,
    },
    googlePush,
    conflicts: preConflicts.map((c) => ({
      eventId: c.eventId,
      title: c.title,
      startTime: c.startTime.toISOString(),
      endTime: c.endTime.toISOString(),
      attorneyName: c.attorneyName,
    })),
  });
}
