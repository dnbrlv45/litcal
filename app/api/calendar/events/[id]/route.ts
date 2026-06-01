import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAccessToken, deleteGoogleEvent } from "@/lib/google-calendar";

// DELETE /api/calendar/events/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Fetch event with its Google sync record before deleting
  const event = await prisma.event.findFirst({
    where: { id, userId },
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
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json() as {
    title?: string;
    description?: string;
    start?: string;
    end?: string;
    eventType?: string;
    location?: string;
  };

  const event = await prisma.event.findFirst({ where: { id, userId } });
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const validTypes = ["DEADLINE","HEARING","DEPOSITION","TRIAL","CONFERENCE","MEETING","REMINDER","OTHER"];
  const safeEventType = body.eventType && validTypes.includes(body.eventType) ? body.eventType as never : undefined;

  const updated = await prisma.event.update({
    where: { id },
    data: {
      ...(body.title !== undefined && { title: body.title.trim() }),
      ...(body.description !== undefined && { description: body.description || null }),
      ...(body.start !== undefined && { startTime: new Date(body.start) }),
      ...(body.end !== undefined && { endTime: new Date(body.end) }),
      ...(safeEventType !== undefined && { eventType: safeEventType }),
      ...(body.location !== undefined && { location: body.location || null }),
    },
  });

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
    },
  });
}
