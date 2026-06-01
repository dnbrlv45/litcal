"use client";

import { useState, useEffect } from "react";
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
import type { EventType } from "@/lib/google-calendar";

const EVENT_TYPES: { value: EventType; label: string }[] = [
  { value: "HEARING",    label: "Hearing" },
  { value: "DEPOSITION", label: "Deposition" },
  { value: "TRIAL",      label: "Trial" },
  { value: "CONFERENCE", label: "Conference" },
  { value: "MEETING",    label: "Meeting" },
  { value: "DEADLINE",   label: "Deadline" },
  { value: "REMINDER",   label: "Reminder" },
  { value: "OTHER",      label: "Other" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  defaultStart?: Date;
  googleConnected: boolean;
  onCreated: () => void;
}

function toDateInputValue(d: Date) {
  return d.toISOString().slice(0, 10);
}

function toTimeInputValue(d: Date) {
  return d.toTimeString().slice(0, 5);
}

function addHour(d: Date) {
  return new Date(d.getTime() + 60 * 60 * 1000);
}

export default function EventModal({ open, onClose, defaultStart, googleConnected, onCreated }: Props) {
  const now = defaultStart ?? new Date();
  const [title, setTitle] = useState("");
  const [eventType, setEventType] = useState<EventType>("HEARING");
  const [date, setDate] = useState(toDateInputValue(now));
  const [startTime, setStartTime] = useState(toTimeInputValue(now));
  const [endTime, setEndTime] = useState(toTimeInputValue(addHour(now)));
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      const base = defaultStart ?? new Date();
      setTitle("");
      setEventType("HEARING");
      setDate(toDateInputValue(base));
      setStartTime(toTimeInputValue(base));
      setEndTime(toTimeInputValue(addHour(base)));
      setLocation("");
      setDescription("");
      setError(null);
    }
  }, [open, defaultStart]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError("Title is required."); return; }

    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const startISO = new Date(`${date}T${startTime}`).toISOString();
    const endISO = new Date(`${date}T${endTime}`).toISOString();

    if (new Date(endISO) <= new Date(startISO)) {
      setError("End time must be after start time.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, start: startISO, end: endISO, timeZone, eventType, location }),
      });
      if (!res.ok) { setError("Failed to create event. Please try again."); return; }
      onCreated();
      onClose();
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
              Events are saved to Veritas Litigation.{" "}
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

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="event-date">Date</Label>
            <Input id="event-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="event-start">Start time</Label>
              <Input id="event-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="event-end">End time</Label>
              <Input id="event-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>

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

          {error && <p className="text-xs text-destructive">{error}</p>}

          <DialogFooter className="mt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Create Event"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
