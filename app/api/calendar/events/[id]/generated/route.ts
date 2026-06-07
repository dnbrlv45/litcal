import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspaces";
import { DEADLINE_RULES } from "@/lib/deadline-rules";

type Params = { params: Promise<{ id: string }> };

// GET /api/calendar/events/[id]/generated
// Returns generated deadlines spawned by this event (as trigger),
// plus parent trigger info if this event was itself generated.
export async function GET(_req: NextRequest, { params }: Params) {
  const currentUser = await requireUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspace } = await getCurrentWorkspace(currentUser.id);
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 403 });

  const { id } = await params;

  const [children, parent] = await Promise.all([
    // Deadlines this event triggered
    prisma.generatedDeadline.findMany({
      where: { triggerEventId: id, workspaceId: workspace.id },
      include: {
        generatedEvent: {
          select: { id: true, title: true, startTime: true, eventType: true, allDay: true },
        },
        generatedTask: {
          select: { id: true, title: true, dueDate: true, status: true, priority: true },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    // Parent trigger (if this event was auto-generated)
    prisma.generatedDeadline.findUnique({
      where: { generatedEventId: id },
      include: {
        triggerEvent: {
          select: { id: true, title: true, startTime: true, eventType: true },
        },
      },
    }),
  ]);

  return NextResponse.json({
    // Generated deadlines spawned by this event
    generated: children.map((row) => {
      const rule = DEADLINE_RULES.find((r) => r.key === row.ruleKey);
      return {
        ruleKey: row.ruleKey,
        ruleName: rule?.name ?? row.ruleKey,
        offsetDays: rule?.offsetDays ?? null,
        offsetDirection: rule?.offsetDirection ?? null,
        userModified: row.userModified,
        generatedEvent: row.generatedEvent
          ? {
              id: row.generatedEvent.id,
              title: row.generatedEvent.title,
              date: row.generatedEvent.startTime.toISOString(),
              eventType: row.generatedEvent.eventType,
            }
          : null,
        generatedTask: row.generatedTask
          ? {
              id: row.generatedTask.id,
              title: row.generatedTask.title,
              dueDate: row.generatedTask.dueDate?.toISOString() ?? null,
              status: row.generatedTask.status,
              priority: row.generatedTask.priority,
            }
          : null,
      };
    }),
    // Parent trigger (present when this event was itself auto-generated)
    generatedFrom: parent
      ? {
          ruleKey: parent.ruleKey,
          ruleName: DEADLINE_RULES.find((r) => r.key === parent.ruleKey)?.name ?? parent.ruleKey,
          offsetDays: DEADLINE_RULES.find((r) => r.key === parent.ruleKey)?.offsetDays ?? null,
          userModified: parent.userModified,
          triggerEvent: {
            id: parent.triggerEvent.id,
            title: parent.triggerEvent.title,
            date: parent.triggerEvent.startTime.toISOString(),
            eventType: parent.triggerEvent.eventType,
          },
        }
      : null,
  });
}
