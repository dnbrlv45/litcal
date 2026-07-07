"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { X, MapPin, Calendar, Clock, Pencil, Trash2, Check, Briefcase, ChevronRight, FileText, Sparkles, AlertTriangle, Building2, Zap, Link2, Video, Phone, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";
import type { CalEvent, EventType, ConflictDetail } from "@/lib/google-calendar";
import { eventColors } from "@/lib/google-calendar";
import { eventSupportsRemoteAppearance } from "@/lib/google-calendar-payload";

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  HEARING:                    "Hearing",
  DEPOSITION:                 "Deposition",
  TRIAL:                      "Trial",
  CONFERENCE:                 "Conference",
  MEDIATION:                  "Mediation",
  MEETING:                    "Meeting",
  DEADLINE:                   "Deadline",
  COURT_CALL:                 "Court Call",
  CASE_MANAGEMENT_CONFERENCE: "Case Management Conference",
  REMINDER:                   "Reminder",
  OTHER:                      "Other",
};

const EVENT_TYPES: EventType[] = ["HEARING","DEPOSITION","TRIAL","DEADLINE","COURT_CALL","CONFERENCE","MEDIATION","CASE_MANAGEMENT_CONFERENCE","MEETING","REMINDER","OTHER"];

interface Props {
  event: CalEvent | null;
  onClose: () => void;
  onDeleted: () => void;
  onUpdated: () => void;
}

function toDateInputValue(d: Date) {
  return d.toISOString().slice(0, 10);
}
function toTimeInputValue(d: Date) {
  return d.toTimeString().slice(0, 5);
}

const URL_PATTERN = /(https?:\/\/[^\s<>"']+)/g;

function linkifyText(text: string) {
  // Split on a capturing group so matched URLs land at odd indices —
  // avoids re-testing with a stateful global regex.
  const parts = text.split(URL_PATTERN);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="text-teal-700 underline decoration-teal-200 underline-offset-2 hover:text-teal-900 break-all"
      >
        {part}
      </a>
    ) : (
      part
    )
  );
}

interface CaseOption { id: string; title: string; caseNumber: string | null; status: string; }

export default function EventDetailPanel({ event, onClose, onDeleted, onUpdated }: Props) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [eventType, setEventType] = useState<EventType>("OTHER");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [department, setDepartment] = useState("");
  const [description, setDescription] = useState("");
  const [caseId, setCaseId] = useState("");
  const [cases, setCases] = useState<CaseOption[]>([]);
  const [caseSearch, setCaseSearch] = useState("");
  const [caseDropdownOpen, setCaseDropdownOpen] = useState(false);
  const [caseHighlight, setCaseHighlight] = useState(-1);
  const caseDropdownRef = useRef<HTMLDivElement>(null);
  const [allDay, setAllDay] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ConflictDetail[]>([]);

  // Generated deadlines
  interface GeneratedItem {
    ruleKey: string;
    ruleName: string;
    offsetDays: number | null;
    offsetDirection: string | null;
    userModified: boolean;
    generatedEvent: { id: string; title: string; date: string; eventType: string } | null;
    generatedTask:  { id: string; title: string; dueDate: string | null; status: string; priority: string } | null;
  }
  interface GeneratedFrom {
    ruleKey: string;
    ruleName: string;
    offsetDays: number | null;
    userModified: boolean;
    triggerEvent: { id: string; title: string; date: string; eventType: string };
  }
  const [generatedDeadlines, setGeneratedDeadlines] = useState<GeneratedItem[]>([]);
  const [generatedFrom, setGeneratedFrom] = useState<GeneratedFrom | null>(null);

  // Live rule lookup — used when the event was created before rule matching existed
  interface LiveRule {
    appearanceType: string | null;
    remoteLink: string | null;
    phoneNumber: string | null;
    bridge: string | null;
    password: string | null;
    requestRequired: boolean;
    requestContactEmail: string | null;
    requestNotes: string | null;
  }
  const [liveRule, setLiveRule] = useState<LiveRule | null>(null);

  useEffect(() => {
    fetch("/api/cases").then((r) => r.json()).then((d) => setCases(d.cases ?? [])).catch(() => {});
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

  useEffect(() => {
    if (event?.id) {
      void Promise.resolve().then(() => {
        setEditing(false);
        setError(null);
        setConflicts([]);
      });
    }
  }, [event?.id]);

  const fetchGenerated = useCallback(async (eventId: string) => {
    try {
      const res = await fetch(`/api/calendar/events/${eventId}/generated`);
      if (!res.ok) return;
      const data = await res.json();
      setGeneratedDeadlines(data.generated ?? []);
      setGeneratedFrom(data.generatedFrom ?? null);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (event?.id) {
      setGeneratedDeadlines([]);
      setGeneratedFrom(null);
      void fetchGenerated(event.id);
    }
  }, [event?.id, fetchGenerated]);

  // If the event has no stored rule data, look one up live from the case's county/court
  useEffect(() => {
    setLiveRule(null);
    if (!event || event.inPerson) return;
    if (!eventSupportsRemoteAppearance(event.eventType)) return;
    // Already has stored data — no need for live lookup
    if (event.appearanceType || event.remoteLink || event.phoneNumber || event.requestContactEmail) return;

    const county = event.caseCounty;
    const court  = event.caseCourt;
    if (!county) return;

    const params = new URLSearchParams({ county });
    if (court)            params.set("court",      court);
    if (event.department) params.set("department", event.department);

    fetch(`/api/court-hearing-rules?${params}`)
      .then((r) => r.json())
      .then((d) => setLiveRule(d.rule ?? null))
      .catch(() => {});
  }, [event?.id, event?.eventType, event?.inPerson, event?.appearanceType, event?.remoteLink, event?.phoneNumber, event?.requestContactEmail, event?.caseCounty, event?.caseCourt, event?.department]);

  const filteredCases = cases
    .filter((c) => (c.status !== "ARCHIVED" && c.status !== "CLOSED") || c.id === caseId)
    .filter((c) => {
      const q = caseSearch.toLowerCase();
      return !q || c.title.toLowerCase().includes(q) || (c.caseNumber ?? "").toLowerCase().includes(q);
    });

  function selectCase(id: string) {
    setCaseId(id); setCaseSearch(""); setCaseDropdownOpen(false);
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

  function startEdit() {
    if (!event) return;
    setTitle(event.title);
    setEventType(event.eventType);
    setAllDay(event.allDay);
    setDate(toDateInputValue(event.start));
    setStartTime(toTimeInputValue(event.start));
    setEndTime(toTimeInputValue(event.end));
    setLocation(event.location ?? "");
    setDepartment(event.department ?? "");
    setDescription(event.description ?? "");
    setCaseId(event.caseId ?? "");
    setCaseSearch("");
    setCaseDropdownOpen(false);
    setError(null);
    setEditing(true);
  }

  async function handleDelete() {
    if (!event) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/calendar/events/${event.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      onDeleted();
      onClose();
    } catch {
      setError("Failed to delete event.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!event || !title.trim()) { setError("Title is required."); return; }
    const startISO = allDay ? new Date(`${date}T00:00:00`).toISOString() : new Date(`${date}T${startTime}`).toISOString();
    const endISO   = allDay ? new Date(`${date}T23:59:59`).toISOString() : new Date(`${date}T${endTime}`).toISOString();
    if (!allDay && new Date(endISO) <= new Date(startISO)) { setError("End time must be after start time."); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/calendar/events/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          start: startISO,
          end: endISO,
          eventType,
          location,
          department,
          caseId: caseId || null,
          allDay,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      onUpdated();
      void fetchGenerated(event.id);
      if (data.conflicts?.length > 0) {
        setConflicts(data.conflicts);
        setEditing(false);
      } else {
        onClose();
      }
    } catch {
      setError("Failed to save event.");
    } finally {
      setSaving(false);
    }
  }

  if (!event) return null;

  const colors = eventColors(event.eventType);

  return (
    <div className="ml-5 w-[360px] shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-end px-5 py-4 shrink-0">
        <div className="flex items-center gap-1">
          {!editing && (
            <>
              <button onClick={startEdit} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-950">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button onClick={handleDelete} disabled={deleting} className="p-1.5 rounded-lg hover:bg-rose-50 transition-colors text-slate-500 hover:text-rose-600">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-950">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {!editing ? (
          <div className="px-6 pb-6 flex flex-col gap-5">
            {/* Title + type */}
            <div className="flex flex-col gap-2">
              <h2 className="text-2xl font-bold leading-tight text-slate-950">{event.title}</h2>
              <span className={`self-start text-sm font-semibold px-2.5 py-1 rounded-full ${colors.bg} ${colors.text}`}>
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${colors.dot} mr-1.5 align-middle`} />
                {EVENT_TYPE_LABELS[event.eventType]}
              </span>
            </div>

            {/* Date / time */}
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 text-sm">
              <div className="flex items-center gap-3 text-slate-700">
                <Calendar className="w-4 h-4 shrink-0" />
                <span>{event.start.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</span>
              </div>
              {!event.allDay && (
                <div className="flex items-center gap-3 text-slate-700">
                  <Clock className="w-4 h-4 shrink-0" />
                  <span>
                    {event.start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    {" – "}
                    {event.end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </span>
                </div>
              )}
            </div>

            {/* Conflict warning */}
            {(conflicts.length > 0 || event.hasConflict) && (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-3 text-xs flex flex-col gap-2">
                <p className="flex items-center gap-1.5 font-semibold text-amber-900">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  Scheduling conflict
                </p>
                {conflicts.length > 0 ? conflicts.map((c) => (
                  <div key={c.eventId} className="text-amber-800 leading-5">
                    <span className="font-semibold">{c.attorneyName}</span> is also assigned to{" "}
                    <span className="font-semibold">{c.title}</span>{" "}
                    ({new Date(c.startTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    {" – "}
                    {new Date(c.endTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })},{" "}
                    {new Date(c.startTime).toLocaleDateString("en-US", { month: "short", day: "numeric" })})
                  </div>
                )) : (
                  <p className="text-amber-800 leading-5">
                    This event overlaps with another event assigned to the same attorney.
                  </p>
                )}
              </div>
            )}

            {/* Location */}
            {event.location && (
              <div className="flex items-start gap-3 border-b border-slate-200 pb-5 text-sm">
                <MapPin className="w-4 h-4 shrink-0 text-slate-500 mt-0.5" />
                <div className="flex flex-col gap-0.5">
                  <span className="text-slate-800">{event.location}</span>
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(event.location)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-teal-700 hover:text-teal-800"
                  >
                    Directions
                  </a>
                </div>
              </div>
            )}

            {/* Department */}
            {event.department && (
              <div className="flex items-start gap-3 border-b border-slate-200 pb-5 text-sm">
                <Building2 className="w-4 h-4 shrink-0 text-slate-500 mt-0.5" />
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Department</span>
                  <span className="text-slate-800">{event.department}</span>
                </div>
              </div>
            )}

            {/* Remote Appearance */}
            {(() => {
              if (!eventSupportsRemoteAppearance(event.eventType)) return null;
              const appearance = {
                appearanceType:     event.appearanceType     ?? liveRule?.appearanceType     ?? null,
                remoteLink:         event.remoteLink         ?? liveRule?.remoteLink         ?? null,
                phoneNumber:        event.phoneNumber        ?? liveRule?.phoneNumber        ?? null,
                bridge:             event.bridge             ?? liveRule?.bridge             ?? null,
                remotePassword:     event.remotePassword     ?? liveRule?.password           ?? null,
                requestRequired:    event.requestRequired    ?? liveRule?.requestRequired    ?? false,
                requestContactEmail: event.requestContactEmail ?? liveRule?.requestContactEmail ?? null,
                requestNotes:       event.requestNotes       ?? liveRule?.requestNotes       ?? null,
              };
              const hasAny = appearance.appearanceType || appearance.remoteLink
                || appearance.phoneNumber || appearance.requestContactEmail;
              if (event.inPerson || !hasAny) return null;
              return (
                <div className="flex flex-col gap-3 border-b border-slate-200 pb-5">
                  <div className="flex items-center gap-2">
                    <Video className="w-4 h-4 text-slate-500" />
                    <span className="text-sm font-semibold text-slate-950">Remote Appearance</span>
                    {appearance.requestRequired && (
                      <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                        Request Required
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 text-sm">
                    {appearance.appearanceType && (
                      <div className="flex items-center gap-2 text-slate-600">
                        <span className="w-20 shrink-0 text-xs font-medium text-slate-400 uppercase tracking-wide">Type</span>
                        <span className="text-slate-800">{appearance.appearanceType}</span>
                      </div>
                    )}
                    {appearance.remoteLink && (
                      <div className="flex items-start gap-2 text-slate-600">
                        <span className="w-20 shrink-0 text-xs font-medium text-slate-400 uppercase tracking-wide pt-0.5">Link</span>
                        <a
                          href={appearance.remoteLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-teal-700 hover:text-teal-800 font-semibold break-all"
                        >
                          Join <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      </div>
                    )}
                    {appearance.requestContactEmail && (
                      <div className="flex items-start gap-2 text-slate-600">
                        <span className="w-20 shrink-0 text-xs font-medium text-slate-400 uppercase tracking-wide pt-0.5">Request</span>
                        <a
                          href={`mailto:${appearance.requestContactEmail}`}
                          className="text-teal-700 hover:text-teal-800 font-semibold break-all"
                        >
                          {appearance.requestContactEmail}
                        </a>
                      </div>
                    )}
                    {appearance.requestNotes && (
                      <div className="flex items-start gap-2 text-slate-600">
                        <span className="w-20 shrink-0 text-xs font-medium text-slate-400 uppercase tracking-wide pt-0.5">Notes</span>
                        <span className="text-slate-600 leading-5">{appearance.requestNotes}</span>
                      </div>
                    )}
                    {appearance.phoneNumber && (
                      <div className="flex items-center gap-2 text-slate-600">
                        <span className="w-20 shrink-0 text-xs font-medium text-slate-400 uppercase tracking-wide">Phone</span>
                        <a href={`tel:${appearance.phoneNumber}`} className="text-teal-700 hover:text-teal-800 font-semibold flex items-center gap-1">
                          <Phone className="w-3 h-3" />{appearance.phoneNumber}
                        </a>
                      </div>
                    )}
                    {appearance.bridge && (
                      <div className="flex items-center gap-2 text-slate-600">
                        <span className="w-20 shrink-0 text-xs font-medium text-slate-400 uppercase tracking-wide">Bridge</span>
                        <span className="text-slate-800 font-mono">{appearance.bridge}</span>
                      </div>
                    )}
                    {appearance.remotePassword && (
                      <div className="flex items-center gap-2 text-slate-600">
                        <span className="w-20 shrink-0 text-xs font-medium text-slate-400 uppercase tracking-wide">Password</span>
                        <span className="text-slate-800 font-mono">{appearance.remotePassword}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
            {event.inPerson && (
              <div className="flex items-center gap-3 border-b border-slate-200 pb-5 text-sm text-slate-500">
                <MapPin className="w-4 h-4 shrink-0" />
                <span className="italic">In-person appearance</span>
              </div>
            )}

            {/* Case link */}
            {event.caseId && event.caseTitle && (
              <div className="border-b border-slate-200">
                <Link href={`/cases/${event.caseId}`} className="flex items-center gap-3 py-4 text-sm group">
                  <Briefcase className="w-4 h-4 shrink-0 text-slate-500" />
                  <span className="flex-1">
                    <span className="block text-xs text-slate-500">Case</span>
                    <span className="font-semibold text-slate-900 group-hover:text-teal-800">
                      {event.caseTitle}
                      {event.caseNumber && <span className="ml-1.5 font-normal text-slate-500">#{event.caseNumber}</span>}
                    </span>
                  </span>
                  <ChevronRight className="size-4 text-slate-400" />
                </Link>
              </div>
            )}

            {/* Auto-generated from */}
            {generatedFrom && (
              <div className="flex items-start gap-3 rounded-lg border border-violet-200 bg-violet-50/60 px-3 py-3 text-xs">
                <Zap className="w-3.5 h-3.5 shrink-0 text-violet-600 mt-0.5" />
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold text-violet-900">Auto-generated deadline</span>
                  <span className="text-violet-700">
                    {generatedFrom.offsetDays} days before{" "}
                    <Link href={`#`} className="font-semibold hover:underline">
                      {generatedFrom.triggerEvent.title}
                    </Link>
                    {" "}({new Date(generatedFrom.triggerEvent.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })})
                  </span>
                  {generatedFrom.userModified && (
                    <span className="text-violet-500 italic">Date manually adjusted</span>
                  )}
                </div>
              </div>
            )}

            {/* Notes */}
            {event.description && (
              <div className="flex flex-col gap-2 border-b border-slate-200 pb-5">
                <span className="text-sm font-semibold text-slate-950">Case Notes</span>
                <p className="text-sm leading-6 text-slate-600 whitespace-pre-wrap">{linkifyText(event.description)}</p>
              </div>
            )}

            {/* Generated deadlines (shown for trigger events) */}
            {generatedDeadlines.length > 0 && (
              <div className="flex flex-col gap-3 border-b border-slate-200 pb-5">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-violet-600" />
                  <span className="text-sm font-semibold text-slate-950">Generated Deadlines</span>
                </div>
                <div className="flex flex-col gap-2">
                  {generatedDeadlines.map((item) => {
                    const deadline = item.generatedEvent ?? item.generatedTask;
                    if (!deadline) return null;
                    const dateStr = item.generatedEvent
                      ? new Date(item.generatedEvent.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                      : item.generatedTask?.dueDate
                        ? new Date(item.generatedTask.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                        : null;
                    return (
                      <div key={item.ruleKey} className="flex items-start gap-2.5 rounded-lg border border-violet-100 bg-violet-50/40 px-3 py-2.5">
                        <Link2 className="w-3.5 h-3.5 shrink-0 text-violet-500 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-slate-900 truncate">{item.ruleName}</span>
                            {item.generatedTask && (
                              <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">Task</span>
                            )}
                            {item.userModified && (
                              <span className="text-[10px] text-slate-400 italic">edited</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                            {item.offsetDays && (
                              <span>{item.offsetDays} days {item.offsetDirection}</span>
                            )}
                            {dateStr && <span>· {dateStr}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="rounded-lg border border-teal-100 bg-teal-50/70 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                  <Sparkles className="size-4 text-teal-700" />
                  AI Summary
                </span>
                <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-semibold text-teal-800">Beta</span>
              </div>
              <p className="text-xs leading-5 text-slate-600">
                Review upcoming obligations, court appearance details, and related case notes before this event.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Link
                href={event.caseId ? `/cases/${event.caseId}` : "/cases"}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 text-sm font-semibold text-white hover:bg-slate-800"
              >
                <FileText className="size-4" />
                Open Case
              </Link>
              <Button variant="outline" className="h-10 border-slate-200 bg-white">More</Button>
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        ) : (
          <form onSubmit={handleSave} className="px-5 py-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ep-title">Title</Label>
              <Input id="ep-title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ep-type">Event Type</Label>
              <select
                id="ep-type"
                value={eventType}
                onChange={(e) => setEventType(e.target.value as EventType)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {EVENT_TYPES.map((t) => (
                  <option key={t} value={t}>{EVENT_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>

            {cases.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ep-case">Case</Label>
                <div ref={caseDropdownRef} className="relative min-w-0">
                  <button
                    type="button"
                    id="ep-case"
                    onClick={() => { setCaseDropdownOpen((o) => !o); setCaseSearch(""); }}
                    className="flex h-9 w-full items-center rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-left overflow-hidden"
                  >
                    <span className="truncate flex-1">
                      {caseId
                        ? (() => { const c = cases.find((c) => c.id === caseId); return c ? `${c.title}${c.caseNumber ? ` (#${c.caseNumber})` : ""}` : "Select..."; })()
                        : "— No case —"}
                    </span>
                    <svg className="w-3.5 h-3.5 shrink-0 opacity-50 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {caseDropdownOpen && (
                    <div className="relative left-0 mt-1 z-50 w-full rounded-lg border border-slate-200 bg-white shadow-xl overflow-hidden">
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
                        <button
                          type="button"
                          onClick={() => selectCase("")}
                          className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${!caseId ? "font-semibold text-teal-700" : "text-slate-700"}`}
                        >
                          — No case —
                        </button>
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

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ep-date">Date</Label>
              <Input id="ep-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 accent-slate-900"
              />
              <span className="text-sm text-slate-700">All day</span>
            </label>

            {!allDay && (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ep-start">Start</Label>
                  <Input id="ep-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ep-end">End</Label>
                  <Input id="ep-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ep-loc">Location</Label>
              <Input id="ep-loc" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Optional" />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ep-department">Department</Label>
              <Input id="ep-department" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Optional" />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ep-desc">Notes</Label>
              <Textarea id="ep-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Optional" />
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <div className="flex gap-2 pt-1">
              <Button type="button" variant="ghost" size="sm" className="flex-1" onClick={() => { setEditing(false); setError(null); setConflicts([]); }}>
                Cancel
              </Button>
              <Button type="submit" size="sm" className="flex-1" disabled={saving}>
                <Check className="w-3.5 h-3.5 mr-1" />
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
