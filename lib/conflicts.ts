import { prisma } from "@/lib/prisma";

export interface ConflictInfo {
  eventId: string;
  title: string;
  startTime: Date;
  endTime: Date;
  attorneyName: string;
}

/**
 * Returns events assigned to the same attorney that overlap [start, end).
 * Touching boundaries (end === otherStart) are NOT considered conflicts.
 * Cancelled and completed events are excluded.
 *
 * Overlapping events on the same case (`sameCaseId`) are not conflicts: an
 * attorney can appear at, say, a CMC and an OSC set on the same case at the
 * same time in one appearance, so those should not be flagged.
 */
export async function detectConflicts(
  attorneyId: string,
  start: Date,
  end: Date,
  excludeEventId?: string,
  sameCaseId?: string | null,
): Promise<ConflictInfo[]> {
  const overlapping = await prisma.event.findMany({
    where: {
      assignedAttorneyId: attorneyId,
      allDay: false,
      status: { notIn: ["CANCELLED", "COMPLETED"] },
      startTime: { lt: end },
      endTime: { gt: start },
      ...(excludeEventId ? { id: { not: excludeEventId } } : {}),
      ...(sameCaseId ? { NOT: { caseId: sameCaseId } } : {}),
    },
    select: {
      id: true,
      title: true,
      startTime: true,
      endTime: true,
      assignedAttorney: {
        select: { firstName: true, lastName: true },
      },
    },
  });

  return overlapping.map((e) => ({
    eventId: e.id,
    title: e.title,
    startTime: e.startTime,
    endTime: e.endTime,
    attorneyName: [e.assignedAttorney?.firstName, e.assignedAttorney?.lastName]
      .filter(Boolean)
      .join(" ") || "Unknown Attorney",
  }));
}

/**
 * For a list of events, returns a Set of event IDs that have at least one conflict.
 * Runs as a single self-join query grouped by attorney.
 */
export async function getConflictedEventIds(
  workspaceId: string,
): Promise<Set<string>> {
  // Find all non-allDay, non-terminal events in the workspace that have an attorney
  const events = await prisma.event.findMany({
    where: {
      workspaceId,
      allDay: false,
      status: { notIn: ["CANCELLED", "COMPLETED"] },
      assignedAttorneyId: { not: null },
    },
    select: {
      id: true,
      assignedAttorneyId: true,
      caseId: true,
      startTime: true,
      endTime: true,
    },
    orderBy: [{ assignedAttorneyId: "asc" }, { startTime: "asc" }],
  });

  const conflicted = new Set<string>();

  // Group by attorney, then sweep for overlaps
  const byAttorney = new Map<string, typeof events>();
  for (const e of events) {
    const key = e.assignedAttorneyId!;
    if (!byAttorney.has(key)) byAttorney.set(key, []);
    byAttorney.get(key)!.push(e);
  }

  for (const attorneyEvents of byAttorney.values()) {
    // Already sorted by startTime; check adjacent pairs for overlap
    for (let i = 0; i < attorneyEvents.length; i++) {
      for (let j = i + 1; j < attorneyEvents.length; j++) {
        const a = attorneyEvents[i];
        const b = attorneyEvents[j];
        // If b starts at or after a ends, no more overlaps possible (sorted)
        if (b.startTime >= a.endTime) break;
        // Same-case overlaps aren't conflicts — one appearance covers both
        // (e.g. a CMC and OSC on the same case at the same time).
        if (a.caseId && b.caseId && a.caseId === b.caseId) continue;
        // b.startTime < a.endTime and b.endTime > a.startTime (guaranteed since b starts after a)
        conflicted.add(a.id);
        conflicted.add(b.id);
      }
    }
  }

  return conflicted;
}
