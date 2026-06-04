import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspaces";

const TASK_INCLUDE = {
  assignedTo: {
    select: {
      id: true,
      jobTitle: true,
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  },
  caseRef: { select: { id: true, title: true, caseNumber: true } },
  eventRef: { select: { id: true, title: true, startTime: true } },
} as const;

async function getTaskForWorkspace(id: string, workspaceId: string) {
  return prisma.task.findFirst({ where: { id, workspaceId }, include: TASK_INCLUDE });
}

// PATCH /api/tasks/[id]
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await requireUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspace } = await getCurrentWorkspace(currentUser.id);
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 403 });

  const { id } = await params;
  const existing = await getTaskForWorkspace(id, workspace.id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json() as {
    title?: string;
    description?: string;
    status?: string;
    priority?: string;
    dueDate?: string | null;
    caseId?: string | null;
    eventId?: string | null;
    assignedToId?: string | null;
    completedAt?: string | null;
  };

  const STATUSES = ["TODO", "IN_PROGRESS", "DONE"];
  const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

  const completedAt =
    body.status === "DONE" && existing.status !== "DONE"
      ? new Date()
      : body.status !== "DONE" && existing.status === "DONE"
      ? null
      : existing.completedAt;

  const task = await prisma.task.update({
    where: { id },
    data: {
      ...(body.title !== undefined ? { title: body.title.trim() } : {}),
      ...(body.description !== undefined ? { description: body.description?.trim() || null } : {}),
      ...(body.status !== undefined && STATUSES.includes(body.status) ? { status: body.status as never } : {}),
      ...(body.priority !== undefined && PRIORITIES.includes(body.priority) ? { priority: body.priority as never } : {}),
      ...(body.dueDate !== undefined ? { dueDate: body.dueDate ? new Date(body.dueDate) : null } : {}),
      ...(body.caseId !== undefined ? { caseId: body.caseId || null } : {}),
      ...(body.eventId !== undefined ? { eventId: body.eventId || null } : {}),
      ...(body.assignedToId !== undefined ? { assignedToId: body.assignedToId || null } : {}),
      completedAt,
    },
    include: TASK_INCLUDE,
  });

  return NextResponse.json({ task });
}

// DELETE /api/tasks/[id]
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await requireUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspace } = await getCurrentWorkspace(currentUser.id);
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 403 });

  const { id } = await params;
  const existing = await getTaskForWorkspace(id, workspace.id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.task.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
