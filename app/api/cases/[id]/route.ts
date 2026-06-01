import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAccessToken, deleteGoogleEvent } from "@/lib/google-calendar";

type Params = { params: Promise<{ id: string }> };

// GET /api/cases/[id]
export async function GET(_req: NextRequest, { params }: Params) {
  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const c = await prisma.case.findFirst({
    where: orgId ? { id, orgId } : { id, userId },
    include: {
      parties: true,
      events: { orderBy: { startTime: "asc" } },
    },
  });

  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ case: c });
}

// PATCH /api/cases/[id]
export async function PATCH(request: NextRequest, { params }: Params) {
  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json() as {
    title?: string;
    caseNumber?: string;
    caseType?: string;
    status?: string;
    court?: string;
    judge?: string;
    jurisdiction?: string;
    description?: string;
    filingDate?: string | null;
    closedDate?: string | null;
  };

  const existing = await prisma.case.findFirst({
    where: orgId ? { id, orgId } : { id, userId },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const validTypes = ["CIVIL","CRIMINAL","FAMILY","BANKRUPTCY","IMMIGRATION","ADMINISTRATIVE","OTHER"];
  const validStatuses = ["ACTIVE","CLOSED","ARCHIVED","PENDING"];
  const closingStatuses = ["CLOSED", "ARCHIVED"];

  const newStatus = body.status && validStatuses.includes(body.status) ? body.status : null;
  const isClosing = newStatus && closingStatuses.includes(newStatus) && !closingStatuses.includes(existing.status);

  const updated = await prisma.case.update({
    where: { id },
    data: {
      ...(body.title !== undefined && { title: body.title.trim() }),
      ...(body.caseNumber !== undefined && { caseNumber: body.caseNumber?.trim() || null }),
      ...(body.caseType && validTypes.includes(body.caseType) && { caseType: body.caseType as never }),
      ...(newStatus && { status: newStatus as never }),
      ...(body.court !== undefined && { court: body.court?.trim() || null }),
      ...(body.judge !== undefined && { judge: body.judge?.trim() || null }),
      ...(body.jurisdiction !== undefined && { jurisdiction: body.jurisdiction?.trim() || null }),
      ...(body.description !== undefined && { description: body.description?.trim() || null }),
      ...(body.filingDate !== undefined && { filingDate: body.filingDate ? new Date(body.filingDate) : null }),
      ...(body.closedDate !== undefined && { closedDate: body.closedDate ? new Date(body.closedDate) : null }),
    },
    include: { parties: true, _count: { select: { events: true } } },
  });

  // When closing/archiving, delete all associated events from DB and Google Calendar
  if (isClosing) {
    const events = await prisma.event.findMany({
      where: { caseId: id },
      include: { googleSync: true },
    });

    if (events.length > 0) {
      const connection = await prisma.userCalendarConnection.findFirst({
        where: { userId, provider: "GOOGLE", isActive: true },
      });

      for (const ev of events) {
        if (ev.googleSync && connection) {
          try {
            const accessToken = await getAccessToken(connection.refreshToken);
            await deleteGoogleEvent(accessToken, ev.googleSync.googleCalendarId, ev.googleSync.googleEventId);
          } catch { /* mirror deletion best-effort */ }
        }
      }

      await prisma.event.deleteMany({ where: { caseId: id } });
    }
  }

  return NextResponse.json({ case: updated });
}

// DELETE /api/cases/[id]
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const existing = await prisma.case.findFirst({
    where: orgId ? { id, orgId } : { id, userId },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Delete events from Google Calendar before deleting the case
  const events = await prisma.event.findMany({
    where: { caseId: id },
    include: { googleSync: true },
  });

  if (events.length > 0) {
    const connection = await prisma.userCalendarConnection.findFirst({
      where: { userId, provider: "GOOGLE", isActive: true },
    });
    for (const ev of events) {
      if (ev.googleSync && connection) {
        try {
          const accessToken = await getAccessToken(connection.refreshToken);
          await deleteGoogleEvent(accessToken, ev.googleSync.googleCalendarId, ev.googleSync.googleEventId);
        } catch { /* best-effort */ }
      }
    }
  }

  await prisma.case.delete({ where: { id } }); // cascades to events + parties
  return NextResponse.json({ ok: true });
}
