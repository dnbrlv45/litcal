import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessToken, deleteGoogleEvent } from "@/lib/google-calendar";
import { getCurrentWorkspace } from "@/lib/workspaces";

type Params = { params: Promise<{ id: string }> };

const STAFF_INCLUDE = {
  include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
} as const;

const LOCATION_INCLUDE = { select: { id: true, name: true } } as const;

// GET /api/cases/[id]
export async function GET(_req: NextRequest, { params }: Params) {
  const currentUser = await requireUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = currentUser.id;
  const { workspace } = await getCurrentWorkspace(userId);
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 403 });

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
      staff: STAFF_INCLUDE,
      countyRef: LOCATION_INCLUDE,
      courtRef:  LOCATION_INCLUDE,
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
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 403 });

  const { id } = await params;
  const body = await request.json() as {
    title?: string;
    caseNumber?: string;
    caseType?: string;
    status?: string;
    countyName?: string | null;
    courtName?: string | null;
    judge?: string;
    description?: string;
    filingDate?: string | null;
    closedDate?: string | null;
    defendant?: string;
    defenseFirm?: string;
    defenseAttorney?: string;
    // Staff changes: add/remove rows by userId + role
    staffAdd?:    { userId: string; role: "ATTORNEY" | "PARALEGAL" | "ASSISTANT" }[];
    staffRemove?: { userId: string; role: "ATTORNEY" | "PARALEGAL" | "ASSISTANT" }[];
  };

  const existing = await prisma.case.findFirst({
    where: {
      id,
      OR: [
        { workspaceId: workspace.id },
        { userId, workspaceId: null },
      ],
    },
    include: { staff: { select: { userId: true, role: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  async function resolveCountyCourt(countyName?: string | null, courtName?: string | null) {
    if (countyName === undefined) return null;
    if (!countyName) return { countyId: null, courtId: null, county: null as string | null, court: null as string | null };
    const county = await prisma.county.findFirst({ where: { name: { equals: countyName, mode: "insensitive" } } });
    if (!county) return { countyId: null, courtId: null, county: countyName, court: courtName ?? null };
    let courtId: string | null = null;
    let court: string | null = courtName ?? null;
    if (courtName) {
      const courtRow = await prisma.court.findFirst({
        where: { countyId: county.id, name: { equals: courtName, mode: "insensitive" } },
      });
      courtId = courtRow?.id ?? null;
      court = courtRow?.name ?? courtName;
    }
    return { countyId: county.id, courtId, county: county.name, court };
  }

  const validTypes = ["AUTO_ACCIDENT","SLIP_AND_FALL","GOVERNMENT_CLAIM","DOG_BITE","PREMISES_LIABILITY","MEDICAL_MALPRACTICE","WRONGFUL_DEATH","PRODUCT_LIABILITY","OTHER"];
  const validStatuses = ["ACTIVE","CLOSED","ARCHIVED","PENDING"];
  const closingStatuses = ["CLOSED", "ARCHIVED"];

  const newStatus = body.status && validStatuses.includes(body.status) ? body.status : null;
  const isClosing = newStatus && closingStatuses.includes(newStatus) && !closingStatuses.includes(existing.status);

  const countyCourt = await resolveCountyCourt(body.countyName, body.courtName);

  const updated = await prisma.case.update({
    where: { id },
    data: {
      ...(body.title !== undefined && { title: body.title.trim() }),
      ...(body.caseNumber !== undefined && { caseNumber: body.caseNumber?.trim() || null }),
      ...(body.caseType && validTypes.includes(body.caseType) && { caseType: body.caseType as never }),
      ...(newStatus && { status: newStatus as never }),
      ...(countyCourt && {
        county: countyCourt.county,
        court: countyCourt.court,
        countyId: countyCourt.countyId,
        courtId: countyCourt.courtId,
      }),
      ...(body.judge !== undefined && { judge: body.judge?.trim() || null }),
      ...(body.description !== undefined && { description: body.description?.trim() || null }),
      ...(body.filingDate !== undefined && { filingDate: body.filingDate ? new Date(body.filingDate) : null }),
      ...(body.closedDate !== undefined && { closedDate: body.closedDate ? new Date(body.closedDate) : null }),
      ...(body.defendant !== undefined && { defendant: body.defendant?.trim() || null }),
      ...(body.defenseFirm !== undefined && { defenseFirm: body.defenseFirm?.trim() || null }),
      ...(body.defenseAttorney !== undefined && { defenseAttorney: body.defenseAttorney?.trim() || null }),
    },
    include: {
      parties: true,
      _count: { select: { events: true } },
      staff: STAFF_INCLUDE,
      countyRef: LOCATION_INCLUDE,
      courtRef:  LOCATION_INCLUDE,
    },
  });

  // Apply staff changes
  const toAdd    = body.staffAdd    ?? [];
  const toRemove = body.staffRemove ?? [];

  if (toRemove.length > 0) {
    for (const { userId: uid, role } of toRemove) {
      await prisma.caseStaff.deleteMany({ where: { caseId: id, userId: uid, role: role as never } });
    }
  }

  if (toAdd.length > 0) {
    // Validate each userId is a workspace member
    const memberIds = (await prisma.workspaceMember.findMany({
      where: { workspaceId: workspace.id, userId: { in: toAdd.map((a) => a.userId) } },
      select: { userId: true },
    })).map((m) => m.userId);

    const validAdd = toAdd.filter((a) => memberIds.includes(a.userId));
    if (validAdd.length > 0) {
      await prisma.caseStaff.createMany({
        data: validAdd.map((a) => ({ caseId: id, userId: a.userId, role: a.role as never })),
        skipDuplicates: true,
      });
    }
  }

  // Send CASE_ASSIGNED notifications for newly added staff
  if (toAdd.length > 0) {
    const assignerName = [currentUser.firstName, currentUser.lastName].filter(Boolean).join(" ") || currentUser.email;
    const caseLabel = updated.caseNumber ? `#${updated.caseNumber} · ${updated.title}` : updated.title;
    const existingIds = new Set(existing.staff.map((s) => `${s.userId}:${s.role}`));

    const newAssignments = toAdd.filter((a) => !existingIds.has(`${a.userId}:${a.role}`));
    if (newAssignments.length > 0) {
      await prisma.notification.createMany({
        data: newAssignments.map(({ userId: assigneeId, role }) => ({
          userId:      assigneeId,
          workspaceId: workspace.id,
          type:        "CASE_ASSIGNED" as never,
          title:       `Case Assigned: ${updated.title}`,
          body:        `Role: ${role.charAt(0) + role.slice(1).toLowerCase()}\nAssigned by: ${assignerName}\nCase: ${caseLabel}`,
          caseId:      updated.id,
        })),
        skipDuplicates: true,
      });
    }
  }

  // Propagate first attorney to events if no attorney was previously assigned
  if (toAdd.length > 0) {
    const addedAttorneys = toAdd.filter((a) => a.role === "ATTORNEY");
    const hadAttorney = existing.staff.some((s) => s.role === "ATTORNEY");
    if (addedAttorneys.length > 0 && !hadAttorney) {
      await prisma.event.updateMany({
        where: { caseId: id },
        data: { assignedAttorneyId: addedAttorneys[0].userId },
      });
    }
  }

  // Re-fetch updated staff after mutations
  const finalStaff = await prisma.caseStaff.findMany({
    where: { caseId: id },
    include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
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

  return NextResponse.json({ case: { ...updated, staff: finalStaff } });
}

// DELETE /api/cases/[id]
export async function DELETE(_req: NextRequest, { params }: Params) {
  const currentUser = await requireUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = currentUser.id;
  const { workspace } = await getCurrentWorkspace(userId);
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 403 });

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

  await prisma.case.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
