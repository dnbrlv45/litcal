"use client";

import type { CalEvent } from "@/lib/google-calendar";
import { EVENT_TYPE_COLORS } from "@/lib/google-calendar";

const DAY_ABBR = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

interface Attorney {
  id: string;
  name: string;
}

interface Props {
  date: Date;
  today: Date;
  events: CalEvent[];
  attorneys: Attorney[];
  onEventClick: (ev: CalEvent) => void;
  onSelectDay: (d: Date) => void;
}

function getWeekDays(date: Date): Date[] {
  const start = new Date(date);
  start.setDate(date.getDate() - date.getDay());
  start.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getDate() === b.getDate() &&
    a.getMonth() === b.getMonth() &&
    a.getFullYear() === b.getFullYear()
  );
}

function formatTime(d: Date) {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function TeamView({ date, today, events, attorneys, onEventClick, onSelectDay }: Props) {
  const days = getWeekDays(date);

  // Events for a specific attorney + day, sorted by start time
  function cellEvents(attorneyId: string | null, day: Date): CalEvent[] {
    return events
      .filter((e) => {
        const sameDay = isSameDay(e.start, day);
        if (!sameDay) return false;
        if (attorneyId === null) return !e.assignedAttorneyId;
        return e.assignedAttorneyId === attorneyId;
      })
      .sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  // Only show unassigned row if there are actually unassigned events this week
  const hasUnassigned = events.some(
    (e) => !e.assignedAttorneyId && days.some((d) => isSameDay(e.start, d))
  );

  const rows: { id: string | null; name: string }[] = [
    ...attorneys.map((a) => ({ id: a.id, name: a.name })),
    ...(hasUnassigned ? [{ id: null, name: "Unassigned" }] : []),
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Header row */}
      <div className="grid shrink-0 border-b border-slate-200 bg-white" style={{ gridTemplateColumns: "160px repeat(7, 1fr)" }}>
        <div className="border-r border-slate-100 px-4 py-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Attorney</span>
        </div>
        {days.map((d, i) => {
          const isToday = isSameDay(d, today);
          return (
            <button
              key={i}
              onClick={() => onSelectDay(d)}
              className={`py-3 text-center border-l border-slate-100 hover:bg-slate-50 transition-colors ${isToday ? "bg-teal-50/80" : ""}`}
            >
              <span className={`text-[11px] font-semibold tracking-wide block ${isToday ? "text-teal-700" : "text-slate-500"}`}>
                {DAY_ABBR[d.getDay()]} {d.getDate()}
              </span>
            </button>
          );
        })}
      </div>

      {/* Attorney rows */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
        {rows.length === 0 && (
          <div className="flex items-center justify-center h-full text-sm text-slate-400">
            No attorneys in this workspace
          </div>
        )}
        {rows.map((row) => (
          <div
            key={row.id ?? "__unassigned__"}
            className="grid min-h-[96px]"
            style={{ gridTemplateColumns: "160px repeat(7, 1fr)" }}
          >
            {/* Attorney name */}
            <div className={`border-r border-slate-100 px-4 py-3 flex items-start ${row.id === null ? "bg-slate-50/60" : ""}`}>
              <div>
                <p className={`text-sm font-semibold leading-tight ${row.id === null ? "text-slate-400 italic" : "text-slate-800"}`}>
                  {row.name}
                </p>
              </div>
            </div>

            {/* Day cells */}
            {days.map((day, di) => {
              const isToday = isSameDay(day, today);
              const cell = cellEvents(row.id, day);
              return (
                <div
                  key={di}
                  className={`border-l border-slate-100 p-1.5 flex flex-col gap-1 ${isToday ? "bg-teal-50/20" : ""}`}
                >
                  {cell.map((ev) => {
                    const colors = EVENT_TYPE_COLORS[ev.eventType ?? "OTHER"];
                    return (
                      <button
                        key={ev.id}
                        onClick={() => onEventClick(ev)}
                        className={`w-full text-left rounded-md border px-2 py-1.5 text-xs shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${colors.bg} ${colors.text} ${ev.hasConflict ? "border-amber-400 ring-1 ring-amber-200" : colors.border}`}
                        title={ev.title}
                      >
                        <span className="flex items-center gap-1 font-medium opacity-75 mb-0.5">
                          {ev.allDay ? "All day" : formatTime(ev.start)}
                          {ev.hasConflict && <span className="text-amber-600 font-bold">⚠</span>}
                        </span>
                        <span className="font-semibold block truncate">{ev.title}</span>
                        {ev.caseNumber && <span className="opacity-60 truncate block">#{ev.caseNumber}</span>}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
