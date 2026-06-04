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

// GET /api/tasks
export async function GET(request: NextRequest) {
  const currentUser = await requireUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspace } = await getCurrentWorkspace(currentUser.id);
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const priority = searchParams.get("priority");
  const caseId = searchParams.get("caseId");
  const assignedToId = searchParams.get("assignedToId");
  const eventId = searchParams.get("eventId");

  const tasks = await prisma.task.findMany({
    where: {
      workspaceId: workspace.id,
      ...(status ? { status: status as never } : {}),
      ...(priority ? { priority: priority as never } : {}),
      ...(caseId ? { caseId } : {}),
      ...(assignedToId ? { assignedToId } : {}),
      ...(eventId ? { eventId } : {}),
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
    assignedToId?: string;
  };

  if (!body.title?.trim())
    return NextResponse.json({ error: "Title is required" }, { status: 400 });

  const STATUSES = ["TODO", "IN_PROGRESS", "DONE"];
  const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

  const task = await prisma.task.create({
    data: {
      workspaceId: workspace.id,
      title: body.title.trim(),
      description: body.description?.trim() || null,
      status: (STATUSES.includes(body.status ?? "") ? body.status : "TODO") as never,
      priority: (PRIORITIES.includes(body.priority ?? "") ? body.priority : "MEDIUM") as never,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      caseId: body.caseId || null,
      eventId: body.eventId || null,
      assignedToId: body.assignedToId || null,
    },
    include: TASK_INCLUDE,
  });

  return NextResponse.json({ task }, { status: 201 });
}
