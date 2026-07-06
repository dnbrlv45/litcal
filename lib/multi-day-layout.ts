import type { CalEvent } from "@/lib/google-calendar";

export interface SpanLayout {
  event: CalEvent;
  colStart: number; // 1-based
  colSpan: number;
  row: number;      // stacking row, 0-based
  /** true if the event starts before this week */
  continuesLeft: boolean;
  /** true if the event ends after this week */
  continuesRight: boolean;
}

function dayStart(d: Date): Date {
  const r = new Date(d); r.setHours(0, 0, 0, 0); return r;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

/**
 * Compute spanning layout for all-day / multi-day events in a 7-day week.
 * weekDays must be an array of 7 Date objects (each at midnight).
 *
 * By default only multi-day all-day events are laid out — callers like the
 * month grid render single-day all-day events inline in each day cell. Pass
 * `includeSingleDay` for views (e.g. the week all-day banner) that have no
 * inline slot and need every all-day event placed as a bar.
 */
export function layoutSpanningEvents(
  events: CalEvent[],
  weekDays: Date[],
  { includeSingleDay = false }: { includeSingleDay?: boolean } = {},
): SpanLayout[] {
  const weekStart = dayStart(weekDays[0]);
  const weekEnd   = new Date(weekDays[6]); weekEnd.setHours(23, 59, 59, 999);

  const relevant = events
    .filter((e) => {
      if (!e.allDay || e.start > weekEnd || e.end < weekStart) return false;
      if (includeSingleDay) return true;
      const sameDay = e.start.getFullYear() === e.end.getFullYear() &&
        e.start.getMonth() === e.end.getMonth() &&
        e.start.getDate() === e.end.getDate();
      return !sameDay;
    })
    .sort((a, b) => {
      const sd = a.start.getTime() - b.start.getTime();
      if (sd !== 0) return sd;
      // Longer events first
      return (b.end.getTime() - b.start.getTime()) - (a.end.getTime() - a.start.getTime());
    });

  const layout: SpanLayout[] = [];
  // rows[r] holds colEnd (exclusive) of the last event placed there
  const rowOccupancy: Array<Array<{ colStart: number; colEnd: number }>> = [];

  for (const event of relevant) {
    const continuesLeft  = event.start < weekStart;
    const continuesRight = event.end   > weekEnd;

    const clampedStart = continuesLeft  ? weekStart : event.start;
    const clampedEnd   = continuesRight ? weekEnd   : event.end;

    // Find colStart: first weekDay that is <= clampedStart
    let colStart = 1;
    for (let i = 0; i < weekDays.length; i++) {
      if (isSameDay(weekDays[i], clampedStart) || weekDays[i] >= clampedStart) {
        colStart = i + 1;
        break;
      }
    }

    // Find colEnd: last weekDay that is <= clampedEnd (i.e. event covers that day)
    let colEnd = colStart;
    for (let i = weekDays.length - 1; i >= 0; i--) {
      if (weekDays[i] <= clampedEnd) {
        colEnd = i + 1;
        break;
      }
    }

    const colSpan = Math.max(1, colEnd - colStart + 1);

    // Assign first available stacking row that has no overlap
    let row = 0;
    while (true) {
      if (!rowOccupancy[row]) rowOccupancy[row] = [];
      const conflicts = rowOccupancy[row].filter(
        (occ) => !(occ.colEnd < colStart || occ.colStart > colEnd),
      );
      if (conflicts.length === 0) {
        rowOccupancy[row].push({ colStart, colEnd });
        break;
      }
      row++;
    }

    layout.push({ event, colStart, colSpan, row, continuesLeft, continuesRight });
  }

  return layout;
}
