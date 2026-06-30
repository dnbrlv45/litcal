import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace, canEdit } from "@/lib/workspaces";
import { grantDiscoveryExtension } from "@/lib/discovery";

type Params = { params: Promise<{ id: string; discoveryId: string }> };

// POST /api/cases/[id]/discovery/[discoveryId]/extensions
export async function POST(req: NextRequest, { params }: Params) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspace, membership } = await getCurrentWorkspace(user.id);
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  if (!canEdit(membership?.role ?? "")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { discoveryId } = await params;

  const item = await prisma.discoveryItem.findFirst({
    where: { id: discoveryId, workspaceId: workspace.id },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json() as {
    grantedDate?: string;
    newDueDate?: string;
    mutual?: boolean;
    appliesTo?: string;
    notes?: string;
  };

  if (!body.grantedDate || !body.newDueDate) {
    return NextResponse.json({ error: "grantedDate and newDueDate required" }, { status: 400 });
  }

  const grantedDate = new Date(body.grantedDate);
  const newDueDate  = new Date(body.newDueDate);

  if (isNaN(grantedDate.getTime()) || isNaN(newDueDate.getTime())) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }
  if (newDueDate <= item.currentDueDate) {
    return NextResponse.json({ error: "New due date must be after current due date" }, { status: 400 });
  }

  const mutual = body.mutual ?? false;
  // Mutual → both deadlines; non-mutual → derived from the item's own direction (not from the client).
  const appliesTo = mutual
    ? "BOTH"
    : (item.direction === "SERVED" ? "OPPOSING_DEADLINE" : "OUR_DEADLINE") as "OUR_DEADLINE" | "OPPOSING_DEADLINE" | "BOTH";

  const extensionNumber = await grantDiscoveryExtension({
    discoveryItemId: discoveryId,
    grantedDate,
    newDueDate,
    mutual,
    appliesTo,
    notes: body.notes ?? null,
    createdBy: user.id,
  });

  const updated = await prisma.discoveryItem.findUnique({
    where: { id: discoveryId },
    include: { extensions: { orderBy: { extensionNumber: "asc" } } },
  });

  return NextResponse.json({ item: updated, extensionNumber }, { status: 201 });
}
