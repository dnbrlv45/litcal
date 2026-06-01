"use client";

import type { CalEvent } from "@/lib/google-calendar";

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
    <div className="flex flex-col h-full border border-border rounded-lg overflow-hidden">
      <div className="grid grid-cols-7 border-b border-border bg-muted/30 shrink-0">
        {DAYS_OF_WEEK.map((d) => (
          <div key={d} className="py-2 text-center text-xs font-medium text-muted-foreground uppercase tracking-wide">
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
                  className={`border-b border-r border-border p-1.5 last:border-r-0 flex flex-col gap-0.5 ${
                    day === null ? "bg-muted/10" : "hover:bg-accent/10 cursor-pointer"
                  }`}
                >
                  {day !== null && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onSelectDay(new Date(year, month, day)); }}
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm self-start hover:bg-accent transition-colors ${
                        isToday(day)
                          ? "bg-primary text-primary-foreground font-semibold"
                          : "text-foreground"
                      }`}
                    >
                      {day}
                    </button>
                  )}
                  {dayEvents.slice(0, 3).map((ev) => (
                    <div
                      key={ev.id}
                      onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
                      className="truncate text-xs rounded px-1 py-0.5 bg-primary/15 text-primary font-medium hover:bg-primary/25 cursor-pointer transition-colors"
                      title={ev.title}
                    >
                      {ev.title}
                    </div>
                  ))}
                  {dayEvents.length > 3 && (
                    <div className="text-xs text-muted-foreground px-1">+{dayEvents.length - 3} more</div>
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
