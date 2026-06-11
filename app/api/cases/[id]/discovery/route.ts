import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspaces";
import { createDiscoveryItem, calcDiscoveryDueDate } from "@/lib/discovery";
import type { DiscoveryType, DiscoveryDirection } from "@prisma/client";

type Params = { params: Promise<{ id: string }> };

const VALID_TYPES: DiscoveryType[] = [
  "FORM_INTERROGATORIES", "SPECIAL_INTERROGATORIES", "REQUESTS_FOR_PRODUCTION",
  "REQUESTS_FOR_ADMISSION", "SUPPLEMENTAL_FORM_INTERROGATORIES",
  "SUPPLEMENTAL_SPECIAL_INTERROGATORIES", "SUPPLEMENTAL_REQUESTS_FOR_PRODUCTION",
  "SUPPLEMENTAL_REQUESTS_FOR_ADMISSION", "DEPOSITION_NOTICE", "OTHER",
];
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
    include: {
      extensions: { orderBy: { extensionNumber: "asc" } },
    },
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
    discoveryType?: string;
    direction?: string;
    servedOrReceivedDate?: string;
    notes?: string;
  };

  if (!body.discoveryType || !VALID_TYPES.includes(body.discoveryType as DiscoveryType)) {
    return NextResponse.json({ error: "Invalid discoveryType" }, { status: 400 });
  }
  if (!body.direction || !VALID_DIRECTIONS.includes(body.direction as DiscoveryDirection)) {
    return NextResponse.json({ error: "Invalid direction" }, { status: 400 });
  }
  if (!body.servedOrReceivedDate) {
    return NextResponse.json({ error: "servedOrReceivedDate required" }, { status: 400 });
  }

  const servedOrReceivedDate = new Date(body.servedOrReceivedDate);
  if (isNaN(servedOrReceivedDate.getTime())) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const item = await createDiscoveryItem({
    caseId,
    workspaceId: workspace.id,
    createdBy: user.id,
    discoveryType: body.discoveryType as DiscoveryType,
    direction: body.direction as DiscoveryDirection,
    servedOrReceivedDate,
    notes: body.notes ?? null,
  });

  // Return item with extensions and preview dueDate for the client
  const full = await prisma.discoveryItem.findUnique({
    where: { id: item.id },
    include: { extensions: { orderBy: { extensionNumber: "asc" } } },
  });

  return NextResponse.json({ item: full }, { status: 201 });
}

// Exported for use in the deadline dashboard query
export { calcDiscoveryDueDate };
