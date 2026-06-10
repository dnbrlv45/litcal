import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspaces";

// GET /api/cases/[id]/timeline
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await requireUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspace } = await getCurrentWorkspace(currentUser.id);
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 403 });

  const { id: caseId } = await params;

  // Verify the case belongs to this workspace
  const c = await prisma.case.findFirst({
    where: {
      id: caseId,
      OR: [
        { workspaceId: workspace.id },
        { userId: currentUser.id, workspaceId: null },
      ],
    },
    select: { id: true },
  });
  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const entries = await prisma.caseTimeline.findMany({
    where: { caseId },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      type: true,
      title: true,
      description: true,
      metadata: true,
      createdAt: true,
      actor: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });

  return NextResponse.json({ entries });
}
