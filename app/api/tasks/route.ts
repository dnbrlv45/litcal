import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspaces";
import { addTimelineEntry } from "@/lib/case-timeline";
import { pushTaskToGoogle } from "@/lib/task-google-sync";
import { sendTaskAssignedEmails } from "@/lib/email-notifications";

export const TASK_INCLUDE = {
  assignees: {
    include: {
      member: {
        select: {
          id: true,
          jobTitle: true,
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      },
    },
  },
  caseRef:  { select: { id: true, title: true, caseNumber: true } },
  eventRef: { select: { id: true, title: true, startTime: true } },
} as const;

// GET /api/tasks
export async function GET(request: NextRequest) {
  const currentUser = await requireUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspace } = await getCurrentWorkspace(currentUser.id);
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const status     = searchParams.get("status");
  const priority   = searchParams.get("priority");
  const caseId     = searchParams.get("caseId");
  const memberId   = searchParams.get("assignedToId"); // memberId for compat
  const eventId    = searchParams.get("eventId");

  const tasks = await prisma.task.findMany({
    where: {
      workspaceId: workspace.id,
      ...(status   ? { status:   status   as never } : {}),
      ...(priority ? { priority: priority as never } : {}),
      ...(caseId   ? { caseId } : {}),
      ...(eventId  ? { eventId } : {}),
      ...(memberId ? { assignees: { some: { memberId } } } : {}),
    },
    include: TASK_INCLUDE,
    orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({ tasks });
}

// POST /api/tasks
export async function POST(request: NextRequest) {
  const currentUser = await requireUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspace } = await getCurrentWorkspace(currentUser.id);
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 403 });

  const body = await request.json() as {
    title: string;
    description?: string;
    status?: string;
    priority?: string;
    dueDate?: string;
    caseId?: string;
    eventId?: string;
    assigneeIds?: string[]; // WorkspaceMember IDs
  };

  if (!body.title?.trim())
    return NextResponse.json({ error: "Title is required" }, { status: 400 });

  const STATUSES   = ["TODO", "IN_PROGRESS", "DONE"];
  const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

  const assigneeIds = (body.assigneeIds ?? []).filter(Boolean);

  // Validate all memberIds belong to this workspace
  if (assigneeIds.length > 0) {
    const valid = await prisma.workspaceMember.findMany({
      where: { workspaceId: workspace.id, id: { in: assigneeIds } },
      select: { id: true },
    });
    const validIds = new Set(valid.map((m) => m.id));
    const invalid = assigneeIds.filter((id) => !validIds.has(id));
    if (invalid.length > 0)
      return NextResponse.json({ error: "Invalid assignee IDs" }, { status: 400 });
  }

  const task = await prisma.task.create({
    data: {
      workspaceId: workspace.id,
      title: body.title.trim(),
      description: body.description?.trim() || null,
      status:   (STATUSES.includes(body.status ?? "")   ? body.status   : "TODO")   as never,
      priority: (PRIORITIES.includes(body.priority ?? "") ? body.priority : "MEDIUM") as never,
      dueDate:  body.dueDate  ? new Date(body.dueDate)  : null,
      caseId:   body.caseId   || null,
      eventId:  body.eventId  || null,
      assignees: assigneeIds.length > 0
        ? { create: assigneeIds.map((memberId) => ({ memberId })) }
        : undefined,
    },
    include: TASK_INCLUDE,
  });

  // Create notifications for each assignee
  if (assigneeIds.length > 0) {
    const assigner = currentUser;
    const assignerName = [assigner.firstName, assigner.lastName].filter(Boolean).join(" ") || assigner.email;

    // Fetch user IDs for assignees
    const members = await prisma.workspaceMember.findMany({
      where: { id: { in: assigneeIds } },
      select: { id: true, userId: true },
    });

    const caseTitle = task.caseRef?.title ?? null;
    const body_text = [
      caseTitle ? `Case: ${caseTitle}` : null,
      `Assigned by: ${assignerName}`,
    ].filter(Boolean).join("\n");

    await prisma.notification.createMany({
      data: members.map((m) => ({
        userId:      m.userId,
        workspaceId: workspace.id,
        type:        "TASK_ASSIGNED" as never,
        title:       `Task Assigned: ${task.title}`,
        body:        body_text || null,
        taskId:      task.id,
        caseId:      task.caseId ?? null,
      })),
      skipDuplicates: true,
    });
    await sendTaskAssignedEmails(task.id, assignerName);
  }

  if (task.caseId) {
    void addTimelineEntry({
      caseId: task.caseId,
      workspaceId: workspace.id,
      actorUserId: currentUser.id,
      type: "task.created",
      title: `Task created: ${task.title}`,
      metadata: { taskId: task.id, priority: task.priority },
    });
  }

  if (task.dueDate) {
    void pushTaskToGoogle(currentUser.id, {
      id: task.id,
      title: task.title,
      dueDate: task.dueDate,
      priority: task.priority,
      caseRef: task.caseRef ?? null,
    });
  }

  return NextResponse.json({ task }, { status: 201 });
}
