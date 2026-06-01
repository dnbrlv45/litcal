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
import type { CalEvent } from "@/lib/google-calendar";

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

export default function EventDetailModal({ event, onClose, onDeleted, onUpdated }: Props) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset to detail view whenever a new event is opened
  useEffect(() => {
    if (event) {
      setEditing(false);
      setError(null);
    }
  }, [event?.id]);

  function startEdit() {
    if (!event) return;
    setTitle(event.title);
    setDate(toDateInputValue(event.start));
    setStartTime(toTimeInputValue(event.start));
    setEndTime(toTimeInputValue(event.end));
    setDescription(event.description ?? "");
    setError(null);
    setEditing(true);
  }

  async function handleDelete() {
    if (!event) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/calendar/events/${event.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      onDeleted();
      onClose();
    } catch {
      setError("Failed to delete event. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!event) return;
    if (!title.trim()) { setError("Title is required."); return; }

    const startISO = new Date(`${date}T${startTime}`).toISOString();
    const endISO = new Date(`${date}T${endTime}`).toISOString();

    if (new Date(endISO) <= new Date(startISO)) {
      setError("End time must be after start time.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/calendar/events/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, start: startISO, end: endISO }),
      });
      if (!res.ok) throw new Error();
      onUpdated();
      onClose();
    } catch {
      setError("Failed to save event. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!event} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        {!editing ? (
          <>
            <DialogHeader>
              <DialogTitle className="pr-6">{event?.title}</DialogTitle>
            </DialogHeader>

            <div className="flex flex-col gap-3 py-1">
              {event && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">
                    {event.start.toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                  {!event.allDay && (
                    <span className="text-sm text-muted-foreground">
                      {event.start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      {" – "}
                      {event.end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </span>
                  )}
                </div>
              )}

              {event?.description && (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{event.description}</p>
              )}

              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>

            <DialogFooter className="gap-2 sm:justify-between">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? "Deleting…" : "Delete"}
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={startEdit}>
                  Edit
                </Button>
                <Button variant="ghost" size="sm" onClick={onClose}>
                  Close
                </Button>
              </div>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Edit Event</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSave} className="flex flex-col gap-4 py-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-title">Title</Label>
                <Input
                  id="edit-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-date">Date</Label>
                <Input
                  id="edit-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-start">Start time</Label>
                  <Input
                    id="edit-start"
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-end">End time</Label>
                  <Input
                    id="edit-end"
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-desc">
                  Description{" "}
                  <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Textarea
                  id="edit-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                />
              </div>

              {error && <p className="text-xs text-destructive">{error}</p>}

              <DialogFooter className="mt-2">
                <Button type="button" variant="ghost" onClick={() => { setEditing(false); setError(null); }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
