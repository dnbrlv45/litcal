import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspaces";
import { grantDiscoveryExtension } from "@/lib/discovery";
import type { ExtensionAppliesTo } from "@prisma/client";

type Params = { params: Promise<{ id: string; discoveryId: string }> };

const VALID_APPLIES_TO: ExtensionAppliesTo[] = ["OUR_DEADLINE", "OPPOSING_DEADLINE", "BOTH"];

// POST /api/cases/[id]/discovery/[discoveryId]/extensions
export async function POST(req: NextRequest, { params }: Params) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspace } = await getCurrentWorkspace(user.id);
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 403 });

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
  if (!body.appliesTo || !VALID_APPLIES_TO.includes(body.appliesTo as ExtensionAppliesTo)) {
    return NextResponse.json({ error: "Invalid appliesTo" }, { status: 400 });
  }

  const grantedDate = new Date(body.grantedDate);
  const newDueDate  = new Date(body.newDueDate);

  if (isNaN(grantedDate.getTime()) || isNaN(newDueDate.getTime())) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }
  if (newDueDate <= item.currentDueDate) {
    return NextResponse.json({ error: "New due date must be after current due date" }, { status: 400 });
  }

  const extensionNumber = await grantDiscoveryExtension({
    discoveryItemId: discoveryId,
    grantedDate,
    newDueDate,
    mutual: body.mutual ?? false,
    appliesTo: body.appliesTo as ExtensionAppliesTo,
    notes: body.notes ?? null,
    createdBy: user.id,
  });

  const updated = await prisma.discoveryItem.findUnique({
    where: { id: discoveryId },
    include: { extensions: { orderBy: { extensionNumber: "asc" } } },
  });

  return NextResponse.json({ item: updated, extensionNumber }, { status: 201 });
}
