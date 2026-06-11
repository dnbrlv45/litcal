import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspaces";
import { createDiscoveryItem, calcDiscoveryDueDate } from "@/lib/discovery";
import type { DiscoveryDirection } from "@prisma/client";

type Params = { params: Promise<{ id: string }> };

const VALID_DIRECTIONS: DiscoveryDirection[] = ["RECEIVED", "SERVED"];

// GET /api/cases/[id]/discovery
export async function GET(_req: NextRequest, { params }: Params) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspace } = await getCurrentWorkspace(user.id);
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 403 });

  const { id: caseId } = await params;

  const caseRow = await prisma.case.findFirst({
    where: { id: caseId, OR: [{ workspaceId: workspace.id }, { userId: user.id, workspaceId: null }] },
  });
  if (!caseRow) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const items = await prisma.discoveryItem.findMany({
    where: { caseId },
    include: { extensions: { orderBy: { extensionNumber: "asc" } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ items });
}

// POST /api/cases/[id]/discovery
export async function POST(req: NextRequest, { params }: Params) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspace } = await getCurrentWorkspace(user.id);
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 403 });

  const { id: caseId } = await params;

  const caseRow = await prisma.case.findFirst({
    where: { id: caseId, OR: [{ workspaceId: workspace.id }, { userId: user.id, workspaceId: null }] },
  });
  if (!caseRow) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json() as {
    direction?: string;
    servedOrReceivedDate?: string;
    overrideDueDate?: string;
    notes?: string;
  };

  if (!body.direction || !VALID_DIRECTIONS.includes(body.direction as DiscoveryDirection)) {
    return NextResponse.json({ error: "Invalid direction" }, { status: 400 });
  }
  if (!body.servedOrReceivedDate && !body.overrideDueDate) {
    return NextResponse.json({ error: "servedOrReceivedDate or overrideDueDate required" }, { status: 400 });
  }

  const servedOrReceivedDate = body.servedOrReceivedDate ? new Date(body.servedOrReceivedDate) : undefined;
  const overrideDueDate = body.overrideDueDate ? new Date(body.overrideDueDate) : undefined;

  if (servedOrReceivedDate && isNaN(servedOrReceivedDate.getTime())) {
    return NextResponse.json({ error: "Invalid servedOrReceivedDate" }, { status: 400 });
  }
  if (overrideDueDate && isNaN(overrideDueDate.getTime())) {
    return NextResponse.json({ error: "Invalid overrideDueDate" }, { status: 400 });
  }

  const item = await createDiscoveryItem({
    caseId,
    workspaceId: workspace.id,
    createdBy: user.id,
    direction: body.direction as DiscoveryDirection,
    servedOrReceivedDate,
    overrideDueDate,
    notes: body.notes ?? null,
  });

  const full = await prisma.discoveryItem.findUnique({
    where: { id: item.id },
    include: { extensions: { orderBy: { extensionNumber: "asc" } } },
  });

  return NextResponse.json({ item: full }, { status: 201 });
}

export { calcDiscoveryDueDate };
