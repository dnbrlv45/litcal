import type { CalEvent } from "@/lib/google-calendar";

export interface LayoutEvent extends CalEvent {
  col: number;
  numCols: number;
}

/**
 * Given a list of events for a single day, assigns each event a column
 * index and total column count so overlapping events render side by side.
 */
export function layoutDayEvents(events: CalEvent[]): LayoutEvent[] {
  if (events.length === 0) return [];

  const sorted = [...events].sort(
    (a, b) => a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime()
  );

  // Group into overlapping clusters
  const clusters: CalEvent[][] = [];
  let cluster = [sorted[0]];
  let clusterEnd = sorted[0].end;

  for (let i = 1; i < sorted.length; i++) {
    const ev = sorted[i];
    if (ev.start < clusterEnd) {
      cluster.push(ev);
      if (ev.end > clusterEnd) clusterEnd = ev.end;
    } else {
      clusters.push(cluster);
      cluster = [ev];
      clusterEnd = ev.end;
    }
  }
  clusters.push(cluster);

  const result: LayoutEvent[] = [];

  for (const group of clusters) {
    // Greedily assign columns within the cluster
    const colEnds: Date[] = [];
    const assigned: Array<{ ev: CalEvent; col: number }> = [];

    for (const ev of group) {
      let col = colEnds.findIndex((end) => ev.start >= end);
      if (col === -1) {
        col = colEnds.length;
        colEnds.push(ev.end);
      } else {
        if (ev.end > colEnds[col]) colEnds[col] = ev.end;
      }
      assigned.push({ ev, col });
    }

    const numCols = colEnds.length;
    for (const { ev, col } of assigned) {
      result.push({ ...ev, col, numCols });
    }
  }

  return result;
}
