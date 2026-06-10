import { prisma } from "@/lib/prisma";
import { FILTER_TYPES } from "@/lib/case-timeline-constants";
export { TIMELINE_FILTERS, FILTER_TYPES } from "@/lib/case-timeline-constants";
export type { TimelineFilter } from "@/lib/case-timeline-constants";

export type TimelineType =
  | "case.created"
  | "case.edited"
  | "case.status_changed"
  | "case.staff_added"
  | "case.staff_removed"
  | "event.created"
  | "event.edited"
  | "event.deleted"
  | "event.trial_deadlines_generated"
  | "event.cmc_task_generated"
  | "event.rule_applied"
  | "event.rule_backfilled"
  | "event.remote_task_generated"
  | "event.google_synced"
  | "task.created"
  | "task.completed";

export type TimelineImportance = "HIGH" | "NORMAL" | "LOW";

const TYPE_IMPORTANCE: Record<TimelineType, TimelineImportance> = {
  "case.created":                   "HIGH",
  "case.status_changed":            "HIGH",
  "case.staff_added":               "HIGH",
  "case.staff_removed":             "HIGH",
  "case.edited":                    "NORMAL",
  "event.created":                  "NORMAL",  // caller may override to HIGH for trial/hearing
  "event.deleted":                  "HIGH",
  "event.trial_deadlines_generated":"HIGH",
  "event.rule_backfilled":          "HIGH",
  "task.completed":                 "HIGH",
  "event.cmc_task_generated":       "NORMAL",
  "event.rule_applied":             "NORMAL",
  "event.remote_task_generated":    "NORMAL",
  "task.created":                   "NORMAL",
  "event.edited":                   "LOW",
  "event.google_synced":            "LOW",
};

export function getImportance(type: TimelineType, overrideImportance?: TimelineImportance): TimelineImportance {
  return overrideImportance ?? TYPE_IMPORTANCE[type] ?? "NORMAL";
}

// ─── Write helpers ────────────────────────────────────────────────────────────

interface AddTimelineEntryInput {
  caseId: string;
  workspaceId: string;
  actorUserId?: string | null;
  type: TimelineType;
  title: string;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  importance?: TimelineImportance;
  createdAt?: Date;
}

/** Fire-and-forget timeline write. Never throws — failures are logged only. */
export async function addTimelineEntry(input: AddTimelineEntryInput): Promise<void> {
  try {
    await prisma.caseTimeline.create({
      data: {
        caseId:      input.caseId,
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId ?? null,
        type:        input.type,
        title:       input.title,
        description: input.description ?? null,
        importance:  getImportance(input.type, input.importance),
        metadata:    input.metadata as never ?? undefined,
        ...(input.createdAt ? { createdAt: input.createdAt } : {}),
      },
    });
  } catch (err) {
    console.error("[CaseTimeline] Failed to write entry:", err);
  }
}

/** Write multiple entries at once (used during backfill). */
export async function addTimelineEntries(inputs: AddTimelineEntryInput[]): Promise<void> {
  if (!inputs.length) return;
  try {
    await prisma.caseTimeline.createMany({
      data: inputs.map((input) => ({
        caseId:      input.caseId,
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId ?? null,
        type:        input.type,
        title:       input.title,
        description: input.description ?? null,
        importance:  getImportance(input.type, input.importance),
        metadata:    (input.metadata ?? null) as never,
        ...(input.createdAt ? { createdAt: input.createdAt } : {}),
      })),
      skipDuplicates: false,
    });
  } catch (err) {
    console.error("[CaseTimeline] Failed to write entries:", err);
  }
}
