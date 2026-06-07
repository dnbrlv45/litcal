import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessToken, createGoogleEvent, createLitCalCalendar } from "@/lib/google-calendar";
import type { GoogleCalEvent } from "@/lib/google-calendar";
import { computeReminders, googleReminderOverrides } from "@/lib/reminders";
import { getCurrentWorkspace } from "@/lib/workspaces";
import { detectConflicts, getConflictedEventIds } from "@/lib/conflicts";
import { applyDeadlineRules } from "@/lib/deadline-rules";

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
      department: e.department,
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
  const { title, description, start, end, timeZone, eventType, location, department, caseId, allDay } = body as {
    title: string;
    description?: string;
    start: string;
    end: string;
    timeZone: string;
    eventType?: string;
    location?: string;
    department?: string;
    caseId?: string;
    allDay?: boolean;
  };

  if (!title?.trim() || !start || !end)
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

  let inheritedAttorneyId: string | null = null;
  if (caseId) {
    const linkedCase = await prisma.case.findUnique({
      where: { id: caseId },
      select: {
        status: true,
        staff: { where: { role: "ATTORNEY" }, select: { userId: true }, orderBy: { createdAt: "asc" }, take: 1 },
      },
    });
    if (!linkedCase) return NextResponse.json({ error: "Case not found" }, { status: 404 });
    if (linkedCase.status === "ARCHIVED" || linkedCase.status === "CLOSED")
      return NextResponse.json({ error: "Cannot add events to an archived or closed case" }, { status: 422 });
    inheritedAttorneyId = linkedCase.staff[0]?.userId ?? null;
  }

  const validTypes = ["DEADLINE","HEARING","DEPOSITION","TRIAL","CONFERENCE","MEETING","MEDIATION","COURT_CALL","CASE_MANAGEMENT_CONFERENCE","REMINDER","OTHER"];
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
      department: department?.trim() || null,
      caseId: caseId || null,
      assignedAttorneyId: inheritedAttorneyId,
    },
  });

  // Store reminder schedule
  const reminderRows = computeReminders(startDate, safeEventType as string);
  if (reminderRows.length > 0) {
    await prisma.eventReminder.createMany({
      data: reminderRows.map((r) => ({
        eventId: event.id,
        minutesBefore: r.minutesBefore,
        sendAt: r.sendAt,
      })),
    });
  }

  // Apply deadline automation rules (idempotent, handles CMC + Trial + future rules)
  const deadlineResult = await applyDeadlineRules({
    id: event.id,
    eventType: safeEventType as string,
    startTime: startDate,
    caseId: caseId || null,
    userId,
    workspaceId: workspace.id,
    assignedAttorneyId: inheritedAttorneyId,
    timeZone: timeZone ?? "UTC",
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

      const reminderOverrides = googleReminderOverrides(safeEventType as string);
      const googleDescription = [
        event.department ? `Department: ${event.department}` : null,
        event.description,
      ].filter(Boolean).join("\n\n") || undefined;
      const gEvent: GoogleCalEvent = await createGoogleEvent(
        accessToken,
        {
          summary: event.title,
          description: googleDescription,
          start,
          end,
          timeZone: timeZone ?? "UTC",
          reminderOverrides,
        },
        litCalId
      );
      await prisma.googleCalendarSync.create({
        data: {
          eventId: event.id,
          googleEventId: gEvent.id,
          googleCalendarId: litCalId,
          syncStatus: "SYNCED",
        },
      });

      // Push any generated deadline events to Google Calendar too
      if (deadlineResult.createdEventIds.length > 0) {
        const generatedEvents = await prisma.event.findMany({
          where: { id: { in: deadlineResult.createdEventIds } },
        });
        for (const ge of generatedEvents) {
          try {
            const dayStr = ge.startTime.toISOString().slice(0, 10);
            const ggEvent: GoogleCalEvent = await createGoogleEvent(
              accessToken,
              {
                summary: ge.title,
                description: ge.description ?? undefined,
                start: dayStr,
                end: dayStr,
                timeZone: timeZone ?? "UTC",
                reminderOverrides: [{ method: "popup", minutes: 1440 }],
              },
              litCalId
            );
            await prisma.googleCalendarSync.create({
              data: {
                eventId: ge.id,
                googleEventId: ggEvent.id,
                googleCalendarId: litCalId,
                syncStatus: "SYNCED",
              },
            });
          } catch (err) {
            console.error(`Google push failed for generated event ${ge.id}:`, err);
          }
        }
      }

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
      department: event.department,
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
