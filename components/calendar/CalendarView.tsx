"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Bell,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Command,
  Plus,
  Search,
  X,
} from "lucide-react";
import MonthView from "./MonthView";
import WeekView from "./WeekView";
import DayView from "./DayView";
import TeamView from "./TeamView";
import EventModal from "./EventModal";
import EventDetailPanel from "./EventDetailPanel";
import type { CalEvent, EventType } from "@/lib/google-calendar";

type CalView = "month" | "week" | "day" | "team";

function parseLocalDate(iso: string): Date {
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return new Date(iso);
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  HEARING:                    "Hearing",
  DEPOSITION:                 "Deposition",
  TRIAL:                      "Trial",
  DEADLINE:                   "Deadline",
  CONFERENCE:                 "Conference",
  MEDIATION:                  "Mediation",
  COURT_CALL:                 "Court Call",
  CASE_MANAGEMENT_CONFERENCE: "Case Management Conference",
  MEETING:                    "Meeting",
  REMINDER:                   "Reminder",
  OTHER:                      "Other",
};

interface WorkspaceMember {
  id: string;
  jobTitle: string | null;
  user: { id: string; firstName: string | null; lastName: string | null; email: string };
}

interface CaseOption {
  id: string;
  title: string;
  caseNumber: string | null;
}

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
  if (view === "week" || view === "team") {
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

function memberLabel(m: WorkspaceMember) {
  const name = [m.user.firstName, m.user.lastName].filter(Boolean).join(" ");
  return name || m.user.email;
}

function getInitialView(): CalView {
  if (typeof window === "undefined") return "week";
  const params = new URLSearchParams(window.location.search);
  const v = params.get("view");
  if (v === "month" || v === "week" || v === "day" || v === "team") return v;
  return "week";
}

function getInitialDate(): Date {
  if (typeof window === "undefined") return new Date();
  const params = new URLSearchParams(window.location.search);
  const d = params.get("date");
  if (d) {
    const parsed = new Date(d + "T12:00:00");
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

export default function CalendarView() {
  const today = new Date();
  const [view, setView] = useState<CalView>(getInitialView);
  const [date, setDate] = useState(getInitialDate);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalDefaultStart, setModalDefaultStart] = useState<Date | undefined>();
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null);

  // Filter state
  const [filterAttorneyId, setFilterAttorneyId] = useState("");
  const [filterEventType, setFilterEventType] = useState("");
  const [filterCaseStatus, setFilterCaseStatus] = useState("");
  const [filterCaseId, setFilterCaseId] = useState("");
  const [caseSearch, setCaseSearch] = useState("");
  const [caseDropdownOpen, setCaseDropdownOpen] = useState(false);
  const caseDropdownRef = useRef<HTMLDivElement>(null);

  // Persist view and date in URL for refresh
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("view", view);
    params.set("date", date.toISOString().slice(0, 10));
    const newUrl = `${window.location.pathname}?${params}`;
    window.history.replaceState(null, "", newUrl);
  }, [view, date]);

  // Reference data
  const [attorneys, setAttorneys] = useState<WorkspaceMember[]>([]);
  const [cases, setCases] = useState<CaseOption[]>([]);
  const dataFetched = useRef(false);

  useEffect(() => {
    if (dataFetched.current) return;
    dataFetched.current = true;
    Promise.all([
      fetch("/api/workspaces/members").then((r) => r.json()).catch(() => ({ members: [] })),
      fetch("/api/cases").then((r) => r.json()).catch(() => ({ cases: [] })),
    ]).then(([membersData, casesData]) => {
      setAttorneys((membersData.members ?? []).filter((m: WorkspaceMember) => m.jobTitle === "ATTORNEY"));
      setCases(casesData.cases ?? []);
    });
  }, []);

  // Close case dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (caseDropdownRef.current && !caseDropdownRef.current.contains(e.target as Node)) {
        setCaseDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const eventCacheRef = useRef<Map<string, CalEvent[]>>(new Map());

  function parseEventList(rawEvents: CalEvent[]): CalEvent[] {
    return rawEvents.map((e) => ({
      ...e,
      start: e.allDay ? parseLocalDate(e.start as unknown as string) : new Date(e.start),
      end: e.allDay ? parseLocalDate(e.end as unknown as string) : new Date(e.end),
      eventType: e.eventType ?? "OTHER",
      caseId: e.caseId ?? undefined,
      caseTitle: e.caseTitle ?? undefined,
      caseStatus: e.caseStatus ?? undefined,
      department: e.department ?? undefined,
      assignedAttorneyId: e.assignedAttorneyId ?? undefined,
      assignedAttorneyName: e.assignedAttorneyName ?? undefined,
      hasConflict: e.hasConflict ?? false,
      caseCounty: e.caseCounty ?? null,
      caseCourt:  e.caseCourt  ?? null,
      inPerson: e.inPerson ?? false,
      appearanceType: e.appearanceType ?? null,
      remoteLink: e.remoteLink ?? null,
      phoneNumber: e.phoneNumber ?? null,
      bridge: e.bridge ?? null,
      remotePassword: e.remotePassword ?? null,
      requestRequired: e.requestRequired ?? null,
      requestContactEmail: e.requestContactEmail ?? null,
      requestNotes: e.requestNotes ?? null,
    }));
  }

  async function fetchRange(start: Date, end: Date): Promise<CalEvent[] | null> {
    const cacheKey = `${start.toISOString()}|${end.toISOString()}`;
    try {
      const res = await fetch(
        `/api/calendar/events?start=${start.toISOString()}&end=${end.toISOString()}`
      );
      if (!res.ok) return null;
      const data = await res.json();
      setGoogleConnected(data.connected ?? false);
      const parsed = parseEventList(data.events as CalEvent[]);
      eventCacheRef.current.set(cacheKey, parsed);
      return parsed;
    } catch { return null; }
  }

  function getAdjacentRanges(v: CalView, d: Date): { prev: { start: Date; end: Date }; next: { start: Date; end: Date } } {
    const prevDate = new Date(d);
    const nextDate = new Date(d);
    if (v === "month") {
      prevDate.setMonth(d.getMonth() - 1);
      nextDate.setMonth(d.getMonth() + 1);
    } else if (v === "week" || v === "team") {
      prevDate.setDate(d.getDate() - 7);
      nextDate.setDate(d.getDate() + 7);
    } else {
      prevDate.setDate(d.getDate() - 1);
      nextDate.setDate(d.getDate() + 1);
    }
    return {
      prev: getDateRange(v, prevDate),
      next: getDateRange(v, nextDate),
    };
  }

  function prefetchAdjacent(v: CalView, d: Date) {
    const { prev, next } = getAdjacentRanges(v, d);
    const prevKey = `${prev.start.toISOString()}|${prev.end.toISOString()}`;
    const nextKey = `${next.start.toISOString()}|${next.end.toISOString()}`;
    if (!eventCacheRef.current.has(prevKey)) void fetchRange(prev.start, prev.end);
    if (!eventCacheRef.current.has(nextKey)) void fetchRange(next.start, next.end);
  }

  const fetchEvents = useCallback(async () => {
    const { start, end } = getDateRange(view, date);
    const cacheKey = `${start.toISOString()}|${end.toISOString()}`;

    const cached = eventCacheRef.current.get(cacheKey);
    if (cached) {
      setEvents(cached);
      prefetchAdjacent(view, date);
      return;
    }

    const result = await fetchRange(start, end);
    if (result) setEvents(result);
    prefetchAdjacent(view, date);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, date]);

  useEffect(() => {
    void Promise.resolve().then(fetchEvents);
  }, [fetchEvents]);

  // Apply all filters
  const filteredEvents = events.filter((e) => {
    if (filterAttorneyId && e.assignedAttorneyId !== filterAttorneyId) return false;
    if (filterEventType && e.eventType !== filterEventType) return false;
    if (filterCaseStatus === "active" && e.caseId && (e.caseStatus === "CLOSED" || e.caseStatus === "ARCHIVED")) return false;
    if (filterCaseId && e.caseId !== filterCaseId) return false;
    return true;
  });

  const activeFilterCount = [filterAttorneyId, filterEventType, filterCaseStatus, filterCaseId].filter(Boolean).length;

  function clearAllFilters() {
    setFilterAttorneyId("");
    setFilterEventType("");
    setFilterCaseStatus("");
    setFilterCaseId("");
    setCaseSearch("");
  }

  function openModal(d?: Date) {
    setModalDefaultStart(d);
    setModalOpen(true);
  }

  function goToToday() { setDate(new Date(today)); }

  function prev() {
    setDate((d) => {
      const next = new Date(d);
      if (view === "month") next.setMonth(d.getMonth() - 1);
      else if (view === "week" || view === "team") next.setDate(d.getDate() - 7);
      else next.setDate(d.getDate() - 1);
      return next;
    });
  }

  function next() {
    setDate((d) => {
      const next = new Date(d);
      if (view === "month") next.setMonth(d.getMonth() + 1);
      else if (view === "week" || view === "team") next.setDate(d.getDate() + 7);
      else next.setDate(d.getDate() + 1);
      return next;
    });
  }

  const periodLabel =
    view === "month"
      ? `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`
      : view === "week" || view === "team"
      ? formatWeekLabel(date)
      : `${DAY_NAMES[date.getDay()]}, ${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;

  const selectedCase = cases.find((c) => c.id === filterCaseId);
  const filteredCases = cases.filter((c) => {
    const q = caseSearch.toLowerCase();
    return (
      c.title.toLowerCase().includes(q) ||
      (c.caseNumber ?? "").toLowerCase().includes(q)
    );
  });

  const selectClass = "h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-100 focus:border-teal-400 transition-colors";
  const activeSelectClass = "border-teal-400 bg-teal-50 text-teal-800 ring-1 ring-teal-200";

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-slate-50">
      {/* Top nav — hidden on mobile */}
      <div className="hidden md:flex h-[72px] shrink-0 border-b border-slate-200/80 bg-white/90 backdrop-blur px-7 items-center justify-between gap-5">
        <div className="relative w-full max-w-[680px]">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-14 text-sm text-slate-700 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-teal-300 focus:ring-4 focus:ring-teal-100"
            placeholder="Search cases, events, deadlines..."
          />
          <span className="absolute right-3 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-1 text-[11px] font-medium text-slate-400">
            <Command className="size-3" />K
          </span>
        </div>
        <div className="flex items-center gap-3 text-slate-700">
          <button className="relative grid size-9 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-950">
            <Bell className="size-4" />
          </button>
          <button className="grid size-9 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-950">
            <CalendarDays className="size-4" />
          </button>
          <form action="/api/auth/sign-out" method="post">
            <button className="h-9 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-950">
              Sign Out
            </button>
          </form>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 px-4 pt-4 pb-2 shrink-0 md:flex-row md:items-center md:justify-between md:px-8 md:pt-5 md:pb-3 md:gap-4">
        {/* Top row: title + new event button */}
        <div className="flex items-center justify-between gap-2 md:hidden">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold tracking-tight text-slate-950">{periodLabel}</h1>
            <p className="mt-0.5 text-xs font-medium text-slate-500">
              {filteredEvents.length} event{filteredEvents.length !== 1 ? "s" : ""}
              {activeFilterCount > 0 ? ` · ${activeFilterCount} filter${activeFilterCount !== 1 ? "s" : ""}` : ""}
            </p>
          </div>
          <Button size="sm" onClick={() => openModal()} className="gap-1.5 bg-slate-950 px-3 text-white hover:bg-slate-800 shrink-0">
            <Plus className="w-4 h-4" />
            New
          </Button>
        </div>

        {/* Navigation row: prev/next + today + view switcher */}
        <div className="flex items-center gap-2 md:hidden">
          <div className="flex overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <button onClick={prev} className="grid size-9 place-items-center border-r border-slate-200 text-slate-600 active:bg-slate-100">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={goToToday} className="px-3 text-xs font-medium text-slate-600 border-r border-slate-200 active:bg-slate-100">
              Today
            </button>
            <button onClick={next} className="grid size-9 place-items-center text-slate-600 active:bg-slate-100">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
            {(["day", "week", "month"] as CalView[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`h-7 min-w-[52px] rounded-md px-2 text-xs capitalize transition-colors ${
                  view === v ? "bg-slate-950 text-white shadow-sm" : "text-slate-600"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Desktop layout (unchanged) */}
        <div className="hidden md:flex min-w-0 items-center gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-2xl font-bold tracking-tight text-slate-950">{periodLabel}</h1>
              <ChevronDown className="size-4 shrink-0 text-slate-500" />
            </div>
            <p className="mt-0.5 text-xs font-medium text-slate-500">
              {filteredEvents.length} event{filteredEvents.length !== 1 ? "s" : ""} visible
              {activeFilterCount > 0 ? ` after ${activeFilterCount} filter${activeFilterCount !== 1 ? "s" : ""}` : ""}
            </p>
          </div>
          <div className="ml-2 flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
            {(["day", "week", "month", "team"] as CalView[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`h-8 min-w-[68px] rounded-md px-4 text-sm capitalize transition-colors ${
                  view === v ? "bg-slate-950 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        <div className="hidden md:flex items-center gap-2">
          <Button variant="outline" size="lg" onClick={goToToday} className="h-10 border-slate-200 bg-white px-4 text-sm shadow-sm">
            Today
          </Button>
          <div className="flex overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <button onClick={prev} className="grid size-10 place-items-center border-r border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-950">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={next} className="grid size-10 place-items-center text-slate-600 hover:bg-slate-50 hover:text-slate-950">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <Button size="lg" onClick={() => openModal()} className="h-10 gap-2 bg-slate-950 px-4 text-white shadow-sm hover:bg-slate-800">
            <Plus className="w-4 h-4" />
            New Event
          </Button>
        </div>
      </div>

      {/* Filter bar — hidden on mobile to save space */}
      <div className="hidden md:flex items-center gap-2 px-8 pb-4 shrink-0 flex-wrap">
        {/* Attorney */}
        {attorneys.length > 0 && (
          <select
            value={filterAttorneyId}
            onChange={(e) => setFilterAttorneyId(e.target.value)}
            className={`${selectClass} ${filterAttorneyId ? activeSelectClass : ""}`}
          >
            <option value="">All Attorneys</option>
            {attorneys.map((m) => (
              <option key={m.user.id} value={m.user.id}>{memberLabel(m)}</option>
            ))}
          </select>
        )}

        {/* Event type — only types present in current view */}
        <select
          value={filterEventType}
          onChange={(e) => setFilterEventType(e.target.value)}
          className={`${selectClass} ${filterEventType ? activeSelectClass : ""}`}
        >
          <option value="">All Types</option>
          {(Array.from(new Set(events.map((e) => e.eventType))) as EventType[])
            .sort()
            .map((type) => (
              <option key={type} value={type}>{EVENT_TYPE_LABELS[type] ?? type}</option>
            ))}
        </select>

        {/* Case status */}
        <select
          value={filterCaseStatus}
          onChange={(e) => setFilterCaseStatus(e.target.value)}
          className={`${selectClass} ${filterCaseStatus ? activeSelectClass : ""}`}
        >
          <option value="">All Cases</option>
          <option value="active">Active Only</option>
        </select>

        {/* Case searchable dropdown */}
        <div ref={caseDropdownRef} className="relative">
          <button
            onClick={() => { setCaseDropdownOpen((o) => !o); setCaseSearch(""); }}
            className={`${selectClass} flex items-center gap-1.5 pr-2 ${filterCaseId ? activeSelectClass : ""}`}
          >
            <span className="truncate max-w-[160px]">
              {selectedCase ? (selectedCase.title + (selectedCase.caseNumber ? ` #${selectedCase.caseNumber}` : "")) : "All Cases (case)"}
            </span>
            <ChevronDown className="size-3 shrink-0 opacity-50" />
          </button>

          {caseDropdownOpen && (
            <div className="absolute left-0 top-full mt-1 z-50 w-72 rounded-lg border border-slate-200 bg-white panel-shadow overflow-hidden">
              <div className="p-2 border-b border-slate-100">
                <input
                  autoFocus
                  value={caseSearch}
                  onChange={(e) => setCaseSearch(e.target.value)}
                  placeholder="Search cases..."
                  className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-teal-300 focus:ring-1 focus:ring-teal-200"
                />
              </div>
              <div className="max-h-52 overflow-y-auto">
                <button
                  onClick={() => { setFilterCaseId(""); setCaseSearch(""); setCaseDropdownOpen(false); }}
                  className={`w-full px-3 py-2 text-left text-xs hover:bg-slate-50 ${!filterCaseId ? "font-semibold text-teal-700" : "text-slate-700"}`}
                >
                  All Cases
                </button>
                {filteredCases.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { setFilterCaseId(c.id); setCaseSearch(""); setCaseDropdownOpen(false); }}
                    className={`w-full px-3 py-2 text-left text-xs hover:bg-slate-50 ${filterCaseId === c.id ? "font-semibold text-teal-700" : "text-slate-700"}`}
                  >
                    {c.title}{c.caseNumber ? ` (#${c.caseNumber})` : ""}
                  </button>
                ))}
                {filteredCases.length === 0 && (
                  <p className="px-3 py-2 text-xs text-slate-400">No cases found</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Clear filters */}
        {activeFilterCount > 0 && (
          <button
            onClick={clearAllFilters}
            className="flex items-center gap-1 h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-500 hover:text-slate-800 hover:border-slate-300 shadow-sm transition-colors"
          >
            <X className="size-3" />
            Clear {activeFilterCount > 1 ? `${activeFilterCount} filters` : "filter"}
          </button>
        )}
      </div>

      {/* Main content row */}
      <div className="flex flex-1 min-h-0 overflow-hidden px-2 pb-2 md:px-5 md:pb-5">
        {/* Calendar */}
        <div className="flex-1 min-w-0 overflow-hidden flex flex-col gap-5">
          {view === "month" && (
            <MonthView
              date={date}
              today={today}
              events={filteredEvents}
              onCellClick={(d) => openModal(d)}
              onSelectDay={(d) => { setDate(d); setView("day"); }}
              onEventClick={(ev) => setSelectedEvent(ev)}
            />
          )}
          {view === "week" && (
            <WeekView
              date={date}
              today={today}
              events={filteredEvents}
              onCellClick={(d) => openModal(d)}
              onSelectDay={(d) => { setDate(d); setView("day"); }}
              onEventClick={(ev) => setSelectedEvent(ev)}
            />
          )}
          {view === "day" && (
            <DayView
              date={date}
              today={today}
              events={filteredEvents}
              onCellClick={(d) => openModal(d)}
              onEventClick={(ev) => setSelectedEvent(ev)}
            />
          )}
          {view === "team" && (
            <TeamView
              date={date}
              today={today}
              events={filteredEvents}
              attorneys={attorneys.map((m) => ({
                id: m.user.id,
                name: [m.user.firstName, m.user.lastName].filter(Boolean).join(" ") || m.user.email,
              }))}
              onEventClick={(ev) => setSelectedEvent(ev)}
              onSelectDay={(d) => { setDate(d); setView("day"); }}
            />
          )}
        </div>

        {/* Right detail panel */}
        {selectedEvent && (
          <EventDetailPanel
            event={selectedEvent}
            onClose={() => setSelectedEvent(null)}
            onDeleted={() => { fetchEvents(); setSelectedEvent(null); }}
            onUpdated={() => { fetchEvents(); setSelectedEvent(null); }}
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
    </div>
  );
}
