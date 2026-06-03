"use client";

import { useState, useEffect } from "react";
import { X, MapPin, Calendar, Clock, Pencil, Trash2, Check, Briefcase, ChevronRight, FileText, Sparkles, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";
import type { CalEvent, EventType, ConflictDetail } from "@/lib/google-calendar";
import { EVENT_TYPE_COLORS } from "@/lib/google-calendar";

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  HEARING: "Hearing",
  DEPOSITION: "Deposition",
  TRIAL: "Trial",
  CONFERENCE: "Conference",
  MEDIATION: "Mediation",
  MEETING: "Meeting",
  DEADLINE: "Deadline",
  REMINDER: "Reminder",
  OTHER: "Other",
};

const EVENT_TYPES: EventType[] = ["HEARING","DEPOSITION","TRIAL","CONFERENCE","MEDIATION","MEETING","DEADLINE","REMINDER","OTHER"];

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

interface CaseOption { id: string; title: string; caseNumber: string | null; }

export default function EventDetailPanel({ event, onClose, onDeleted, onUpdated }: Props) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [eventType, setEventType] = useState<EventType>("OTHER");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [caseId, setCaseId] = useState("");
  const [cases, setCases] = useState<CaseOption[]>([]);
  const [allDay, setAllDay] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ConflictDetail[]>([]);

  useEffect(() => {
    fetch("/api/cases").then((r) => r.json()).then((d) => setCases(d.cases ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (event) {
      setEditing(false);
      setError(null);
      setConflicts([]);
    }
  }, [event?.id]);

  function startEdit() {
    if (!event) return;
    setTitle(event.title);
    setEventType(event.eventType);
    setAllDay(event.allDay);
    setDate(toDateInputValue(event.start));
    setStartTime(toTimeInputValue(event.start));
    setEndTime(toTimeInputValue(event.end));
    setLocation(event.location ?? "");
    setDescription(event.description ?? "");
    setCaseId(event.caseId ?? "");
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
        body: JSON.stringify({ title, description, start: startISO, end: endISO, eventType, location, caseId: caseId || null, allDay }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      onUpdated();
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

  const colors = EVENT_TYPE_COLORS[event.eventType];

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

            {/* Case link */}
            {event.caseId && event.caseTitle && (
              <div className="border-b border-slate-200">
                <Link href={`/cases/${event.caseId}`} className="flex items-center gap-3 py-4 text-sm group">
                  <Briefcase className="w-4 h-4 shrink-0 text-slate-500" />
                  <span className="flex-1">
                    <span className="block text-xs text-slate-500">Case</span>
                    <span className="font-semibold text-slate-900 group-hover:text-teal-800">{event.caseTitle}</span>
                  </span>
                  <ChevronRight className="size-4 text-slate-400" />
                </Link>
              </div>
            )}

            {/* Notes */}
            {event.description && (
              <div className="flex flex-col gap-2 border-b border-slate-200 pb-5">
                <span className="text-sm font-semibold text-slate-950">Case Notes</span>
                <p className="text-sm leading-6 text-slate-600 whitespace-pre-wrap">{event.description}</p>
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
                <select
                  id="ep-case"
                  value={caseId}
                  onChange={(e) => setCaseId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">— No case —</option>
                  {cases.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}{c.caseNumber ? ` (#${c.caseNumber})` : ""}
                    </option>
                  ))}
                </select>
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
