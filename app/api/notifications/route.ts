import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspaces";

// GET /api/notifications — returns unread count + recent list
export async function GET() {
  const currentUser = await requireUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspace } = await getCurrentWorkspace(currentUser.id);
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 403 });

  await prisma.notification.deleteMany({
    where: {
      userId: currentUser.id,
      workspaceId: workspace.id,
      type: "TASK_ASSIGNED",
      taskId: null,
    },
  });

  const notifications = await prisma.notification.findMany({
    where: { userId: currentUser.id, workspaceId: workspace.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      taskRef:  { select: { id: true, title: true } },
      caseRef:  { select: { id: true, title: true, caseNumber: true } },
      eventRef: { select: { id: true, title: true } },
    },
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  return NextResponse.json({ notifications, unreadCount });
}

// DELETE /api/notifications — delete specific IDs or all
export async function DELETE(request: NextRequest) {
  const currentUser = await requireUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspace } = await getCurrentWorkspace(currentUser.id);
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 403 });

  const body = await request.json() as { ids?: string[]; all?: boolean };

  if (body.all) {
    await prisma.notification.deleteMany({
      where: { userId: currentUser.id, workspaceId: workspace.id },
    });
  } else if (body.ids?.length) {
    await prisma.notification.deleteMany({
      where: { id: { in: body.ids }, userId: currentUser.id },
    });
  }

  return NextResponse.json({ ok: true });
}

// PATCH /api/notifications — mark as read (all or specific IDs)
export async function PATCH(request: NextRequest) {
  const currentUser = await requireUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspace } = await getCurrentWorkspace(currentUser.id);
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 403 });

  const body = await request.json() as { ids?: string[]; all?: boolean };

  if (body.all) {
    await prisma.notification.updateMany({
      where: { userId: currentUser.id, workspaceId: workspace.id, read: false },
      data: { read: true },
    });
  } else if (body.ids?.length) {
    await prisma.notification.updateMany({
      where: { id: { in: body.ids }, userId: currentUser.id },
      data: { read: true },
    });
  }

  return NextResponse.json({ ok: true });
}
