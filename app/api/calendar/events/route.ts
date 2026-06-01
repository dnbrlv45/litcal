import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAccessToken, createGoogleEvent, createLitCalCalendar } from "@/lib/google-calendar";
import type { GoogleCalEvent } from "@/lib/google-calendar";
import { getCurrentWorkspace } from "@/lib/workspaces";

// GET /api/calendar/events?start=ISO&end=ISO
export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspace } = await getCurrentWorkspace(userId);

  const { searchParams } = new URL(request.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  if (!start || !end) return NextResponse.json({ error: "Missing start/end" }, { status: 400 });

  const timeFilter = { gte: new Date(start), lte: new Date(end) };

  const [events, connection] = await Promise.all([
    prisma.event.findMany({
      where: {
        startTime: timeFilter,
        OR: [
          { workspaceId: workspace.id },
          { userId, workspaceId: null },
        ],
      },
      include: { googleSync: true, caseRef: { select: { id: true, title: true } } },
      orderBy: { startTime: "asc" },
    }),
    prisma.userCalendarConnection.findFirst({
      where: { userId, provider: "GOOGLE", isActive: true },
    }),
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
    })),
    connected: !!connection,
  });
}

// POST /api/calendar/events  body: { title, description?, start, end, timeZone }
export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspace } = await getCurrentWorkspace(userId);

  const body = await request.json();
  const { title, description, start, end, timeZone, eventType, location, caseId } = body as {
    title: string;
    description?: string;
    start: string;
    end: string;
    timeZone: string;
    eventType?: string;
    location?: string;
    caseId?: string;
  };

  if (!title?.trim() || !start || !end)
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

  const validTypes = ["DEADLINE","HEARING","DEPOSITION","TRIAL","CONFERENCE","MEETING","REMINDER","OTHER"];
  const safeEventType = validTypes.includes(eventType ?? "") ? eventType as never : "OTHER";

  // Create the event in Supabase (source of truth)
  const event = await prisma.event.create({
    data: {
      userId,
      workspaceId: workspace.id,
      orgId: null,
      title: title.trim(),
      description: description || null,
      startTime: new Date(start),
      endTime: new Date(end),
      timeZone: timeZone ?? "UTC",
      eventType: safeEventType,
      location: location || null,
      caseId: caseId || null,
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
  });
}
