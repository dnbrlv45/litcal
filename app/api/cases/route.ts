import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspaces";

// GET /api/cases
export async function GET() {
  const currentUser = await requireUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = currentUser.id;
  const { workspace } = await getCurrentWorkspace(userId);

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

  const body = await request.json() as {
    title: string;
    caseNumber?: string;
    caseType?: string;
    court?: string;
    judge?: string;
    jurisdiction?: string;
    description?: string;
    filingDate?: string;
  };

  if (!body.title?.trim())
    return NextResponse.json({ error: "Title is required" }, { status: 400 });

  const validTypes = ["CIVIL","CRIMINAL","FAMILY","BANKRUPTCY","IMMIGRATION","ADMINISTRATIVE","OTHER"];
  const caseType = validTypes.includes(body.caseType ?? "") ? body.caseType as never : "CIVIL";

  const newCase = await prisma.case.create({
    data: {
      userId,
      workspaceId: workspace.id,
      orgId: null,
      title: body.title.trim(),
      caseNumber: body.caseNumber?.trim() || null,
      caseType,
      court: body.court?.trim() || null,
      judge: body.judge?.trim() || null,
      jurisdiction: body.jurisdiction?.trim() || null,
      description: body.description?.trim() || null,
      filingDate: body.filingDate ? new Date(body.filingDate) : null,
    },
    include: { parties: true, _count: { select: { events: true } } },
  });

  return NextResponse.json({ case: newCase }, { status: 201 });
}
