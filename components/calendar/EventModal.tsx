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

const EVENT_TYPES: { value: EventType; label: string }[] = [
  { value: "HEARING",                    label: "Hearing" },
  { value: "DEPOSITION",                 label: "Deposition" },
  { value: "TRIAL",                      label: "Trial" },
  { value: "DEADLINE",                   label: "Deadline" },
  { value: "COURT_CALL",                 label: "Court Call" },
  { value: "CONFERENCE",                 label: "Conference" },
  { value: "MEDIATION",                  label: "Mediation" },
  { value: "CASE_MANAGEMENT_CONFERENCE", label: "Case Management Conference" },
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

// "HH:MM" → minutes since midnight
function timeToMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// minutes since midnight → "HH:MM"
function minutesToTime(mins: number) {
  const clamped = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

interface CaseOption { id: string; title: string; caseNumber: string | null; status: string; }

export default function EventModal({ open, onClose, defaultStart, googleConnected, onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [eventType, setEventType] = useState<EventType>("HEARING");
  const [date, setDate] = useState(toDateInputValue(defaultStart ?? new Date()));
  const [startTime, setStartTime] = useState(DEFAULT_START);
  const [endTime, setEndTime] = useState(DEFAULT_END);
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [caseId, setCaseId] = useState("");
  const [cases, setCases] = useState<CaseOption[]>([]);
  const [allDay, setAllDay] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ConflictDetail[]>([]);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      fetch("/api/cases").then((r) => r.json()).then((d) => setCases(d.cases ?? [])).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (open) {
      setTitle("");
      setEventType("HEARING");
      setDate(toDateInputValue(defaultStart ?? new Date()));
      setStartTime(DEFAULT_START);
      setEndTime(DEFAULT_END);
      setAllDay(false);
      setLocation("");
      setDescription("");
      setCaseId("");
      setError(null);
      setConflicts([]);
    }
  }, [open, defaultStart]);

  function handleStartChange(newStart: string) {
    const oldStartMins = timeToMinutes(startTime);
    const oldEndMins   = timeToMinutes(endTime);
    const duration     = oldEndMins > oldStartMins ? oldEndMins - oldStartMins : 60;
    const newStartMins = timeToMinutes(newStart);
    setStartTime(newStart);
    setEndTime(minutesToTime(newStartMins + duration));
  }

  function handleEndChange(newEnd: string) {
    const startMins = timeToMinutes(startTime);
    const endMins   = timeToMinutes(newEnd);
    // If end <= start, push end to start + 1 hour
    setEndTime(endMins > startMins ? newEnd : minutesToTime(startMins + 60));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError("Title is required."); return; }

    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const startISO = allDay ? new Date(`${date}T00:00:00`).toISOString() : new Date(`${date}T${startTime}`).toISOString();
    const endISO   = allDay ? new Date(`${date}T23:59:59`).toISOString() : new Date(`${date}T${endTime}`).toISOString();

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, start: startISO, end: endISO, timeZone, eventType, location, caseId: caseId || undefined, allDay }),
      });
      if (!res.ok) { setError("Failed to create event. Please try again."); return; }
      const data = await res.json();
      onCreated();
      if (data.conflicts?.length > 0) {
        setConflicts(data.conflicts);
        // Keep modal open to show conflicts — user can close manually
      } else {
        onClose();
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
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

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="event-title">Title</Label>
            <Input
              id="event-title"
              placeholder="e.g. Garcia v. State Farm — Hearing"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="event-type">Event Type</Label>
            <select
              id="event-type"
              value={eventType}
              onChange={(e) => setEventType(e.target.value as EventType)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {EVENT_TYPES.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          {cases.filter((c) => c.status !== "ARCHIVED" && c.status !== "CLOSED").length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="event-case">Case <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <select
                id="event-case"
                value={caseId}
                onChange={(e) => setCaseId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">— No case —</option>
                {cases.filter((c) => c.status !== "ARCHIVED" && c.status !== "CLOSED").map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}{c.caseNumber ? ` (#${c.caseNumber})` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="event-date">Date</Label>
            <Input id="event-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
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
            <Label htmlFor="event-location">Location <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input
              id="event-location"
              placeholder="e.g. Stanley Mosk Courthouse, Dept. 43"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>

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
