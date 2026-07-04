"use client";

import { useState, useEffect, useRef } from "react";
import type { CalEvent } from "@/lib/google-calendar";
import { eventColors } from "@/lib/google-calendar";
import { layoutSpanningEvents } from "@/lib/multi-day-layout";

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

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

interface PopoverState {
  day: number;
  rect: DOMRect;
}

export default function MonthView({ date, today, events, onCellClick, onSelectDay, onEventClick }: Props) {
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!popover) return;
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopover(null);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPopover(null);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [popover]);

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

  const SPAN_ROW_H = 22; // px per stacking row in month view
  const MAX_VISIBLE_SPAN_ROWS = 2;
  const SPAN_TOP = 34;

  function isSingleDayAllDay(e: CalEvent) {
    return e.allDay && e.start.getFullYear() === e.end.getFullYear() &&
      e.start.getMonth() === e.end.getMonth() && e.start.getDate() === e.end.getDate();
  }

  function eventsForDay(day: number): CalEvent[] {
    return events.filter((e) => {
      if (e.allDay && !isSingleDayAllDay(e)) return false; // multi-day handled as spans
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

      <div className="flex-1 grid min-h-0" style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
        {weeks.map((week, wi) => {
          // Build the 7 Date objects for this week row.
          // Null cells are padding from prev/next month — compute their actual dates
          // by anchoring off the first real day in this row.
          const weekDaysRaw = week.map((day) =>
            day !== null ? new Date(year, month, day) : null
          );
          const firstRealIndex = weekDaysRaw.findIndex((d) => d !== null);
          const firstReal = weekDaysRaw[firstRealIndex];
          const weekDaysFull = weekDaysRaw.map((d, i) =>
            d ?? (firstReal
              ? new Date(firstReal.getTime() - (firstRealIndex - i) * 86400000)
              : new Date())
          );
          const spanLayout  = layoutSpanningEvents(events, weekDaysFull);
          const spanRows    = spanLayout.length > 0 ? Math.max(...spanLayout.map((s) => s.row)) + 1 : 0;
          const visibleSpanRows = Math.min(spanRows, MAX_VISIBLE_SPAN_ROWS);
          const spanHeight = visibleSpanRows * SPAN_ROW_H;

          return (
            <div key={wi} className="relative grid grid-cols-7 overflow-hidden">
              {/* Day cells */}
              {week.map((day, di) => {
                const dayEvents = day ? eventsForDay(day) : [];
                return (
                  <div
                    key={di}
                    onClick={() => day && onCellClick(new Date(year, month, day))}
                    className={`border-b border-r border-slate-100 last:border-r-0 flex flex-col gap-1 transition-colors ${
                      day === null ? "bg-slate-50/70" : "hover:bg-teal-50/30 cursor-pointer"
                    }`}
                    style={{ padding: "6px" }}
                  >
                    {day !== null && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onSelectDay(new Date(year, month, day)); }}
                        className={`relative z-20 inline-flex h-7 w-7 items-center justify-center rounded-full text-sm self-start transition-colors ${
                          isToday(day)
                            ? "bg-teal-700 text-white font-semibold shadow-sm"
                            : "text-slate-700 hover:bg-white hover:shadow-sm"
                        }`}
                      >
                        {day}
                      </button>
                    )}
                    <div aria-hidden="true" className="shrink-0" style={{ height: spanHeight }} />
                    {dayEvents.slice(0, 2).map((ev) => {
                      const colors = eventColors(ev.eventType);
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
                    {dayEvents.length > 2 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setPopover(popover?.day === day ? null : { day: day!, rect: e.currentTarget.getBoundingClientRect() });
                        }}
                        className="px-1 text-xs font-medium text-teal-700 hover:text-teal-900 hover:underline text-left"
                      >
                        +{dayEvents.length - 2} more
                      </button>
                    )}
                  </div>
                );
              })}

              {/* Spanning event bars — absolute, above day content */}
              {spanLayout.filter((item) => item.row < MAX_VISIBLE_SPAN_ROWS).map(({ event, colStart, colSpan, row, continuesLeft, continuesRight }) => {
                const colors = eventColors(event.eventType);
                return (
                  <button
                    key={event.id}
                    onClick={(e) => { e.stopPropagation(); onEventClick(event); }}
                    title={event.title}
                    style={{
                      position: "absolute",
                      top: SPAN_TOP + row * SPAN_ROW_H,
                      left: `calc(${(colStart - 1) / 7 * 100}% + ${continuesLeft ? 0 : 2}px)`,
                      width: `calc(${colSpan / 7 * 100}% - ${(continuesLeft ? 0 : 2) + (continuesRight ? 0 : 2)}px)`,
                      height: SPAN_ROW_H - 4,
                    }}
                    className={`z-10 flex items-center overflow-hidden px-2 text-xs font-semibold transition hover:brightness-95 ${colors.bg} ${colors.text} ${
                      continuesLeft  ? "rounded-l-none" : "rounded-l-md"
                    } ${
                      continuesRight ? "rounded-r-none" : "rounded-r-md"
                    }`}
                  >
                    {!continuesLeft && (
                      <span className={`mr-1.5 size-1.5 shrink-0 rounded-full ${colors.dot}`} />
                    )}
                    <span className="truncate">{event.title}</span>
                    {continuesRight && <span className="ml-auto shrink-0 pl-1 opacity-60">›</span>}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      {/* "+X more" popover */}
      {popover && (() => {
        const popoverEvents = eventsForDay(popover.day);
        const r = popover.rect;
        const left = Math.min(r.left, window.innerWidth - 280);
        const spaceBelow = window.innerHeight - r.bottom;
        const popoverHeight = Math.min(popoverEvents.length * 36 + 44, 300);
        const openAbove = spaceBelow < popoverHeight + 10;
        const top = openAbove ? r.top - popoverHeight - 6 : r.bottom + 6;
        return (
          <div
            ref={popoverRef}
            style={{ position: "fixed", top, left, zIndex: 50, width: 268 }}
            className="rounded-lg border border-slate-200 bg-white shadow-xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 bg-slate-50">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                {MONTH_NAMES[month]} {popover.day}
              </span>
              <button
                onClick={() => setPopover(null)}
                className="text-slate-400 hover:text-slate-700 text-sm leading-none"
              >
                ✕
              </button>
            </div>
            <div className="flex flex-col gap-1 p-2 max-h-64 overflow-y-auto">
              {popoverEvents.map((ev) => {
                const colors = eventColors(ev.eventType);
                return (
                  <button
                    key={ev.id}
                    onClick={() => { setPopover(null); onEventClick(ev); }}
                    className={`flex items-center gap-1.5 w-full rounded-md border px-2 py-1.5 text-xs font-semibold text-left transition hover:brightness-95 ${colors.bg} ${colors.text} ${ev.hasConflict ? "border-amber-400" : colors.border}`}
                  >
                    {ev.hasConflict
                      ? <span className="shrink-0 inline-block w-1.5 h-1.5 rounded-full bg-amber-500" />
                      : <span className={`shrink-0 inline-block w-1.5 h-1.5 rounded-full ${colors.dot}`} />
                    }
                    <span className="truncate">{ev.title}</span>
                    {ev.hasConflict && <span className="ml-auto shrink-0 text-amber-600">⚠</span>}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
