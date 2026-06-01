"use client";

import { Fragment, useEffect, useRef } from "react";
import type { CalEvent } from "@/lib/google-calendar";

const ROW_HEIGHT = 56;
const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
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

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 7 * ROW_HEIGHT;
  }, []);

  function handleColumnClick(day: Date, e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const scrollTop = scrollRef.current?.scrollTop ?? 0;
    const y = e.clientY - rect.top + scrollTop;
    const totalMins = Math.floor(y / ROW_HEIGHT * 60);
    const hour = Math.min(Math.floor(totalMins / 60), 23);
    const minute = Math.round((totalMins % 60) / 15) * 15 % 60;
    const d = new Date(day);
    d.setHours(hour, minute, 0, 0);
    onCellClick(d);
  }

  return (
    <div className="flex flex-col h-full border border-border rounded-lg overflow-hidden">
      {/* Day headers */}
      <div className="flex shrink-0 border-b border-border bg-muted/30">
        <div className="w-14 shrink-0" />
        {days.map((d, i) => {
          const isToday = isSameDay(d, today);
          return (
            <button
              key={i}
              onClick={() => onSelectDay(d)}
              className={`flex-1 py-2 text-center border-l border-border hover:bg-accent/30 transition-colors ${isToday ? "bg-primary/5" : ""}`}
            >
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide block">
                {DAY_ABBR[d.getDay()]}
              </span>
              <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium mx-auto ${isToday ? "bg-primary text-primary-foreground" : "text-foreground"}`}>
                {d.getDate()}
              </span>
            </button>
          );
        })}
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

          {/* Day columns */}
          {days.map((day, di) => {
            const isToday = isSameDay(day, today);
            const dayEvents = events.filter((e) => isSameDay(e.start, day) && !e.allDay);
            return (
              <div
                key={di}
                className={`flex-1 relative border-l border-border cursor-pointer ${isToday ? "bg-primary/[0.02]" : ""}`}
                onClick={(e) => handleColumnClick(day, e)}
              >
                {/* Hour lines */}
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="absolute w-full border-b border-border"
                    style={{ top: h * ROW_HEIGHT, height: ROW_HEIGHT }}
                  />
                ))}

                {/* Events */}
                {dayEvents.map((ev) => (
                  <div
                    key={ev.id}
                    onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
                    className="absolute left-1 right-1 rounded bg-primary/80 text-primary-foreground text-xs px-1.5 py-0.5 overflow-hidden z-10 cursor-pointer hover:brightness-110 transition-[filter]"
                    style={{ top: eventTop(ev), height: eventHeight(ev) }}
                    title={ev.title}
                  >
                    <span className="font-medium truncate block">{ev.title}</span>
                    {eventHeight(ev) > 30 && (
                      <span className="opacity-80">
                        {ev.start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
