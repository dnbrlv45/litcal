import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessToken, deleteGoogleEvent } from "@/lib/google-calendar";
import { getCurrentWorkspace } from "@/lib/workspaces";

type Params = { params: Promise<{ id: string }> };

// GET /api/cases/[id]
export async function GET(_req: NextRequest, { params }: Params) {
  const currentUser = await requireUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = currentUser.id;
  const { workspace } = await getCurrentWorkspace(userId);

  const { id } = await params;

  const c = await prisma.case.findFirst({
    where: {
      id,
      OR: [
        { workspaceId: workspace.id },
        { userId, workspaceId: null },
      ],
    },
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
  const currentUser = await requireUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = currentUser.id;
  const { workspace } = await getCurrentWorkspace(userId);

  const { id } = await params;
  const body = await request.json() as {
    title?: string;
    caseNumber?: string;
    caseType?: string;
    status?: string;
    court?: string;
    county?: string;
    judge?: string;
    description?: string;
    filingDate?: string | null;
    closedDate?: string | null;
    defendant?: string;
    defenseFirm?: string;
    defenseAttorney?: string;
  };

  const existing = await prisma.case.findFirst({
    where: {
      id,
      OR: [
        { workspaceId: workspace.id },
        { userId, workspaceId: null },
      ],
    },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const validTypes = ["AUTO_ACCIDENT","SLIP_AND_FALL","GOVERNMENT_CLAIM","DOG_BITE","PREMISES_LIABILITY","MEDICAL_MALPRACTICE","WRONGFUL_DEATH","PRODUCT_LIABILITY","OTHER"];
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
      ...(body.county !== undefined && { county: body.county?.trim() || null }),
      ...(body.judge !== undefined && { judge: body.judge?.trim() || null }),
      ...(body.description !== undefined && { description: body.description?.trim() || null }),
      ...(body.filingDate !== undefined && { filingDate: body.filingDate ? new Date(body.filingDate) : null }),
      ...(body.closedDate !== undefined && { closedDate: body.closedDate ? new Date(body.closedDate) : null }),
      ...(body.defendant !== undefined && { defendant: body.defendant?.trim() || null }),
      ...(body.defenseFirm !== undefined && { defenseFirm: body.defenseFirm?.trim() || null }),
      ...(body.defenseAttorney !== undefined && { defenseAttorney: body.defenseAttorney?.trim() || null }),
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
  const currentUser = await requireUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = currentUser.id;
  const { workspace } = await getCurrentWorkspace(userId);

  const { id } = await params;

  const existing = await prisma.case.findFirst({
    where: {
      id,
      OR: [
        { workspaceId: workspace.id },
        { userId, workspaceId: null },
      ],
    },
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
