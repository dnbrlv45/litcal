import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessToken, createGoogleEvent, createLitCalCalendar } from "@/lib/google-calendar";
import { buildGoogleEventPayload, getGoogleColorId } from "@/lib/google-calendar-payload";
import { getCurrentWorkspace } from "@/lib/workspaces";

export async function POST() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspace } = await getCurrentWorkspace(user.id);
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 403 });

  const connection = await prisma.userCalendarConnection.findFirst({
    where: { userId: user.id, provider: "GOOGLE", isActive: true },
  });
  if (!connection) return NextResponse.json({ error: "Google Calendar not connected" }, { status: 400 });

  const accessToken = await getAccessToken(connection.refreshToken);

  // Resolve/recreate LitCal calendar
  let litCalId = connection.providerCalendarId;
  if (litCalId) {
    const check = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(litCalId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!check.ok) litCalId = null;
  }
  if (!litCalId) {
    litCalId = await createLitCalCalendar(accessToken);
    await prisma.userCalendarConnection.update({
      where: { id: connection.id },
      data: { providerCalendarId: litCalId },
    });
  }

  // Find all events not yet synced to Google
  const events = await prisma.event.findMany({
    where: {
      OR: [
        { workspaceId: workspace.id },
        { userId: user.id, workspaceId: null },
      ],
      googleSync: null,
    },
    include: {
      caseRef: { select: { title: true, caseNumber: true, county: true, court: true } },
      assignedAttorney: { select: { firstName: true, lastName: true } },
    },
  });

  let synced = 0;
  let failed = 0;

  for (const event of events) {
    try {
      const isInPerson = event.inPerson ?? false;
      const payload = buildGoogleEventPayload({
        title: event.title,
        eventType: event.eventType,
        subtype: event.subtype ?? undefined,
        subtypeReason: event.subtypeReason ?? undefined,
        description: event.description ?? undefined,
        location: event.location ?? undefined,
        department: event.department ?? undefined,
        inPerson: isInPerson,
        caseName: event.caseRef?.title ?? null,
        caseNumber: event.caseRef?.caseNumber ?? null,
        countyName: event.caseRef?.county ?? null,
        courtName: event.caseRef?.court ?? null,
        appearanceType: event.appearanceType ?? undefined,
        remoteLink: event.remoteLink ?? undefined,
        phoneNumber: event.phoneNumber ?? undefined,
        bridge: event.bridge ?? undefined,
        password: event.remotePassword ?? undefined,
        requestRequired: event.requestRequired ?? null,
        requestTaskCreated: false,
        attorneyName: event.assignedAttorney
          ? [event.assignedAttorney.firstName, event.assignedAttorney.lastName].filter(Boolean).join(" ")
          : undefined,
      });

      const timeZone = "America/Los_Angeles";
      const startField = event.allDay
        ? event.startTime.toISOString().slice(0, 10)
        : event.startTime.toISOString();
      const endField = event.allDay
        ? event.endTime.toISOString().slice(0, 10)
        : event.endTime.toISOString();

      const gEvent = await createGoogleEvent(
        accessToken,
        {
          summary: payload.summary,
          description: payload.description,
          location: payload.location,
          colorId: payload.colorId ?? getGoogleColorId(event.eventType),
          start: startField,
          end: endField,
          allDay: event.allDay,
          timeZone,
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
      synced++;
    } catch (err) {
      console.error(`Backfill failed for event ${event.id}:`, err);
      failed++;
    }
  }

  return NextResponse.json({ synced, failed, total: events.length });
}
