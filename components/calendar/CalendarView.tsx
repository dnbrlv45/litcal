"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import MonthView from "./MonthView";
import WeekView from "./WeekView";
import DayView from "./DayView";
import EventModal from "./EventModal";
import EventDetailModal from "./EventDetailModal";
import type { CalEvent } from "@/lib/google-calendar";

type CalView = "month" | "week" | "day";

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatWeekLabel(date: Date): string {
  const start = startOfWeek(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  if (start.getMonth() === end.getMonth()) {
    return `${MONTH_NAMES[start.getMonth()]} ${start.getDate()}–${end.getDate()}, ${start.getFullYear()}`;
  }
  return `${MONTH_NAMES[start.getMonth()]} ${start.getDate()} – ${MONTH_NAMES[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
}

function getDateRange(view: CalView, date: Date): { start: Date; end: Date } {
  if (view === "month") {
    return {
      start: new Date(date.getFullYear(), date.getMonth(), 1),
      end: new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59),
    };
  }
  if (view === "week") {
    const start = startOfWeek(date);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59);
    return { start, end };
  }
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export default function CalendarView() {
  const today = new Date();
  const [view, setView] = useState<CalView>("month");
  const [date, setDate] = useState(new Date(today));
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalDefaultStart, setModalDefaultStart] = useState<Date | undefined>();
  const [detailEvent, setDetailEvent] = useState<CalEvent | null>(null);

  const fetchEvents = useCallback(async () => {
    const { start, end } = getDateRange(view, date);
    try {
      const res = await fetch(
        `/api/calendar/events?start=${start.toISOString()}&end=${end.toISOString()}`
      );
      if (!res.ok) return;
      const data = await res.json();
      setGoogleConnected(data.connected ?? false);
      setEvents(
        (data.events as CalEvent[]).map((e) => ({
          ...e,
          start: new Date(e.start),
          end: new Date(e.end),
        }))
      );
    } catch { /* silently fail */ }
  }, [view, date]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  function openModal(d?: Date) {
    setModalDefaultStart(d);
    setModalOpen(true);
  }

  function goToToday() { setDate(new Date(today)); }

  function prev() {
    setDate((d) => {
      const next = new Date(d);
      if (view === "month") next.setMonth(d.getMonth() - 1);
      else if (view === "week") next.setDate(d.getDate() - 7);
      else next.setDate(d.getDate() - 1);
      return next;
    });
  }

  function next() {
    setDate((d) => {
      const next = new Date(d);
      if (view === "month") next.setMonth(d.getMonth() + 1);
      else if (view === "week") next.setDate(d.getDate() + 7);
      else next.setDate(d.getDate() + 1);
      return next;
    });
  }

  const periodLabel =
    view === "month"
      ? `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`
      : view === "week"
      ? formatWeekLabel(date)
      : `${DAY_NAMES[date.getDay()]}, ${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-4 shrink-0">
        <h1 className="text-lg font-semibold">{periodLabel}</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={prev}>‹</Button>
          <Button variant="outline" size="sm" onClick={goToToday}>Today</Button>
          <Button variant="outline" size="sm" onClick={next}>›</Button>

          <div className="flex rounded-md border border-border overflow-hidden ml-1">
            {(["month", "week", "day"] as CalView[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 text-sm capitalize transition-colors ${
                  view === v
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:text-foreground hover:bg-accent/50"
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          <Button size="sm" onClick={() => openModal()} className="ml-1">
            + New Event
          </Button>
        </div>
      </div>

      {/* View */}
      <div className="flex-1 min-h-0 px-6 pb-6">
        {view === "month" && (
          <MonthView
            date={date}
            today={today}
            events={events}
            onCellClick={(d) => openModal(d)}
            onSelectDay={(d) => { setDate(d); setView("day"); }}
            onEventClick={(ev) => setDetailEvent(ev)}
          />
        )}
        {view === "week" && (
          <WeekView
            date={date}
            today={today}
            events={events}
            onCellClick={(d) => openModal(d)}
            onSelectDay={(d) => { setDate(d); setView("day"); }}
            onEventClick={(ev) => setDetailEvent(ev)}
          />
        )}
        {view === "day" && (
          <DayView
            date={date}
            today={today}
            events={events}
            onCellClick={(d) => openModal(d)}
            onEventClick={(ev) => setDetailEvent(ev)}
          />
        )}
      </div>

      <EventModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        defaultStart={modalDefaultStart}
        googleConnected={googleConnected}
        onCreated={fetchEvents}
      />

      <EventDetailModal
        event={detailEvent}
        onClose={() => setDetailEvent(null)}
        onDeleted={fetchEvents}
        onUpdated={fetchEvents}
      />
    </div>
  );
}
