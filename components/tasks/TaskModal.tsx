"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Check } from "lucide-react";

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

export interface TaskAssignee {
  member: TaskMember;
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
  completedAt: string | null;
  assignees: TaskAssignee[];
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

function memberLabel(m: TaskMember) {
  const name = [m.user.firstName, m.user.lastName].filter(Boolean).join(" ") || m.user.email;
  return m.jobTitle ? `${name} · ${m.jobTitle}` : name;
}

export default function TaskModal({
  open, onClose, onSaved, members, cases,
  initialTask, defaultCaseId, defaultEventId,
}: Props) {
  const [title, setTitle]           = useState("");
  const [description, setDesc]      = useState("");
  const [status, setStatus]         = useState("TODO");
  const [priority, setPriority]     = useState("MEDIUM");
  const [dueDate, setDueDate]       = useState("");
  const [caseId, setCaseId]         = useState("");
  const [assigneeIds, setAssignees] = useState<string[]>([]);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (initialTask) {
        setTitle(initialTask.title);
        setDesc(initialTask.description ?? "");
        setStatus(initialTask.status);
        setPriority(initialTask.priority);
        setDueDate(initialTask.dueDate ? initialTask.dueDate.slice(0, 10) : "");
        setCaseId(initialTask.caseId ?? "");
        setAssignees(initialTask.assignees.map((a) => a.member.id));
      } else {
        setTitle(""); setDesc(""); setStatus("TODO"); setPriority("MEDIUM");
        setDueDate(""); setCaseId(defaultCaseId ?? ""); setAssignees([]);
      }
      setError(null);
    }
  }, [open, initialTask, defaultCaseId]);

  function toggleAssignee(memberId: string) {
    setAssignees((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError("Title is required"); return; }
    setSaving(true);
    setError(null);
    try {
      const body = {
        title,
        description: description || undefined,
        status,
        priority,
        dueDate: dueDate || undefined,
        caseId: caseId || undefined,
        eventId: defaultEventId || undefined,
        assigneeIds,
      };
      const url    = initialTask ? `/api/tasks/${initialTask.id}` : "/api/tasks";
      const method = initialTask ? "PATCH" : "POST";
      const res  = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
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

  const selectCls = "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initialTask ? "Edit Task" : "New Task"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div>
            <Label htmlFor="task-title">Title</Label>
            <Input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" className="mt-1" />
          </div>

          <div>
            <Label htmlFor="task-desc">Description</Label>
            <Textarea id="task-desc" value={description} onChange={(e) => setDesc(e.target.value)} placeholder="Optional details…" rows={2} className="mt-1 resize-none" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="task-status">Status</Label>
              <select id="task-status" value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
                {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="task-priority">Priority</Label>
              <select id="task-priority" value={priority} onChange={(e) => setPriority(e.target.value)} className={selectCls}>
                {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <Label htmlFor="task-due">Due Date</Label>
            <Input id="task-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1" />
          </div>

          <div>
            <Label htmlFor="task-case">Case (optional)</Label>
            <select id="task-case" value={caseId} onChange={(e) => setCaseId(e.target.value)} className={selectCls}>
              <option value="">— No case —</option>
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.caseNumber ? `${c.caseNumber} · ` : ""}{c.title}
                </option>
              ))}
            </select>
          </div>

          {/* Multi-select assignees */}
          <div>
            <Label>Assigned To (optional)</Label>
            {members.length === 0 ? (
              <p className="text-xs text-muted-foreground mt-1">No team members.</p>
            ) : (
              <div className="mt-1 border border-input rounded-md divide-y divide-border max-h-40 overflow-y-auto">
                {members.map((m) => {
                  const selected = assigneeIds.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleAssignee(m.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left transition-colors ${
                        selected ? "bg-teal-50 text-teal-900" : "hover:bg-accent/50"
                      }`}
                    >
                      <span>{memberLabel(m)}</span>
                      {selected && <Check className="w-4 h-4 text-teal-700 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
            {assigneeIds.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">{assigneeIds.length} selected</p>
            )}
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
