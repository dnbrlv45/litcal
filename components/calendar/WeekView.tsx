"use client";

import { useEffect, useRef } from "react";
import type { CalEvent } from "@/lib/google-calendar";
import { eventColors } from "@/lib/google-calendar";
import { layoutDayEvents } from "@/lib/calendar-layout";
import { layoutSpanningEvents } from "@/lib/multi-day-layout";

const ROW_HEIGHT = 64;
const DAY_ABBR = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function formatHour(h: number) {
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
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
  return a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
}

function eventTop(e: CalEvent) {
  return (e.start.getHours() * 60 + e.start.getMinutes()) / 60 * ROW_HEIGHT;
}

function eventHeight(e: CalEvent) {
  const mins = (e.end.getTime() - e.start.getTime()) / 60000;
  return Math.max(mins / 60 * ROW_HEIGHT, 20);
}

interface Props {
  date: Date;
  today: Date;
  events: CalEvent[];
  onCellClick: (d: Date) => void;
  onSelectDay: (d: Date) => void;
  onEventClick: (ev: CalEvent) => void;
}

export default function WeekView({ date, today, events, onCellClick, onSelectDay, onEventClick }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const days = getWeekDays(date);
  const allDayEvents = events.filter((e) => e.allDay);
  const spanLayout = layoutSpanningEvents(allDayEvents, days);
  const spanRows = spanLayout.length > 0 ? Math.max(...spanLayout.map((s) => s.row)) + 1 : 1;
  const SPAN_ROW_H = 28; // px per stacking row

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 7 * ROW_HEIGHT;
  }, []);

  function handleColumnClick(day: Date, e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const startOffset = HOURS[0] * 60;
    const totalMins = Math.floor(y / ROW_HEIGHT * 60);
    const hour = Math.min(Math.floor((totalMins + startOffset) / 60), 23);
    const minute = Math.round((totalMins % 60) / 15) * 15 % 60;
    const d = new Date(day);
    d.setHours(hour, minute, 0, 0);
    onCellClick(d);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Day headers */}
      <div className="flex shrink-0 border-b border-slate-200 bg-white">
        <div className="w-16 shrink-0 border-r border-slate-100" />
        {days.map((d, i) => {
          const isToday = isSameDay(d, today);
          return (
            <button
              key={i}
              onClick={() => onSelectDay(d)}
              className={`flex-1 py-3 text-center border-l border-slate-100 hover:bg-slate-50 transition-colors ${isToday ? "bg-teal-50/80" : ""}`}
            >
              <span className={`text-[11px] font-semibold tracking-wide block ${isToday ? "text-teal-700" : "text-slate-500"}`}>
                {DAY_ABBR[d.getDay()]} {d.getDate()}
              </span>
            </button>
          );
        })}
      </div>

      {/* All-day / multi-day row */}
      <div className="flex shrink-0 border-b border-slate-200 bg-white">
        <div className="w-16 shrink-0 border-r border-slate-100 px-2 py-2 text-right text-xs text-slate-500 self-center">all-day</div>
        {/* 7-column grid for spanning events */}
        <div
          className="flex-1 relative"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            minHeight: spanRows * SPAN_ROW_H + 8,
          }}
        >
          {/* Column border lines */}
          {days.map((_, i) => (
            <div key={i} className={`${i > 0 ? "border-l border-slate-100" : ""}`} />
          ))}

          {/* Spanning event bars */}
          {spanLayout.map(({ event, colStart, colSpan, row, continuesLeft, continuesRight }) => {
            const colors = eventColors(event.eventType, event.subtype);
            return (
              <button
                key={event.id}
                onClick={() => onEventClick(event)}
                title={event.title}
                style={{
                  position: "absolute",
                  top: row * SPAN_ROW_H + 4,
                  left: `calc(${(colStart - 1) / 7 * 100}% + ${continuesLeft ? 0 : 3}px)`,
                  width: `calc(${colSpan / 7 * 100}% - ${(continuesLeft ? 0 : 3) + (continuesRight ? 0 : 3)}px)`,
                  height: SPAN_ROW_H - 5,
                }}
                className={`z-10 flex items-center overflow-hidden px-2 text-xs font-semibold shadow-sm transition hover:brightness-95 ${colors.bg} ${colors.text} ${
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
      </div>

      {/* Scrollable body */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="flex" style={{ height: HOURS.length * ROW_HEIGHT }}>
          {/* Time gutter */}
          <div className="w-16 shrink-0 relative border-r border-slate-100 bg-white">
            {HOURS.map((h, index) => (
              <div
                key={h}
                className="absolute w-full flex items-start justify-end pr-2 pt-1 select-none"
                style={{ top: index * ROW_HEIGHT, height: ROW_HEIGHT }}
              >
                <span className="text-xs font-medium text-slate-500">{formatHour(h)}</span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day, di) => {
            const isToday = isSameDay(day, today);
            const dayEvents = layoutDayEvents(events.filter((e) => isSameDay(e.start, day) && !e.allDay));
            return (
              <div
                key={di}
                className={`flex-1 relative border-l border-slate-100 cursor-pointer ${isToday ? "bg-teal-50/30" : ""}`}
                onClick={(e) => handleColumnClick(day, e)}
              >
                {/* Hour lines */}
                {HOURS.map((h, index) => (
                  <div
                    key={h}
                    className="absolute w-full border-b border-slate-100 hover:bg-slate-50/70"
                    style={{ top: index * ROW_HEIGHT, height: ROW_HEIGHT }}
                  />
                ))}

                {/* Events */}
                {dayEvents.map((ev) => {
                  const colors = eventColors(ev.eventType, ev.subtype);
                  const colWidth = 100 / ev.numCols;
                  return (
                    <div
                      key={ev.id}
                      onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
                      className={`absolute z-10 cursor-pointer overflow-hidden rounded-lg border px-2.5 py-2 text-xs shadow-sm ring-1 transition hover:-translate-y-0.5 hover:shadow-md ${colors.bg} ${colors.text} ${ev.hasConflict ? "border-amber-400 ring-amber-200" : `${colors.border} ${colors.ring}`}`}
                      style={{
                        top: eventTop(ev) - HOURS[0] * ROW_HEIGHT,
                        height: eventHeight(ev),
                        left: `calc(${ev.col * colWidth}% + 3px)`,
                        width: `calc(${colWidth}% - 6px)`,
                      }}
                      title={ev.title}
                    >
                      <span className="mb-0.5 flex items-center gap-1 text-[11px] font-medium opacity-80">
                        {ev.start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                        {ev.hasConflict && <span className="text-amber-600 font-bold leading-none">⚠</span>}
                      </span>
                      <span className="font-semibold truncate block">{ev.title}</span>
                      {eventHeight(ev) > 44 && ev.location && (
                        <span className="opacity-75 truncate block">{ev.location}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
