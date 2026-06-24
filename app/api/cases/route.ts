import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspaces";
import { addTimelineEntry } from "@/lib/case-timeline";

const CASE_TYPE_VALUES = ["AUTO_ACCIDENT","SLIP_AND_FALL","GOVERNMENT_CLAIM","DOG_BITE","PREMISES_LIABILITY","MEDICAL_MALPRACTICE","WRONGFUL_DEATH","PRODUCT_LIABILITY","OTHER"];

async function resolveCountyCourt(countyName?: string | null, courtName?: string | null) {
  if (!countyName) return { countyId: null, courtId: null, county: null, court: null };
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

async function resolveStaffIds(ids: string[], workspaceId: string): Promise<string[]> {
  if (!ids.length) return [];
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId, userId: { in: ids } },
    select: { userId: true },
  });
  return members.map((m) => m.userId);
}

const STAFF_INCLUDE = {
  include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
} as const;

// GET /api/cases
export async function GET() {
  const currentUser = await requireUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = currentUser.id;
  const { workspace } = await getCurrentWorkspace(userId);
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 403 });

  const cases = await prisma.case.findMany({
    where: {
      OR: [
        { workspaceId: workspace.id },
        { userId, workspaceId: null },
      ],
    },
    include: {
      parties: true,
      _count: { select: { events: true } },
      staff: STAFF_INCLUDE,
      countyRef: { select: { id: true, name: true } },
      courtRef:  { select: { id: true, name: true } },
    },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });

  return NextResponse.json({ cases });
}

// POST /api/cases
export async function POST(request: NextRequest) {
  const currentUser = await requireUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = currentUser.id;
  const { workspace } = await getCurrentWorkspace(userId);
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 403 });

  const body = await request.json() as {
    title: string;
    caseNumber?: string;
    caseType?: string;
    countyName?: string | null;
    courtName?: string | null;
    judge?: string;
    description?: string;
    filingDate?: string;
    dateOfLoss?: string | null;
    plaintiff?: string;
    defendant?: string;
    defenseFirm?: string;
    defenseAttorney?: string;
    attorneys?: string[];
    paralegals?: string[];
    assistants?: string[];
  };

  if (!body.title?.trim())
    return NextResponse.json({ error: "Title is required" }, { status: 400 });

  const caseType = CASE_TYPE_VALUES.includes(body.caseType ?? "") ? body.caseType as never : "AUTO_ACCIDENT";

  const [attorneyIds, paralegalIds, assistantIds, countyCourt] = await Promise.all([
    resolveStaffIds(body.attorneys ?? [], workspace.id),
    resolveStaffIds(body.paralegals ?? [], workspace.id),
    resolveStaffIds(body.assistants ?? [], workspace.id),
    resolveCountyCourt(body.countyName, body.courtName),
  ]);

  const staffRows = [
    ...attorneyIds.map((uid) => ({ id: `cs_${uid}_atty`, userId: uid, role: "ATTORNEY" as const })),
    ...paralegalIds.map((uid) => ({ id: `cs_${uid}_para`, userId: uid, role: "PARALEGAL" as const })),
    ...assistantIds.map((uid) => ({ id: `cs_${uid}_asst`, userId: uid, role: "ASSISTANT" as const })),
  ];

  const newCase = await prisma.case.create({
    data: {
      userId,
      workspaceId: workspace.id,
      orgId: null,
      title: body.title.trim(),
      caseNumber: body.caseNumber?.trim() || null,
      caseType,
      county: countyCourt.county,
      court: countyCourt.court,
      countyId: countyCourt.countyId,
      courtId: countyCourt.courtId,
      judge: body.judge?.trim() || null,
      description: body.description?.trim() || null,
      filingDate: body.filingDate ? new Date(body.filingDate) : null,
      dateOfLoss: body.dateOfLoss ? new Date(body.dateOfLoss) : null,
      defendant: body.defendant?.trim() || null,
      defenseFirm: body.defenseFirm?.trim() || null,
      defenseAttorney: body.defenseAttorney?.trim() || null,
      staff: staffRows.length > 0 ? { create: staffRows.map(({ id: _id, ...r }) => r) } : undefined,
      parties: body.plaintiff?.trim()
        ? {
            create: body.plaintiff.split(";").map((n) => n.trim()).filter(Boolean).map((name) => ({
              name,
              role: "PLAINTIFF" as const,
            })),
          }
        : undefined,
    } as Prisma.CaseUncheckedCreateInput,
    include: {
      parties: true,
      _count: { select: { events: true } },
      staff: STAFF_INCLUDE,
      countyRef: { select: { id: true, name: true } },
      courtRef:  { select: { id: true, name: true } },
    },
  });

  void addTimelineEntry({
    caseId: newCase.id,
    workspaceId: workspace.id,
    actorUserId: userId,
    type: "case.created",
    title: "Case created",
    description: newCase.caseNumber ? `Case #${newCase.caseNumber}` : undefined,
  });

  return NextResponse.json({ case: newCase }, { status: 201 });
}
