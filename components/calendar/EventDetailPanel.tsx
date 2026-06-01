"use client";

import { useState, useEffect } from "react";
import { X, MapPin, Calendar, Clock, Pencil, Trash2, Check, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";
import type { CalEvent, EventType } from "@/lib/google-calendar";
import { EVENT_TYPE_COLORS } from "@/lib/google-calendar";

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  HEARING: "Hearing",
  DEPOSITION: "Deposition",
  TRIAL: "Trial",
  CONFERENCE: "Conference",
  MEETING: "Meeting",
  DEADLINE: "Deadline",
  REMINDER: "Reminder",
  OTHER: "Other",
};

const EVENT_TYPES: EventType[] = ["HEARING","DEPOSITION","TRIAL","CONFERENCE","MEETING","DEADLINE","REMINDER","OTHER"];

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

export default function EventDetailPanel({ event, onClose, onDeleted, onUpdated }: Props) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [eventType, setEventType] = useState<EventType>("OTHER");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (event) {
      setEditing(false);
      setError(null);
    }
  }, [event?.id]);

  function startEdit() {
    if (!event) return;
    setTitle(event.title);
    setEventType(event.eventType);
    setDate(toDateInputValue(event.start));
    setStartTime(toTimeInputValue(event.start));
    setEndTime(toTimeInputValue(event.end));
    setLocation(event.location ?? "");
    setDescription(event.description ?? "");
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
    const startISO = new Date(`${date}T${startTime}`).toISOString();
    const endISO = new Date(`${date}T${endTime}`).toISOString();
    if (new Date(endISO) <= new Date(startISO)) { setError("End time must be after start time."); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/calendar/events/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, start: startISO, end: endISO, eventType, location }),
      });
      if (!res.ok) throw new Error();
      onUpdated();
      onClose();
    } catch {
      setError("Failed to save event.");
    } finally {
      setSaving(false);
    }
  }

  if (!event) return null;

  const colors = EVENT_TYPE_COLORS[event.eventType];

  return (
    <div className="w-80 shrink-0 border-l border-border bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Event Details</span>
        <div className="flex items-center gap-1">
          {!editing && (
            <>
              <button onClick={startEdit} className="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button onClick={handleDelete} disabled={deleting} className="p-1.5 rounded hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          <button onClick={onClose} className="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {!editing ? (
          <div className="px-5 py-4 flex flex-col gap-4">
            {/* Title + type */}
            <div className="flex flex-col gap-2">
              <h2 className="text-lg font-semibold leading-tight">{event.title}</h2>
              <span className={`self-start text-xs font-medium px-2.5 py-1 rounded-full ${colors.bg} ${colors.text}`}>
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${colors.dot} mr-1.5 align-middle`} />
                {EVENT_TYPE_LABELS[event.eventType]}
              </span>
            </div>

            {/* Date / time */}
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex items-center gap-2.5 text-muted-foreground">
                <Calendar className="w-4 h-4 shrink-0" />
                <span>{event.start.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</span>
              </div>
              {!event.allDay && (
                <div className="flex items-center gap-2.5 text-muted-foreground">
                  <Clock className="w-4 h-4 shrink-0" />
                  <span>
                    {event.start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    {" – "}
                    {event.end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </span>
                </div>
              )}
            </div>

            {/* Location */}
            {event.location && (
              <div className="flex items-start gap-2.5 text-sm">
                <MapPin className="w-4 h-4 shrink-0 text-muted-foreground mt-0.5" />
                <div className="flex flex-col gap-0.5">
                  <span className="text-foreground">{event.location}</span>
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(event.location)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-indigo-600 hover:underline"
                  >
                    Directions
                  </a>
                </div>
              </div>
            )}

            {/* Case link */}
            {event.caseId && event.caseTitle && (
              <div className="flex items-center gap-2.5 text-sm">
                <Briefcase className="w-4 h-4 shrink-0 text-muted-foreground" />
                <Link href={`/cases/${event.caseId}`} className="text-indigo-600 hover:underline font-medium truncate">
                  {event.caseTitle}
                </Link>
              </div>
            )}

            {/* Notes */}
            {event.description && (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notes</span>
                <p className="text-sm text-foreground whitespace-pre-wrap">{event.description}</p>
              </div>
            )}

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

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ep-date">Date</Label>
              <Input id="ep-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>

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
              <Button type="button" variant="ghost" size="sm" className="flex-1" onClick={() => { setEditing(false); setError(null); }}>
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
