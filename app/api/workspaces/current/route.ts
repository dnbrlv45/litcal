import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageWorkspace, getCurrentWorkspace } from "@/lib/workspaces";

export async function GET() {
  const currentUser = await requireUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = currentUser.id;

  const { workspace, membership } = await getCurrentWorkspace(userId);
  if (!workspace || !membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: workspace.id },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      },
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });
  const invitations = await prisma.workspaceInvitation.findMany({
    where: { workspaceId: workspace.id, acceptedAt: null },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ workspace, membership, members, invitations });
}

export async function DELETE() {
  const currentUser = await requireUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = currentUser.id;

  const { workspace, membership } = await getCurrentWorkspace(userId);
  if (!workspace || !membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  if (membership.role !== "OWNER") {
    return NextResponse.json({ error: "Only the owner can delete the workspace" }, { status: 403 });
  }

  const workspaceId = workspace.id;

  // Explicitly clean up before deletion to avoid FK constraint issues
  await prisma.event.updateMany({ where: { workspaceId }, data: { workspaceId: null } });
  await prisma.case.updateMany({ where: { workspaceId }, data: { workspaceId: null } });
  await prisma.workspaceInvitation.deleteMany({ where: { workspaceId } });
  await prisma.workspaceMember.deleteMany({ where: { workspaceId } });
  await prisma.workspace.delete({ where: { id: workspaceId } });

  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest) {
  const currentUser = await requireUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = currentUser.id;

  const { workspace, membership } = await getCurrentWorkspace(userId);
  if (!workspace || !membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  if (!canManageWorkspace(membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json() as { name?: string };
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "Workspace name is required" }, { status: 400 });

  const updated = await prisma.workspace.update({
    where: { id: workspace.id },
    data: { name },
  });

  return NextResponse.json({ workspace: updated });
}
