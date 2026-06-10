import { prisma } from "@/lib/prisma";
import { adjustToBusinessDay } from "@/lib/reminders";
import type { EventType } from "@/lib/google-calendar";

// ─── Rule types ──────────────────────────────────────────────────────────────

type OffsetDirection = "before" | "after";
type WeekendAdjustment = "prev_friday" | "none";
type Generates = "deadline_event" | "task";

export interface DeadlineRule {
  key: string;
  triggerEventType: EventType;
  name: string;
  offsetDays: number;
  offsetDirection: OffsetDirection;
  weekendAdjustment: WeekendAdjustment;
  generates: Generates;
  /** Only when generates === "deadline_event" */
  eventType?: EventType;
  /** Only when generates === "task" */
  taskPriority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  active: boolean;
}

// ─── Phase 1 rules ───────────────────────────────────────────────────────────

export const DEADLINE_RULES: DeadlineRule[] = [
  // Case Management Conference → CMS task
  {
    key: "CMC_CMS_TASK",
    triggerEventType: "CASE_MANAGEMENT_CONFERENCE",
    name: "File Case Management Statement (CMS)",
    offsetDays: 15,
    offsetDirection: "before",
    weekendAdjustment: "prev_friday",
    generates: "task",
    taskPriority: "HIGH",
    active: true,
  },

  // Trial deadlines
  {
    key: "TRIAL_EXPERT_DESIGNATION",
    triggerEventType: "TRIAL",
    name: "Expert Designation Due",
    offsetDays: 60,
    offsetDirection: "before",
    weekendAdjustment: "prev_friday",
    generates: "deadline_event",
    eventType: "DEADLINE",
    active: true,
  },
  {
    key: "TRIAL_DISCOVERY_CUTOFF",
    triggerEventType: "TRIAL",
    name: "Discovery Cutoff",
    offsetDays: 40,
    offsetDirection: "before",
    weekendAdjustment: "prev_friday",
    generates: "deadline_event",
    eventType: "DEADLINE",
    active: true,
  },
  {
    key: "TRIAL_998_DUE",
    triggerEventType: "TRIAL",
    name: "CCP 998 Due",
    offsetDays: 15,
    offsetDirection: "before",
    weekendAdjustment: "prev_friday",
    generates: "deadline_event",
    eventType: "DEADLINE",
    active: true,
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Calculate the deadline date for a rule relative to a trigger date.
 *  Works in UTC day boundaries to avoid timezone drift on all-day events. */
export function computeDeadlineDate(triggerDate: Date, rule: DeadlineRule): Date {
  // Snap to UTC midnight of the trigger date so offset arithmetic is day-accurate
  const triggerUTCMidnight = new Date(Date.UTC(
    triggerDate.getUTCFullYear(),
    triggerDate.getUTCMonth(),
    triggerDate.getUTCDate(),
  ));
  const ms = rule.offsetDays * 24 * 60 * 60 * 1000;
  const raw = rule.offsetDirection === "before"
    ? new Date(triggerUTCMidnight.getTime() - ms)
    : new Date(triggerUTCMidnight.getTime() + ms);
  return rule.weekendAdjustment === "prev_friday" ? adjustToBusinessDay(raw) : raw;
}

/** Context passed to applyDeadlineRules. */
export interface TriggerEventContext {
  id: string;
  eventType: string;
  startTime: Date;
  caseId: string | null;
  userId: string;
  workspaceId: string;
  assignedAttorneyId: string | null;
  timeZone: string;
}

export interface ApplyResult {
  createdEventIds: string[];
  createdTaskIds: string[];
}

// ─── Core function ───────────────────────────────────────────────────────────

/**
 * Apply all active deadline rules for a trigger event.
 * Idempotent — skips rules that already have a GeneratedDeadline row.
 * Returns the IDs of newly created events/tasks for optional Google Calendar push.
 */
export async function applyDeadlineRules(
  trigger: TriggerEventContext,
): Promise<ApplyResult> {
  const result: ApplyResult = { createdEventIds: [], createdTaskIds: [] };

  const activeRules = DEADLINE_RULES.filter(
    (r) => r.active && r.triggerEventType === trigger.eventType,
  );
  if (activeRules.length === 0) return result;

  // Load existing generated deadlines for this trigger to check which rules already ran
  const existing = await prisma.generatedDeadline.findMany({
    where: { triggerEventId: trigger.id },
    select: { ruleKey: true },
  });
  const existingKeys = new Set(existing.map((e) => e.ruleKey));

  for (const rule of activeRules) {
    if (existingKeys.has(rule.key)) continue; // already generated — skip

    const deadlineDate = computeDeadlineDate(trigger.startTime, rule);

    if (rule.generates === "task") {
      // Resolve case staff assignees (attorney + paralegal, deduplicated)
      let assigneeMemberIds: string[] = [];
      let assigneeUserIds:   string[] = [];
      let caseTitle: string | null = null;

      if (trigger.caseId) {
        const [caseStaff, caseRecord] = await Promise.all([
          prisma.caseStaff.findMany({
            where: { caseId: trigger.caseId, role: { in: ["ATTORNEY", "PARALEGAL"] } },
            select: { userId: true, role: true },
            orderBy: { createdAt: "asc" },
          }),
          prisma.case.findUnique({
            where: { id: trigger.caseId },
            select: { title: true, caseNumber: true },
          }),
        ]);
        caseTitle = caseRecord?.title ?? null;

        // Deduplicate by userId (same person can't be both attorney and paralegal)
        const seenUserIds = new Set<string>();
        const uniqueStaff = caseStaff.filter((s) => {
          if (seenUserIds.has(s.userId)) return false;
          seenUserIds.add(s.userId);
          return true;
        });

        if (uniqueStaff.length > 0) {
          const members = await prisma.workspaceMember.findMany({
            where: {
              workspaceId: trigger.workspaceId,
              userId: { in: uniqueStaff.map((s) => s.userId) },
            },
            select: { id: true, userId: true },
          });
          assigneeMemberIds = members.map((m) => m.id);
          assigneeUserIds   = members.map((m) => m.userId);
        }
      }

      const task = await prisma.task.create({
        data: {
          workspaceId: trigger.workspaceId,
          caseId: trigger.caseId,
          eventId: trigger.id,
          title: rule.name,
          priority: rule.taskPriority ?? "MEDIUM",
          dueDate: deadlineDate,
          isAutoGenerated: true,
          assignees: assigneeMemberIds.length > 0
            ? { create: assigneeMemberIds.map((memberId) => ({ memberId })) }
            : undefined,
        },
      });

      if (assigneeUserIds.length > 0) {
        const notifBody = [
          caseTitle ? `Case: ${caseTitle}` : null,
          "Auto-generated task",
        ].filter(Boolean).join("\n");

        await prisma.notification.createMany({
          data: assigneeUserIds.map((userId) => ({
            userId,
            workspaceId: trigger.workspaceId,
            type:        "TASK_ASSIGNED" as never,
            title:       `Task Assigned: ${task.title}`,
            body:        notifBody || null,
            taskId:      task.id,
            caseId:      trigger.caseId,
          })),
          skipDuplicates: true,
        });
      }

      await prisma.generatedDeadline.create({
        data: {
          workspaceId: trigger.workspaceId,
          triggerEventId: trigger.id,
          ruleKey: rule.key,
          generatedTaskId: task.id,
        },
      });
      result.createdTaskIds.push(task.id);

    } else {
      // deadline_event — all-day event stored at UTC noon so any browser timezone
      // renders the correct calendar date (avoids midnight-UTC → prev-day display).
      const dayStart = new Date(Date.UTC(
        deadlineDate.getUTCFullYear(), deadlineDate.getUTCMonth(), deadlineDate.getUTCDate(),
        12, 0, 0, 0,
      ));
      const dayEnd = new Date(Date.UTC(
        deadlineDate.getUTCFullYear(), deadlineDate.getUTCMonth(), deadlineDate.getUTCDate(),
        23, 59, 59, 999,
      ));

      const triggerLabel = trigger.startTime.toLocaleDateString("en-US", {
        month: "long", day: "numeric", year: "numeric",
      });
      const triggerTypeName = trigger.eventType === "TRIAL" ? "Trial"
        : trigger.eventType === "CASE_MANAGEMENT_CONFERENCE" ? "Case Management Conference"
        : trigger.eventType;

      // Load case info for description (may have been fetched already for task rules)
      let deadlineCaseTitle: string | null = null;
      let deadlineCaseNumber: string | null = null;
      if (trigger.caseId) {
        const cRec = await prisma.case.findUnique({
          where: { id: trigger.caseId },
          select: { title: true, caseNumber: true },
        });
        deadlineCaseTitle  = cRec?.title ?? null;
        deadlineCaseNumber = cRec?.caseNumber ?? null;
      }

      const deadlineTitle = deadlineCaseTitle
        ? `${deadlineCaseTitle} — ${rule.name}`
        : rule.name;

      const descLines: string[] = [];
      if (deadlineCaseTitle)  descLines.push(`Case:\n${deadlineCaseTitle}`);
      if (deadlineCaseNumber) descLines.push(`Case Number:\n${deadlineCaseNumber}`);
      descLines.push(`Deadline Type:\n${rule.name}`);
      descLines.push(`Generated from:\n${triggerTypeName} on ${triggerLabel}`);

      const event = await prisma.event.create({
        data: {
          userId: trigger.userId,
          workspaceId: trigger.workspaceId,
          title: deadlineTitle,
          description: descLines.join("\n\n"),
          startTime: dayStart,
          endTime: dayEnd,
          timeZone: trigger.timeZone,
          allDay: true,
          eventType: rule.eventType ?? "DEADLINE",
          caseId: trigger.caseId,
          assignedAttorneyId: trigger.assignedAttorneyId,
        },
      });
      await prisma.generatedDeadline.create({
        data: {
          workspaceId: trigger.workspaceId,
          triggerEventId: trigger.id,
          ruleKey: rule.key,
          generatedEventId: event.id,
        },
      });
      result.createdEventIds.push(event.id);
    }
  }

  return result;
}

// ─── Cascade on trigger date change ──────────────────────────────────────────

/**
 * When a trigger event's date changes, recalculate all unmodified generated deadlines.
 * Modified deadlines (userModified = true) are left alone.
 * Returns info about modified deadlines that were skipped (for UI warnings).
 */
export async function cascadeDeadlineDateChange(
  triggerId: string,
  newStartTime: Date,
): Promise<{ skippedModified: number }> {
  const rows = await prisma.generatedDeadline.findMany({
    where: { triggerEventId: triggerId },
    include: {
      generatedEvent: { select: { id: true } },
      generatedTask:  { select: { id: true } },
    },
  });

  if (rows.length === 0) return { skippedModified: 0 };

  let skippedModified = 0;

  for (const row of rows) {
    if (row.userModified) {
      skippedModified++;
      continue;
    }

    const rule = DEADLINE_RULES.find((r) => r.key === row.ruleKey);
    if (!rule) continue;

    const newDate = computeDeadlineDate(newStartTime, rule);

    if (row.generatedEventId && row.generatedEvent) {
      const dayStart = new Date(Date.UTC(
        newDate.getUTCFullYear(), newDate.getUTCMonth(), newDate.getUTCDate(), 12, 0, 0, 0,
      ));
      const dayEnd = new Date(Date.UTC(
        newDate.getUTCFullYear(), newDate.getUTCMonth(), newDate.getUTCDate(), 23, 59, 59, 999,
      ));
      await prisma.event.update({
        where: { id: row.generatedEventId },
        data: { startTime: dayStart, endTime: dayEnd },
      });
    }

    if (row.generatedTaskId && row.generatedTask) {
      await prisma.task.update({
        where: { id: row.generatedTaskId },
        data: { dueDate: newDate },
      });
    }
  }

  return { skippedModified };
}
