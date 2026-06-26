import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspaces";

export async function POST() {
  const currentUser = await requireUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspace } = await getCurrentWorkspace(currentUser.id);
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 403 });

  const now = new Date();

  // Mark overdue deadline events as COMPLETED
  const eventsResult = await prisma.event.updateMany({
    where: {
      eventType: "DEADLINE",
      startTime: { lt: now },
      status: { notIn: ["COMPLETED", "CANCELLED"] },
      OR: [
        { workspaceId: workspace.id },
        { userId: currentUser.id, workspaceId: null },
      ],
    },
    data: { status: "COMPLETED" },
  });

  // Mark overdue tasks as DONE
  const tasksResult = await prisma.task.updateMany({
    where: {
      workspaceId: workspace.id,
      dueDate: { lt: now, not: null },
      status: { not: "DONE" },
    },
    data: { status: "DONE", completedAt: now },
  });

  return NextResponse.json({
    completedEvents: eventsResult.count,
    completedTasks: tasksResult.count,
  });
}
