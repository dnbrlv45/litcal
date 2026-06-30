import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageWorkspace, getCurrentWorkspace } from "@/lib/workspaces";

type Params = { params: Promise<{ id: string }> };

const VALID_TITLES = ["ATTORNEY", "PARALEGAL", "ASSISTANT", "STAFF", null] as const;

export async function PATCH(request: NextRequest, { params }: Params) {
  const currentUser = await requireUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = currentUser.id;

  const { workspace, membership } = await getCurrentWorkspace(userId);
  if (!workspace || !membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  if (!canManageWorkspace(membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json() as { jobTitle?: string | null; role?: string };

  const target = await prisma.workspaceMember.findFirst({ where: { id, workspaceId: workspace.id } });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const jobTitle = (VALID_TITLES as readonly (string | null)[]).includes(body.jobTitle ?? null)
    ? (body.jobTitle as never ?? null)
    : null;

  const data: Record<string, unknown> = { jobTitle };

  if (body.role !== undefined) {
    if (membership.role !== "OWNER") {
      return NextResponse.json({ error: "Only the owner can change roles" }, { status: 403 });
    }
    if (target.role === "OWNER") {
      return NextResponse.json({ error: "Cannot change the owner's role" }, { status: 422 });
    }
    const validRoles = ["ADMIN", "MEMBER", "VIEWER"];
    if (validRoles.includes(body.role)) {
      data.role = body.role;
    }
  }

  const updated = await prisma.workspaceMember.update({
    where: { id },
    data,
    include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
  });

  return NextResponse.json({ member: updated });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const currentUser = await requireUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = currentUser.id;

  const { workspace, membership } = await getCurrentWorkspace(userId);
  if (!workspace || !membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  if (!canManageWorkspace(membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const target = await prisma.workspaceMember.findFirst({ where: { id, workspaceId: workspace.id } });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (target.role === "OWNER") return NextResponse.json({ error: "Cannot remove the owner" }, { status: 422 });

  await prisma.workspaceMember.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
