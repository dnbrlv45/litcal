"use client";

import { Fragment, useEffect, useRef } from "react";
import type { CalEvent } from "@/lib/google-calendar";
import { EVENT_TYPE_COLORS } from "@/lib/google-calendar";

const ROW_HEIGHT = 56;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function formatHour(h: number) {
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
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
  onEventClick: (ev: CalEvent) => void;
}

export default function DayView({ date, today, events, onCellClick, onEventClick }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isToday = isSameDay(date, today);
  const dayEvents = events.filter((e) => isSameDay(e.start, date) && !e.allDay);

  useEffect(() => {
    if (scrollRef.current) {
      const target = isToday ? Math.max(today.getHours() - 1, 0) : 7;
      scrollRef.current.scrollTop = target * ROW_HEIGHT;
    }
  }, [date]);

  const nowTop = isToday
    ? (today.getHours() * 60 + today.getMinutes()) / 60 * ROW_HEIGHT
    : null;

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const scrollTop = scrollRef.current?.scrollTop ?? 0;
    const y = e.clientY - rect.top + scrollTop;
    const totalMins = Math.floor(y / ROW_HEIGHT * 60);
    const hour = Math.min(Math.floor(totalMins / 60), 23);
    const minute = Math.round((totalMins % 60) / 15) * 15 % 60;
    const d = new Date(date);
    d.setHours(hour, minute, 0, 0);
    onCellClick(d);
  }

  return (
    <div className="flex flex-col h-full border border-border rounded-lg overflow-hidden">
      {/* Day header */}
      <div className={`shrink-0 border-b border-border px-4 py-3 ${isToday ? "bg-primary/5" : "bg-muted/30"}`}
        style={{ paddingLeft: "calc(56px + 1rem)" }}>
        <span className={`text-sm font-medium ${isToday ? "text-primary" : "text-muted-foreground"}`}>
          {isToday
            ? "Today"
            : date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </span>
      </div>

      {/* Scrollable body */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="flex" style={{ height: 24 * ROW_HEIGHT }}>
          {/* Time gutter */}
          <div className="w-14 shrink-0 relative border-r border-border">
            {HOURS.map((h) => (
              <div
                key={h}
                className="absolute w-full flex items-start justify-end pr-2 pt-1 select-none"
                style={{ top: h * ROW_HEIGHT, height: ROW_HEIGHT }}
              >
                <span className="text-xs text-muted-foreground">{formatHour(h)}</span>
              </div>
            ))}
          </div>

          {/* Content column */}
          <div className="flex-1 relative cursor-pointer" onClick={handleClick}>
            {/* Hour lines */}
            {HOURS.map((h) => (
              <div key={h} className="absolute w-full border-b border-border hover:bg-accent/10"
                style={{ top: h * ROW_HEIGHT, height: ROW_HEIGHT }} />
            ))}

            {/* Current time line */}
            {nowTop !== null && (
              <div className="absolute left-0 right-0 z-20 flex items-center pointer-events-none" style={{ top: nowTop }}>
                <div className="w-2 h-2 rounded-full bg-red-500 shrink-0 -ml-1" />
                <div className="flex-1 h-px bg-red-500" />
              </div>
            )}

            {/* Events */}
            {dayEvents.map((ev) => {
              const colors = EVENT_TYPE_COLORS[ev.eventType ?? "OTHER"];
              return (
                <div
                  key={ev.id}
                  onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
                  className={`absolute left-1 right-2 rounded text-xs px-1.5 py-0.5 overflow-hidden z-10 cursor-pointer hover:brightness-95 transition-[filter] ${colors.bg} ${colors.text}`}
                  style={{ top: eventTop(ev), height: eventHeight(ev) }}
                  title={ev.title}
                >
                  <span className="font-semibold block truncate">{ev.title}</span>
                  {eventHeight(ev) > 30 && ev.location && (
                    <span className="opacity-70 truncate block">{ev.location}</span>
                  )}
                  {eventHeight(ev) > 44 && (
                    <span className="opacity-70">
                      {ev.start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} –{" "}
                      {ev.end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
