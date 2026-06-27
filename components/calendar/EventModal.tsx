"use client";

import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { EventType, ConflictDetail } from "@/lib/google-calendar";
import { HEARING_SUBTYPES, HEARING_EVENT_TYPES } from "@/lib/google-calendar-payload";
import { Inbox, Send } from "lucide-react";
import type { DiscoveryDirection } from "@prisma/client";

type ModalEventType = EventType | "DISCOVERY";

const EVENT_TYPES: { value: ModalEventType; label: string }[] = [
  { value: "DEPOSITION",                 label: "Deposition" },
  { value: "TRIAL",                      label: "Trial" },
  { value: "DEADLINE",                   label: "Deadline" },
  { value: "DISCOVERY",                  label: "Discovery Deadline" },
  { value: "CONFERENCE",                 label: "Conference" },
  { value: "MEDIATION",                  label: "Mediation" },
  { value: "MEETING",                    label: "Meeting" },
  { value: "REMINDER",                   label: "Reminder" },
  { value: "OTHER",                      label: "Other" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  defaultStart?: Date;
  googleConnected: boolean;
  onCreated: () => void;
}

const DEFAULT_START = "09:00";
const DEFAULT_END   = "10:00";

function toDateInputValue(d: Date) {
  return d.toISOString().slice(0, 10);
}

function timeToMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(mins: number) {
  const clamped = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

interface CaseOption {
  id: string;
  title: string;
  caseNumber: string | null;
  status: string;
  county: string | null;
  court: string | null;
  countyId: string | null;
  courtId: string | null;
}

interface CountyOption {
  id: string;
  name: string;
  courts: { id: string; name: string }[];
}

interface DeptOption {
  id: string;
  name: string;
}

interface ResolvedRule {
  id: string;
  appearanceType: string | null;
  phoneNumber: string | null;
  bridge: string | null;
  password: string | null;
  remoteLink: string | null;
  requestRequired: boolean;
  requestContactEmail: string | null;
  requestNotes: string | null;
  requestDaysBefore: number | null;
}

export default function EventModal({ open, onClose, defaultStart, googleConnected, onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [titleManuallySet, setTitleManuallySet] = useState(false);
  const [eventType, setEventType] = useState<ModalEventType>("HEARING");
  const [discoveryDirection, setDiscoveryDirection] = useState<DiscoveryDirection | null>(null);
  const [date, setDate] = useState(toDateInputValue(defaultStart ?? new Date()));
  const [startTime, setStartTime] = useState(DEFAULT_START);
  const [endTime, setEndTime] = useState(DEFAULT_END);
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [caseId, setCaseId] = useState("");
  const [cases, setCases] = useState<CaseOption[]>([]);
  const [caseSearch, setCaseSearch] = useState("");
  const [caseDropdownOpen, setCaseDropdownOpen] = useState(false);
  const [caseHighlight, setCaseHighlight] = useState(-1);
  const caseDropdownRef = useRef<HTMLDivElement>(null);
  const [allDay, setAllDay] = useState(false);
  const [endDate, setEndDate] = useState(toDateInputValue(defaultStart ?? new Date()));
  const [autoTrialEnd, setAutoTrialEnd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ConflictDetail[]>([]);

  // In-person / remote appearance
  const [inPerson, setInPerson] = useState(false);

  // County / court / department selection (used when no case provides context, or to override)
  const [counties, setCounties] = useState<CountyOption[]>([]);
  const [selectedCountyId, setSelectedCountyId] = useState("");
  const [selectedCourtId, setSelectedCourtId] = useState("");
  const [departments, setDepartments] = useState<DeptOption[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState("");
  const [newDeptName, setNewDeptName] = useState("");
  const [addingDept, setAddingDept] = useState(false);
  const [deptLoading, setDeptLoading] = useState(false);

  // Hearing subtype
  const [subtype, setSubtype] = useState("");
  const [subtypeReason, setSubtypeReason] = useState("");

  // Resolved rule preview
  const [rule, setRule] = useState<ResolvedRule | null>(null);
  const [ruleLoading, setRuleLoading] = useState(false);

  const fetchedRef = useRef(false);

  // ── load cases + counties once ──────────────────────────────────────────────
  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      fetch("/api/cases").then((r) => r.json()).then((d) => setCases(d.cases ?? [])).catch(() => {});
      fetch("/api/counties").then((r) => r.json()).then((d) => setCounties(d.counties ?? [])).catch(() => {});
    }
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (caseDropdownRef.current && !caseDropdownRef.current.contains(e.target as Node)) {
        setCaseDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // ── reset on open ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      void Promise.resolve().then(() => {
        const d = toDateInputValue(defaultStart ?? new Date());
        const startT = defaultStart
          ? `${String(defaultStart.getHours()).padStart(2, "0")}:${String(defaultStart.getMinutes()).padStart(2, "0")}`
          : DEFAULT_START;
        const endT = defaultStart
          ? minutesToTime(defaultStart.getHours() * 60 + defaultStart.getMinutes() + 60)
          : DEFAULT_END;
        setTitle(""); setTitleManuallySet(false); setEventType("HEARING"); setDiscoveryDirection(null); setDate(d); setEndDate(d);
        setAutoTrialEnd(false); setStartTime(startT); setEndTime(endT);
        setAllDay(false); setLocation(""); setDescription(""); setCaseId("");
        setError(null); setConflicts([]);
        setInPerson(false);
        setSelectedCountyId(""); setSelectedCourtId(""); setSelectedDeptId("");
        setNewDeptName(""); setAddingDept(false);
        setDepartments([]); setRule(null);
        setSubtype(""); setSubtypeReason("");
      });
    }
  }, [open, defaultStart]);

  // ── load departments when court selected ────────────────────────────────────
  useEffect(() => {
    setSelectedDeptId("");
    setNewDeptName("");
    setAddingDept(false);
    setDepartments([]);
    if (!selectedCourtId) return;
    setDeptLoading(true);
    fetch(`/api/departments?courtId=${selectedCourtId}`)
      .then((r) => r.json())
      .then((d) => setDepartments(d.departments ?? []))
      .catch(() => {})
      .finally(() => setDeptLoading(false));
  }, [selectedCourtId]);

  // ── derive county/court context from linked case ─────────────────────────────
  const linkedCase = cases.find((c) => c.id === caseId) ?? null;
  const effectiveCountyId = selectedCountyId || linkedCase?.countyId || "";
  const effectiveCounty = counties.find((c) => c.id === effectiveCountyId);
  const availableCourts = effectiveCounty?.courts ?? [];
  const effectiveCourtId = selectedCourtId || linkedCase?.courtId || "";
  const effectiveCourt = availableCourts.find((c) => c.id === effectiveCourtId)
    ?? (linkedCase?.court ? { id: linkedCase.courtId ?? "", name: linkedCase.court } : null);

  // county/court names for rule lookup
  const countyName = effectiveCounty?.name ?? linkedCase?.county ?? null;
  const courtName  = effectiveCourt?.name ?? linkedCase?.court ?? null;
  const selectedDept = departments.find((d) => d.id === selectedDeptId);
  const deptName = selectedDept?.name ?? null;

  // ── auto-generate title from case + event type ──────────────────────────────
  const eventTypeLabel = EVENT_TYPES.find((t) => t.value === eventType)?.label ?? eventType;
  const subtypeLabel = subtype
    ? (HEARING_SUBTYPES.find((s) => s.value === subtype)?.label.replace(/ \([A-Z/ ]+\)$/, "") ?? subtype)
    : null;
  const caseName = linkedCase
    ? (eventType === "DISCOVERY"
      ? linkedCase.title.split(/\s+v\.?\s+/i)[0]?.trim() || linkedCase.title
      : linkedCase.title)
    : null;
  const autoTitle = caseName
    ? (eventType === "DISCOVERY"
      ? `${caseName} Discovery Due`
      : `${caseName} — ${subtypeLabel ?? eventTypeLabel}`)
    : subtypeLabel ?? eventTypeLabel;
  const effectiveTitle = titleManuallySet ? title : autoTitle;

  const filteredCases = cases
    .filter((c) => c.status !== "ARCHIVED" && c.status !== "CLOSED")
    .filter((c) => {
      const q = caseSearch.toLowerCase();
      return !q || c.title.toLowerCase().includes(q) || (c.caseNumber ?? "").toLowerCase().includes(q);
    });

  function selectCase(id: string) {
    setCaseId(id); setCaseSearch(""); setCaseDropdownOpen(false);
    setSelectedCountyId(""); setSelectedCourtId(""); setSelectedDeptId("");
  }

  function handleCaseKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCaseHighlight((h) => Math.min(h + 1, filteredCases.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCaseHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (caseHighlight >= 0 && caseHighlight < filteredCases.length) {
        selectCase(filteredCases[caseHighlight].id);
      }
    } else if (e.key === "Escape") {
      setCaseDropdownOpen(false);
    }
  }

  // ── look up rule whenever county/court/dept changes ─────────────────────────
  useEffect(() => {
    if (inPerson || !countyName) { setRule(null); return; }
    setRuleLoading(true);
    const params = new URLSearchParams();
    if (countyName) params.set("county", countyName);
    if (courtName)  params.set("court",  courtName);
    if (deptName)   params.set("department", deptName);
    fetch(`/api/court-hearing-rules?${params}`)
      .then((r) => r.json())
      .then((d) => setRule(d.rule ?? null))
      .catch(() => setRule(null))
      .finally(() => setRuleLoading(false));
  }, [inPerson, countyName, courtName, deptName]);

  // ── trial helpers ────────────────────────────────────────────────────────────
  function addDays(dateStr: string, days: number): string {
    const d = new Date(`${dateStr}T12:00:00`);
    d.setDate(d.getDate() + days);
    return toDateInputValue(d);
  }

  function handleEventTypeChange(newType: ModalEventType) {
    setEventType(newType);
    if (newType !== "DISCOVERY") setDiscoveryDirection(null);
    if (!HEARING_EVENT_TYPES.has(newType as EventType)) { setSubtype(""); setSubtypeReason(""); }
    if (newType === "TRIAL") {
      setAllDay(true); setEndDate(addDays(date, 7)); setAutoTrialEnd(true);
    } else if (eventType === "TRIAL") {
      setAllDay(false); setEndDate(date); setAutoTrialEnd(false);
    }
  }

  function handleDateChange(newDate: string) {
    setDate(newDate);
    if (autoTrialEnd) setEndDate(addDays(newDate, 7));
    else if (!allDay) setEndDate(newDate);
  }

  function handleStartChange(newStart: string) {
    const duration = timeToMinutes(endTime) > timeToMinutes(startTime)
      ? timeToMinutes(endTime) - timeToMinutes(startTime) : 60;
    setStartTime(newStart);
    setEndTime(minutesToTime(timeToMinutes(newStart) + duration));
  }

  function handleEndChange(newEnd: string) {
    const startMins = timeToMinutes(startTime);
    const endMins   = timeToMinutes(newEnd);
    setEndTime(endMins > startMins ? newEnd : minutesToTime(startMins + 60));
  }

  async function handleAddDept() {
    if (!newDeptName.trim() || !effectiveCourtId) return;
    setAddingDept(true);
    try {
      const res = await fetch("/api/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courtId: effectiveCourtId, name: newDeptName.trim() }),
      });
      if (res.ok) {
        const d = await res.json();
        setDepartments((prev) => {
          if (prev.find((x) => x.id === d.department.id)) return prev;
          return [...prev, d.department].sort((a, b) => a.name.localeCompare(b.name));
        });
        setSelectedDeptId(d.department.id);
        setNewDeptName("");
      }
    } catch { /* ignore */ } finally {
      setAddingDept(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Discovery flow — different validation + API
    if (eventType === "DISCOVERY") {
      if (!caseId)              { setError("Select a case for this discovery deadline."); return; }
      if (!discoveryDirection)  { setError("Select Received or Sent."); return; }
      if (!date)                { setError("Due date is required."); return; }
      setSaving(true); setError(null);
      try {
        const res = await fetch(`/api/cases/${caseId}/discovery`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            direction: discoveryDirection,
            overrideDueDate: date,
            notes: description || null,
          }),
        });
        if (!res.ok) { const j = await res.json(); setError(j.error ?? "Failed to create discovery deadline."); return; }
        onCreated();
        onClose();
      } catch {
        setError("Something went wrong. Please try again.");
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!effectiveTitle.trim()) { setError("Title is required."); return; }

    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const toNoonUTC = (dateStr: string) => {
      const d = new Date(`${dateStr}T00:00:00`);
      return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0)).toISOString();
    };
    const startISO = allDay ? toNoonUTC(date) : new Date(`${date}T${startTime}`).toISOString();
    const endISO   = allDay ? new Date(`${endDate}T23:59:59`).toISOString() : new Date(`${date}T${endTime}`).toISOString();

    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: effectiveTitle, description, start: startISO, end: endISO, timeZone,
          eventType,
          subtype: subtype || undefined,
          subtypeReason: subtypeReason || undefined,
          location,
          department: deptName ?? undefined,
          departmentId: selectedDeptId || undefined,
          caseId: caseId || undefined,
          allDay,
          inPerson,
          countyName: countyName ?? undefined,
          courtName: courtName ?? undefined,
        }),
      });
      if (!res.ok) { setError("Failed to create event. Please try again."); return; }
      const data = await res.json();
      onCreated();
      if (data.conflicts?.length > 0) {
        setConflicts(data.conflicts);
      } else {
        onClose();
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const selectedCounty = counties.find((c) => c.id === selectedCountyId);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="!max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Event</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-2">
          {!googleConnected && (
            <div className="rounded-md bg-muted border border-border px-3 py-2 text-xs text-muted-foreground">
              Events are saved to LitCal.{" "}
              <a href="/settings/calendar" className="underline">Connect Google Calendar</a>{" "}
              to also push them there.
            </div>
          )}

          {/* Title */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="event-title">Title</Label>
            <Input
              id="event-title"
              placeholder={autoTitle}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleManuallySet(e.target.value.length > 0);
              }}
              autoFocus
            />
            {!titleManuallySet && (
              <p className="text-xs text-slate-400">Auto-generated from case and event type. Type to override.</p>
            )}
          </div>

          {/* Event type */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="event-type">Event Type</Label>
            <select
              id="event-type"
              value={eventType}
              onChange={(e) => handleEventTypeChange(e.target.value as EventType)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {EVENT_TYPES.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          {/* Discovery flow — direction picker + due date */}
          {eventType === "DISCOVERY" && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label>Direction <span className="text-muted-foreground font-normal text-xs">(required)</span></Label>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    { dir: "RECEIVED" as DiscoveryDirection, icon: Inbox,  label: "Received", sub: "from opposing party", color: "amber" },
                    { dir: "SERVED"   as DiscoveryDirection, icon: Send,   label: "Sent",     sub: "to opposing party",  color: "teal"  },
                  ] as const).map(({ dir, icon: Icon, label, sub, color }) => (
                    <button
                      key={dir}
                      type="button"
                      onClick={() => setDiscoveryDirection(dir)}
                      className={`group flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all
                        ${discoveryDirection === dir
                          ? color === "amber" ? "border-amber-400 bg-amber-50" : "border-teal-400 bg-teal-50"
                          : "border-slate-200 hover:border-slate-300"}`}
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center
                        ${discoveryDirection === dir
                          ? color === "amber" ? "bg-amber-200" : "bg-teal-200"
                          : "bg-slate-100"}`}>
                        <Icon className={`w-4 h-4 ${discoveryDirection === dir
                          ? color === "amber" ? "text-amber-700" : "text-teal-700"
                          : "text-slate-500"}`} />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-semibold text-slate-900">{label}</p>
                        <p className="text-xs text-slate-500">{sub}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="disc-due">Response Due Date</Label>
                <Input id="disc-due" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                <p className="text-xs text-slate-400">Enter the deadline date directly — no need for the propounded date.</p>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="disc-notes">Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Textarea id="disc-notes" placeholder="Add notes..." value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
              </div>
            </>
          )}

          {/* Hearing subtype — shown only for hearing-category event types */}
          {eventType !== "DISCOVERY" && HEARING_EVENT_TYPES.has(eventType as EventType) && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="event-subtype">Hearing Type <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
              <select
                id="event-subtype"
                value={subtype}
                onChange={(e) => { setSubtype(e.target.value); setSubtypeReason(""); }}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">— Select type —</option>
                {HEARING_SUBTYPES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              {subtype === "OSC" && (
                <Input
                  placeholder='Reason — e.g. "Proof of Service" or "Dismissal"'
                  value={subtypeReason}
                  onChange={(e) => setSubtypeReason(e.target.value)}
                  className="h-9 text-sm mt-1"
                />
              )}
            </div>
          )}

          {/* Case — required for Discovery, optional otherwise */}
          {cases.filter((c) => c.status !== "ARCHIVED" && c.status !== "CLOSED").length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="event-case">
                Case{" "}
                <span className="text-muted-foreground font-normal">
                  {eventType === "DISCOVERY" ? "(required)" : "(optional)"}
                </span>
              </Label>
              <div ref={caseDropdownRef} className="relative min-w-0">
                <button
                  type="button"
                  onClick={() => { setCaseDropdownOpen((o) => !o); setCaseSearch(""); }}
                  className="flex h-9 w-full items-center rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-left overflow-hidden"
                >
                  <span className="truncate flex-1">
                    {caseId
                      ? (() => { const c = cases.find((c) => c.id === caseId); return c ? `${c.title}${c.caseNumber ? ` (#${c.caseNumber})` : ""}` : "Select..."; })()
                      : `— ${eventType === "DISCOVERY" ? "Select a case" : "No case"} —`}
                  </span>
                  <svg className="w-3.5 h-3.5 shrink-0 opacity-50 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
                {caseDropdownOpen && (
                  <div className="absolute left-0 bottom-full mb-1 z-50 w-full rounded-lg border border-slate-200 bg-white shadow-xl overflow-hidden">
                    <div className="p-2 border-b border-slate-100">
                      <input
                        autoFocus
                        value={caseSearch}
                        onChange={(e) => { setCaseSearch(e.target.value); setCaseHighlight(0); }}
                        onKeyDown={handleCaseKeyDown}
                        placeholder="Search cases..."
                        className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-teal-300 focus:ring-1 focus:ring-teal-200"
                      />
                    </div>
                    <div className="max-h-52 overflow-y-auto">
                      {eventType !== "DISCOVERY" && (
                        <button
                          type="button"
                          onClick={() => selectCase("")}
                          className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${!caseId ? "font-semibold text-teal-700" : "text-slate-700"}`}
                        >
                          — No case —
                        </button>
                      )}
                      {filteredCases.map((c, i) => (
                        <button
                          type="button"
                          key={c.id}
                          onClick={() => selectCase(c.id)}
                          className={`w-full px-3 py-2 text-left text-sm ${caseHighlight === i ? "bg-teal-50 text-teal-800" : "hover:bg-slate-50"} ${caseId === c.id ? "font-semibold text-teal-700" : "text-slate-700"}`}
                        >
                          {c.title}{c.caseNumber ? ` (#${c.caseNumber})` : ""}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* In-person checkbox — hidden for Discovery */}
          {eventType !== "DISCOVERY" && <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={inPerson}
              onChange={(e) => setInPerson(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 accent-slate-900"
            />
            <span className="text-sm text-slate-700">In-person appearance</span>
          </label>}

          {/* County / Court / Department — shown only for remote, not for Discovery */}
          {eventType !== "DISCOVERY" && !inPerson && (
            <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Court Location</p>

              {/* County */}
              {counties.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="event-county" className="text-xs">County <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <select
                    id="event-county"
                    value={selectedCountyId || (linkedCase?.countyId ?? "")}
                    onChange={(e) => { setSelectedCountyId(e.target.value); setSelectedCourtId(""); setSelectedDeptId(""); }}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    disabled={!!linkedCase?.countyId && !selectedCountyId}
                  >
                    <option value="">— Select county —</option>
                    {counties.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  {linkedCase?.county && !selectedCountyId && (
                    <p className="text-[11px] text-slate-400">From linked case: {linkedCase.county}</p>
                  )}
                </div>
              )}

              {/* Court */}
              {availableCourts.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="event-court" className="text-xs">Courthouse <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <select
                    id="event-court"
                    value={selectedCourtId || (linkedCase?.courtId ?? "")}
                    onChange={(e) => { setSelectedCourtId(e.target.value); setSelectedDeptId(""); }}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    disabled={!!linkedCase?.courtId && !selectedCourtId}
                  >
                    <option value="">— Select courthouse —</option>
                    {availableCourts.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  {linkedCase?.court && !selectedCourtId && (
                    <p className="text-[11px] text-slate-400">From linked case: {linkedCase.court}</p>
                  )}
                </div>
              )}

              {/* Department */}
              {effectiveCourtId && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="event-dept" className="text-xs">Department <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  {deptLoading ? (
                    <p className="text-xs text-slate-400">Loading…</p>
                  ) : (
                    <select
                      id="event-dept"
                      value={selectedDeptId}
                      onChange={(e) => {
                        if (e.target.value === "__add__") { setNewDeptName(""); }
                        else setSelectedDeptId(e.target.value);
                      }}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="">— Select department —</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>Dept. {d.name}</option>
                      ))}
                      <option value="__add__" className="font-semibold text-teal-700">+ Add new department</option>
                    </select>
                  )}

                  {/* Inline add-department */}
                  {selectedDeptId === "__add__" && (
                    <div className="flex gap-2 mt-1">
                      <Input
                        placeholder="e.g. 10A"
                        value={newDeptName}
                        onChange={(e) => setNewDeptName(e.target.value)}
                        className="h-8 text-sm"
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleAddDept(); } }}
                      />
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 shrink-0"
                        disabled={!newDeptName.trim() || addingDept}
                        onClick={() => void handleAddDept()}
                      >
                        Add
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 shrink-0"
                        onClick={() => { setSelectedDeptId(""); setNewDeptName(""); }}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Rule preview */}
              {!inPerson && countyName && (
                <div className="mt-1">
                  {ruleLoading ? (
                    <p className="text-[11px] text-slate-400">Looking up appearance info…</p>
                  ) : rule ? (
                    <div className="rounded-md border border-teal-200 bg-teal-50 px-3 py-2.5 text-xs flex flex-col gap-1.5">
                      <p className="font-semibold text-teal-800">Remote Appearance</p>
                      {rule.appearanceType && <p className="text-teal-700">Type: <span className="font-medium">{rule.appearanceType}</span></p>}
                      {rule.remoteLink && <p className="text-teal-700 break-all">Link: <a href={rule.remoteLink} target="_blank" rel="noopener noreferrer" className="underline font-medium">{rule.remoteLink}</a></p>}
                      {rule.requestContactEmail && <p className="text-teal-700">Request email: <span className="font-medium">{rule.requestContactEmail}</span></p>}
                      {rule.phoneNumber && <p className="text-teal-700">Phone: <span className="font-medium">{rule.phoneNumber}</span></p>}
                      {rule.bridge && <p className="text-teal-700">Bridge: <span className="font-mono font-medium">{rule.bridge}</span></p>}
                      {rule.password && <p className="text-teal-700">Password: <span className="font-mono font-medium">{rule.password}</span></p>}
                      {rule.requestNotes && <p className="text-teal-600 italic">{rule.requestNotes}</p>}
                      {rule.requestRequired && (
                        <p className="mt-0.5 font-semibold text-amber-700">
                          Request required — task will be auto-created {rule.requestDaysBefore ?? 7} days before.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs flex flex-col gap-1">
                      <p className="font-semibold text-amber-800">No remote appearance info on file for this location.</p>
                      <p className="text-amber-700">
                        Your event will still be created.{" "}
                        <a href="/settings/court-rules" target="_blank" rel="noopener noreferrer" className="underline font-medium hover:text-amber-900">
                          Submit a request
                        </a>{" "}
                        and we&apos;ll add the rule — your calendar will update automatically.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* In-person address (optional) — not for Discovery */}
          {eventType !== "DISCOVERY" && inPerson && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="event-location">Courthouse Address <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                id="event-location"
                placeholder="e.g. Stanley Mosk Courthouse, Los Angeles"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
          )}

          {/* Date / time / notes — hidden for Discovery (uses its own fields above) */}
          {eventType !== "DISCOVERY" && <>
            <div className={`grid gap-3 ${allDay ? "grid-cols-2" : "grid-cols-1"}`}>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="event-date">{allDay ? "Start date" : "Date"}</Label>
                <Input id="event-date" type="date" value={date} onChange={(e) => handleDateChange(e.target.value)} />
              </div>
              {allDay && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="event-end-date">End date</Label>
                  <Input
                    id="event-end-date"
                    type="date"
                    value={endDate}
                    min={date}
                    onChange={(e) => { setEndDate(e.target.value); setAutoTrialEnd(false); }}
                  />
                </div>
              )}
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => {
                  setAllDay(e.target.checked);
                  if (!e.target.checked) { setEndDate(date); setAutoTrialEnd(false); }
                }}
                className="h-4 w-4 rounded border-slate-300 accent-slate-900"
              />
              <span className="text-sm text-slate-700">All day</span>
            </label>

            {!allDay && (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="event-start">Start time</Label>
                  <Input id="event-start" type="time" value={startTime} onChange={(e) => handleStartChange(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="event-end">End time</Label>
                  <Input id="event-end" type="time" value={endTime} onChange={(e) => handleEndChange(e.target.value)} />
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="event-desc">Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                id="event-desc"
                placeholder="Add notes or details..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>
          </>}

          {conflicts.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-3 text-xs flex flex-col gap-2">
              <p className="font-semibold text-amber-900">Event saved — scheduling conflict detected</p>
              {conflicts.map((c) => (
                <div key={c.eventId} className="text-amber-800 leading-5">
                  <span className="font-semibold">{c.attorneyName}</span> is already assigned to{" "}
                  <span className="font-semibold">{c.title}</span>{" "}
                  ({new Date(c.startTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  {" – "}
                  {new Date(c.endTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })},{" "}
                  {new Date(c.startTime).toLocaleDateString("en-US", { month: "short", day: "numeric" })})
                </div>
              ))}
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}

          <DialogFooter className="mt-2">
            <Button type="button" variant="ghost" onClick={onClose}>{conflicts.length > 0 ? "Close" : "Cancel"}</Button>
            {conflicts.length === 0 && (
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Create Event"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
