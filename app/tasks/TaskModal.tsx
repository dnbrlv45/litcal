"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface TaskMember {
  id: string;
  jobTitle: string | null;
  user: { id: string; firstName: string | null; lastName: string | null; email: string };
}

export interface TaskCase {
  id: string;
  title: string;
  caseNumber: string | null;
}

export interface TaskData {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  caseId: string | null;
  eventId: string | null;
  assignedToId: string | null;
  completedAt: string | null;
  assignedTo: TaskMember | null;
  caseRef: TaskCase | null;
  eventRef: { id: string; title: string; startTime: string } | null;
}

const STATUSES = [
  { value: "TODO",        label: "To Do" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "DONE",        label: "Done" },
];

const PRIORITIES = [
  { value: "LOW",    label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH",   label: "High" },
  { value: "URGENT", label: "Urgent" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (task: TaskData) => void;
  members: TaskMember[];
  cases: TaskCase[];
  initialTask?: TaskData | null;
  defaultCaseId?: string;
  defaultEventId?: string;
}

const EMPTY = {
  title: "",
  description: "",
  status: "TODO",
  priority: "MEDIUM",
  dueDate: "",
  caseId: "",
  assignedToId: "",
};

export default function TaskModal({
  open, onClose, onSaved, members, cases,
  initialTask, defaultCaseId, defaultEventId,
}: Props) {
  const [fields, setFields] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (initialTask) {
        setFields({
          title: initialTask.title,
          description: initialTask.description ?? "",
          status: initialTask.status,
          priority: initialTask.priority,
          dueDate: initialTask.dueDate ? initialTask.dueDate.slice(0, 10) : "",
          caseId: initialTask.caseId ?? "",
          assignedToId: initialTask.assignedToId ?? "",
        });
      } else {
        setFields({ ...EMPTY, caseId: defaultCaseId ?? "" });
      }
      setError(null);
    }
  }, [open, initialTask, defaultCaseId]);

  function set(key: keyof typeof EMPTY) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setFields((f) => ({ ...f, [key]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fields.title.trim()) { setError("Title is required"); return; }
    setSaving(true);
    setError(null);
    try {
      const body = {
        title: fields.title,
        description: fields.description || undefined,
        status: fields.status,
        priority: fields.priority,
        dueDate: fields.dueDate || undefined,
        caseId: fields.caseId || undefined,
        eventId: defaultEventId || undefined,
        assignedToId: fields.assignedToId || undefined,
      };

      const url = initialTask ? `/api/tasks/${initialTask.id}` : "/api/tasks";
      const method = initialTask ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to save"); return; }
      onSaved(data.task);
      onClose();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initialTask ? "Edit Task" : "New Task"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div>
            <Label htmlFor="task-title">Title</Label>
            <Input id="task-title" value={fields.title} onChange={set("title")} placeholder="Task title" className="mt-1" />
          </div>

          <div>
            <Label htmlFor="task-desc">Description</Label>
            <Textarea id="task-desc" value={fields.description} onChange={set("description")} placeholder="Optional details…" rows={2} className="mt-1 resize-none" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="task-status">Status</Label>
              <select id="task-status" value={fields.status} onChange={set("status")}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="task-priority">Priority</Label>
              <select id="task-priority" value={fields.priority} onChange={set("priority")}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <Label htmlFor="task-due">Due Date</Label>
            <Input id="task-due" type="date" value={fields.dueDate} onChange={set("dueDate")} className="mt-1" />
          </div>

          <div>
            <Label htmlFor="task-case">Case (optional)</Label>
            <select id="task-case" value={fields.caseId} onChange={set("caseId")}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">— No case —</option>
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.caseNumber ? `${c.caseNumber} · ` : ""}{c.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="task-assign">Assigned To (optional)</Label>
            <select id="task-assign" value={fields.assignedToId} onChange={set("assignedToId")}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">— Unassigned —</option>
              {members.map((m) => {
                const name = [m.user.firstName, m.user.lastName].filter(Boolean).join(" ") || m.user.email;
                return <option key={m.id} value={m.id}>{name}{m.jobTitle ? ` · ${m.jobTitle}` : ""}</option>;
              })}
            </select>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving} className="bg-teal-700 hover:bg-teal-800 text-white border-0">
              {saving ? "Saving…" : initialTask ? "Save Changes" : "Create Task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
