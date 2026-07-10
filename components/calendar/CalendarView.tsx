"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Bell,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
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

function parseAllDayEventDates(startValue: Date | string, endValue: Date | string): { start: Date; end: Date } {
  const startIso = String(startValue);
  const endIso = String(endValue);
  const start = parseLocalDate(startIso);
  let end = parseLocalDate(endIso);

  const startInstant = new Date(startValue);
  const endInstant = new Date(endValue);
  if (
    start.getTime() !== end.getTime() &&
    !Number.isNaN(startInstant.getTime()) &&
    !Number.isNaN(endInstant.getTime()) &&
    endInstant.getTime() - startInstant.getTime() < 24 * 60 * 60 * 1000
  ) {
    end = start;
  }

  return { start, end };
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
  status?: string | null;
  county?: string | null;
  court?: string | null;
}

interface DeadlineSearchItem {
  id: string;
  type: "event" | "task";
  title: string;
  dueDate: string;
  status: string;
  sourceLabel: string;
  caseId: string | null;
  caseTitle: string | null;
  caseNumber: string | null;
  caseCounty: string | null;
  assignedAttorneyName: string | null;
  relatedEventId: string | null;
  relatedTaskId: string | null;
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

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

function matchesQuery(values: Array<string | null | undefined>, query: string): boolean {
  if (!query) return true;
  const haystack = values.filter(Boolean).join(" ").toLowerCase();
  return query.split(/\s+/).every((term) => haystack.includes(term));
}

function eventMatchesSearch(event: CalEvent, query: string): boolean {
  if (!query) return true;
  return matchesQuery([
    event.title,
    event.caseTitle,
    event.caseNumber,
  ], query);
}

function caseMatchesSearch(c: CaseOption, query: string): boolean {
  return matchesQuery([c.title, c.caseNumber, c.status, c.county, c.court], query);
}

function deadlineMatchesSearch(d: DeadlineSearchItem, query: string): boolean {
  return matchesQuery([d.title, d.caseTitle, d.caseNumber], query);
}

function SearchResultSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-b border-slate-100 py-1 last:border-b-0">
      <div className="px-3 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">
        {title}
      </div>
      {children}
    </div>
  );
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
  const router = useRouter();
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
  const [calendarSearch, setCalendarSearch] = useState("");
  const [eventSearchResults, setEventSearchResults] = useState<CalEvent[]>([]);
  const [searchActiveIndex, setSearchActiveIndex] = useState(-1);
  const [caseDropdownOpen, setCaseDropdownOpen] = useState(false);
  const caseDropdownRef = useRef<HTMLDivElement>(null);
  const calendarSearchRef = useRef<HTMLInputElement>(null);
  const calendarSearchContainerRef = useRef<HTMLDivElement>(null);

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
  const [deadlines, setDeadlines] = useState<DeadlineSearchItem[]>([]);
  const dataFetched = useRef(false);
  const pendingSelectEventId = useRef<string | null>(null);

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
    void fetch("/api/deadlines")
      .then((r) => r.json())
      .then((d) => setDeadlines(d.deadlines ?? []))
      .catch(() => setDeadlines([]));
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

  useEffect(() => {
    function handleSearchShortcut(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        calendarSearchRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleSearchShortcut);
    return () => document.removeEventListener("keydown", handleSearchShortcut);
  }, []);

  const MAX_CACHE_SIZE = 5;
  const eventCacheRef = useRef<Map<string, CalEvent[]>>(new Map());
  const cacheOrderRef = useRef<string[]>([]);

  function cacheSet(key: string, value: CalEvent[]) {
    const cache = eventCacheRef.current;
    const order = cacheOrderRef.current;
    if (cache.has(key)) {
      order.splice(order.indexOf(key), 1);
    }
    cache.set(key, value);
    order.push(key);
    while (order.length > MAX_CACHE_SIZE) {
      cache.delete(order.shift()!);
    }
  }

  function parseEventList(rawEvents: CalEvent[]): CalEvent[] {
    return rawEvents.map((e) => {
      const allDayDates = e.allDay
        ? parseAllDayEventDates(e.start as unknown as string, e.end as unknown as string)
        : null;
      return {
        ...e,
        start: allDayDates ? allDayDates.start : new Date(e.start),
        end: allDayDates ? allDayDates.end : new Date(e.end),
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
      };
    });
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
      cacheSet(cacheKey, parsed);
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

  function bustCache() {
    eventCacheRef.current.clear();
    cacheOrderRef.current = [];
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

  // Refresh events when this tab/window regains focus — catches changes
  // (create/edit/delete) made in another tab or by another user while this
  // one was in the background, without needing a manual page refresh.
  useEffect(() => {
    const lastRefreshRef = { current: Date.now() };
    const MIN_INTERVAL_MS = 5000;

    function refreshIfStale() {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastRefreshRef.current < MIN_INTERVAL_MS) return;
      lastRefreshRef.current = now;
      bustCache();
      void fetchEvents();
    }

    window.addEventListener("focus", refreshIfStale);
    document.addEventListener("visibilitychange", refreshIfStale);
    return () => {
      window.removeEventListener("focus", refreshIfStale);
      document.removeEventListener("visibilitychange", refreshIfStale);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchEvents]);

  useEffect(() => {
    const pendingId = pendingSelectEventId.current;
    if (!pendingId) return;
    const match = events.find((event) => event.id === pendingId);
    if (!match) return;
    setSelectedEvent(match);
    pendingSelectEventId.current = null;
  }, [events]);

  const calendarSearchQuery = normalizeSearch(calendarSearch);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (calendarSearchContainerRef.current && !calendarSearchContainerRef.current.contains(e.target as Node)) {
        setCalendarSearch("");
        setSearchActiveIndex(-1);
      }
    }
    if (calendarSearchQuery) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [calendarSearchQuery]);

  useEffect(() => {
    if (!calendarSearchQuery) { setEventSearchResults([]); setSearchActiveIndex(-1); return; }
    setSearchActiveIndex(-1);
    const timer = setTimeout(() => {
      fetch(`/api/calendar/events?q=${encodeURIComponent(calendarSearch)}`)
        .then((r) => r.json())
        .then((d) => setEventSearchResults(d.events ? (d.events as CalEvent[]).map((e) => ({ ...e, start: new Date(e.start), end: new Date(e.end), eventType: e.eventType ?? "OTHER" })) : []))
        .catch(() => setEventSearchResults([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [calendarSearchQuery, calendarSearch]);

  // Apply all filters
  const filteredEvents = useMemo(() => events.filter((e) => {
    if (!eventMatchesSearch(e, calendarSearchQuery)) return false;
    if (filterAttorneyId && e.assignedAttorneyId !== filterAttorneyId) return false;
    if (filterEventType && e.eventType !== filterEventType) return false;
    if (filterCaseStatus === "active" && e.caseId && (e.caseStatus === "CLOSED" || e.caseStatus === "ARCHIVED")) return false;
    if (filterCaseId && e.caseId !== filterCaseId) return false;
    return true;
  }), [events, calendarSearchQuery, filterAttorneyId, filterEventType, filterCaseStatus, filterCaseId]);

  const activeFilterCount = [calendarSearchQuery, filterAttorneyId, filterEventType, filterCaseStatus, filterCaseId].filter(Boolean).length;

  const caseSearchResults = useMemo(
    () => calendarSearchQuery ? cases.filter((c) => caseMatchesSearch(c, calendarSearchQuery)).slice(0, 5) : [],
    [cases, calendarSearchQuery],
  );
  // eventSearchResults populated via server-side search useEffect above
  const deadlineSearchResults = useMemo(
    () => calendarSearchQuery ? deadlines.filter((d) => deadlineMatchesSearch(d, calendarSearchQuery)).slice(0, 5) : [],
    [deadlines, calendarSearchQuery],
  );
  const hasSearchResults = caseSearchResults.length > 0 || eventSearchResults.length > 0 || deadlineSearchResults.length > 0;

  function closeCalendarSearch() {
    setCaseDropdownOpen(false);
    setCalendarSearch("");
    setSearchActiveIndex(-1);
  }

  // Flat ordered list of all search result actions for arrow-key navigation
  const searchActions = calendarSearchQuery ? [
    ...caseSearchResults.map((c) => () => { closeCalendarSearch(); router.push(`/cases/${c.id}`); }),
    ...eventSearchResults.map((e) => () => openSearchEvent(e)),
    ...deadlineSearchResults.map((d) => () => openSearchDeadline(d)),
  ] : [];

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!calendarSearchQuery) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSearchActiveIndex((i) => Math.min(i + 1, searchActions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSearchActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter" && searchActiveIndex >= 0) {
      e.preventDefault();
      searchActions[searchActiveIndex]?.();
    } else if (e.key === "Escape") {
      closeCalendarSearch();
    }
  }

  function openSearchEvent(event: CalEvent) {
    setDate(event.start);
    setView("day");
    setSelectedEvent(event);
    closeCalendarSearch();
  }

  function openSearchDeadline(deadline: DeadlineSearchItem) {
    if (deadline.type === "task") {
      closeCalendarSearch();
      router.push(`/tasks?taskId=${deadline.relatedTaskId ?? deadline.id}`);
      return;
    }

    const dueDate = new Date(deadline.dueDate);
    if (!isNaN(dueDate.getTime())) {
      setDate(dueDate);
      setView("day");
    }

    const eventId = deadline.id;
    const visibleEvent = events.find((event) => event.id === eventId);
    if (visibleEvent) {
      setSelectedEvent(visibleEvent);
    } else {
      pendingSelectEventId.current = eventId;
    }

    closeCalendarSearch();
  }

  function clearAllFilters() {
    setCalendarSearch("");
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
      <div className="hidden md:flex h-[72px] shrink-0 border-b border-slate-200/80 bg-white px-7 items-center justify-between gap-5 z-[100] relative">
        <div ref={calendarSearchContainerRef} className="relative w-full max-w-[680px]">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            ref={calendarSearchRef}
            value={calendarSearch}
            onChange={(e) => setCalendarSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-14 text-sm text-slate-700 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-teal-300 focus:ring-4 focus:ring-teal-100"
            placeholder="Search cases, events, deadlines..."
          />
          {calendarSearch && (
            <button
              type="button"
              onClick={() => {
                setCalendarSearch("");
                calendarSearchRef.current?.focus();
              }}
              aria-label="Clear calendar search"
              className="absolute right-3 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="size-3.5" />
            </button>
          )}
          {calendarSearchQuery && (
            <div className="absolute left-0 top-full z-[200] mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
              {hasSearchResults ? (
                <div className="max-h-[420px] overflow-y-auto py-2">
                  {caseSearchResults.length > 0 && (
                    <SearchResultSection title="Cases">
                      {caseSearchResults.map((c, i) => (
                        <button
                          key={c.id}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            closeCalendarSearch();
                            router.push(`/cases/${c.id}`);
                          }}
                          className={`w-full px-3 py-2 text-left ${searchActiveIndex === i ? "bg-teal-50" : "hover:bg-slate-50"}`}
                        >
                          <span className="block truncate text-sm font-semibold text-slate-800">{c.title}</span>
                          <span className="block truncate text-xs text-slate-500">
                            {[c.caseNumber ? `#${c.caseNumber}` : null, c.status, c.county, c.court].filter(Boolean).join(" · ") || "Case"}
                          </span>
                        </button>
                      ))}
                    </SearchResultSection>
                  )}

                  {eventSearchResults.length > 0 && (
                    <SearchResultSection title="Events">
                      {eventSearchResults.map((event, i) => (
                        <button
                          key={event.id}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => openSearchEvent(event)}
                          className={`w-full px-3 py-2 text-left ${searchActiveIndex === caseSearchResults.length + i ? "bg-teal-50" : "hover:bg-slate-50"}`}
                        >
                          <span className="block truncate text-sm font-semibold text-slate-800">{event.title}</span>
                          <span className="block truncate text-xs text-slate-500">
                            {`${EVENT_TYPE_LABELS[event.eventType] ?? event.eventType} · ${event.start.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                            {event.caseTitle ? ` · ${event.caseTitle}` : ""}
                          </span>
                        </button>
                      ))}
                    </SearchResultSection>
                  )}

                  {deadlineSearchResults.length > 0 && (
                    <SearchResultSection title="Deadlines">
                      {deadlineSearchResults.map((deadline) => {
                        const dueDate = new Date(deadline.dueDate);
                        return (
                          <button
                            key={`${deadline.type}-${deadline.id}`}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => openSearchDeadline(deadline)}
                            className={`w-full px-3 py-2 text-left ${searchActiveIndex === caseSearchResults.length + eventSearchResults.length + deadlineSearchResults.indexOf(deadline) ? "bg-teal-50" : "hover:bg-slate-50"}`}
                          >
                            <span className="block truncate text-sm font-semibold text-slate-800">{deadline.title}</span>
                            <span className="block truncate text-xs text-slate-500">
                              {`${deadline.sourceLabel} · ${isNaN(dueDate.getTime()) ? "No date" : dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                              {deadline.caseTitle ? ` · ${deadline.caseTitle}` : ""}
                            </span>
                          </button>
                        );
                      })}
                    </SearchResultSection>
                  )}
                </div>
              ) : (
                <p className="px-3 py-3 text-sm text-slate-500">No cases, events, or deadlines found.</p>
              )}
            </div>
          )}
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
            <h1 className="truncate font-heading text-xl font-semibold tracking-tight text-slate-950">{periodLabel}</h1>
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
              <h1 className="truncate font-heading text-[26px] font-semibold tracking-tight text-slate-950">{periodLabel}</h1>
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

      {/* Legend — event categories (all hearing subtypes share one color) */}
      <div className="hidden md:flex items-center gap-4 px-8 pb-3 shrink-0 flex-wrap">
        {[
          { label: "Deadline",        cls: "bg-event-deadline" },
          { label: "Hearing",         cls: "bg-event-hearing" },
          { label: "Deposition",      cls: "bg-event-deposition" },
          { label: "Trial",           cls: "bg-event-trial" },
          { label: "Mediation",       cls: "bg-event-mediation" },
          { label: "Meeting / Other", cls: "bg-event-other" },
        ].map((item) => (
          <span key={item.label} className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <span className={`size-2.5 rounded-full ${item.cls}`} />
            {item.label}
          </span>
        ))}
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
            onDeleted={() => { bustCache(); void fetchEvents(); setSelectedEvent(null); }}
            onUpdated={() => { bustCache(); void fetchEvents(); setSelectedEvent(null); }}
          />
        )}
      </div>

      <EventModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        defaultStart={modalDefaultStart}
        googleConnected={googleConnected}
        onCreated={() => { bustCache(); void fetchEvents(); }}
      />
    </div>
  );
}
