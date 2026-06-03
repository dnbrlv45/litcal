import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspaces";

const CASE_TYPE_VALUES = ["AUTO_ACCIDENT","SLIP_AND_FALL","GOVERNMENT_CLAIM","DOG_BITE","PREMISES_LIABILITY","MEDICAL_MALPRACTICE","WRONGFUL_DEATH","PRODUCT_LIABILITY","OTHER"];

async function resolveAssignment(id: string | undefined | null, workspaceId: string): Promise<string | null> {
  if (!id) return null;
  const member = await prisma.workspaceMember.findFirst({ where: { workspaceId, userId: id } });
  return member ? id : null;
}

const ASSIGNMENT_INCLUDE = {
  select: { id: true, firstName: true, lastName: true, email: true },
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
      assignedAttorney:  ASSIGNMENT_INCLUDE,
      assignedParalegal: ASSIGNMENT_INCLUDE,
      assignedAssistant: ASSIGNMENT_INCLUDE,
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
    court?: string;
    county?: string;
    judge?: string;
    description?: string;
    filingDate?: string;
    defendant?: string;
    defenseFirm?: string;
    defenseAttorney?: string;
    assignedAttorneyId?: string;
    assignedParalegalId?: string;
    assignedAssistantId?: string;
  };

  if (!body.title?.trim())
    return NextResponse.json({ error: "Title is required" }, { status: 400 });

  const caseType = CASE_TYPE_VALUES.includes(body.caseType ?? "") ? body.caseType as never : "AUTO_ACCIDENT";

  const [attorneyId, paralegalId, assistantId] = await Promise.all([
    resolveAssignment(body.assignedAttorneyId, workspace.id),
    resolveAssignment(body.assignedParalegalId, workspace.id),
    resolveAssignment(body.assignedAssistantId, workspace.id),
  ]);

  const newCase = await prisma.case.create({
    data: {
      userId,
      workspaceId: workspace.id,
      orgId: null,
      title: body.title.trim(),
      caseNumber: body.caseNumber?.trim() || null,
      caseType,
      court: body.court?.trim() || null,
      county: body.county?.trim() || null,
      judge: body.judge?.trim() || null,
      description: body.description?.trim() || null,
      filingDate: body.filingDate ? new Date(body.filingDate) : null,
      defendant: body.defendant?.trim() || null,
      defenseFirm: body.defenseFirm?.trim() || null,
      defenseAttorney: body.defenseAttorney?.trim() || null,
      assignedAttorneyId: attorneyId,
      assignedParalegalId: paralegalId,
      assignedAssistantId: assistantId,
    },
    include: {
      parties: true,
      _count: { select: { events: true } },
      assignedAttorney:  ASSIGNMENT_INCLUDE,
      assignedParalegal: ASSIGNMENT_INCLUDE,
      assignedAssistant: ASSIGNMENT_INCLUDE,
    },
  });

  return NextResponse.json({ case: newCase }, { status: 201 });
}
