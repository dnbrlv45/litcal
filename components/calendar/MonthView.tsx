"use client";

import type { CalEvent } from "@/lib/google-calendar";
import { EVENT_TYPE_COLORS } from "@/lib/google-calendar";

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

interface Props {
  date: Date;
  today: Date;
  events: CalEvent[];
  onCellClick: (d: Date) => void;
  onSelectDay: (d: Date) => void;
  onEventClick: (ev: CalEvent) => void;
}

export default function MonthView({ date, today, events, onCellClick, onSelectDay, onEventClick }: Props) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7).concat(Array(7).fill(null)).slice(0, 7));
  }

  function isToday(day: number | null) {
    return (
      day !== null &&
      day === today.getDate() &&
      month === today.getMonth() &&
      year === today.getFullYear()
    );
  }

  function eventsForDay(day: number): CalEvent[] {
    return events.filter((e) => {
      const d = e.start;
      return d.getDate() === day && d.getMonth() === month && d.getFullYear() === year;
    });
  }

  return (
    <div className="flex flex-col h-full overflow-hidden rounded-lg border border-slate-200 bg-white panel-shadow">
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/80 shrink-0">
        {DAYS_OF_WEEK.map((d) => (
          <div key={d} className="py-3 text-center text-[11px] font-bold text-slate-500 uppercase tracking-wide">
            {d}
          </div>
        ))}
      </div>

      <div className="flex-1 grid" style={{ gridTemplateRows: `repeat(${weeks.length}, 1fr)` }}>
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7">
            {week.map((day, di) => {
              const dayEvents = day ? eventsForDay(day) : [];
              return (
                <div
                  key={di}
                  onClick={() => day && onCellClick(new Date(year, month, day))}
                  className={`border-b border-r border-slate-100 p-2 last:border-r-0 flex flex-col gap-1 transition-colors ${
                    day === null ? "bg-slate-50/70" : "hover:bg-teal-50/30 cursor-pointer"
                  }`}
                >
                  {day !== null && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onSelectDay(new Date(year, month, day)); }}
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm self-start transition-colors ${
                        isToday(day)
                          ? "bg-teal-700 text-white font-semibold shadow-sm"
                          : "text-slate-700 hover:bg-white hover:shadow-sm"
                      }`}
                    >
                      {day}
                    </button>
                  )}
                  {dayEvents.slice(0, 3).map((ev) => {
                    const colors = EVENT_TYPE_COLORS[ev.eventType ?? "OTHER"];
                    return (
                      <div
                        key={ev.id}
                        onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
                        className={`truncate rounded-md border px-2 py-1 text-xs font-semibold cursor-pointer shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${colors.bg} ${colors.text} ${ev.hasConflict ? "border-amber-400" : colors.border}`}
                        title={ev.title}
                      >
                        {ev.hasConflict
                          ? <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 mr-1 align-middle" />
                          : <span className={`inline-block w-1.5 h-1.5 rounded-full ${colors.dot} mr-1 align-middle`} />
                        }
                        {ev.title}
                        {ev.hasConflict && <span className="ml-1 text-amber-600">⚠</span>}
                      </div>
                    );
                  })}
                  {dayEvents.length > 3 && (
                    <div className="px-1 text-xs font-medium text-slate-500">+{dayEvents.length - 3} more</div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
