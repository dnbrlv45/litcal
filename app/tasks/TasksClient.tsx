"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, CheckCircle2, Circle, Clock, AlertCircle, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import TaskModal, { TaskData, TaskMember, TaskCase } from "@/components/tasks/TaskModal";

const STATUS_CYCLE: Record<string, string> = {
  TODO: "IN_PROGRESS",
  IN_PROGRESS: "DONE",
};

const STATUS_META = {
  TODO:        { label: "To Do",       icon: Circle,       color: "text-slate-400", title: "Move to In Progress", clickable: true },
  IN_PROGRESS: { label: "In Progress", icon: Clock,        color: "text-blue-500",  title: "Mark done",           clickable: true },
  DONE:        { label: "Done",        icon: CheckCircle2, color: "text-green-600", title: "Edit to reopen",      clickable: false },
} as const;

const PRIORITY_COLORS: Record<string, string> = {
  LOW:    "bg-slate-100 text-slate-600",
  MEDIUM: "bg-blue-50 text-blue-700",
  HIGH:   "bg-orange-50 text-orange-700",
  URGENT: "bg-red-50 text-red-700",
};

const PRIORITY_LABELS: Record<string, string> = {
  LOW: "Low", MEDIUM: "Medium", HIGH: "High", URGENT: "Urgent",
};

function formatDate(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function isOverdue(dueDate: string | null, status: string) {
  if (!dueDate || status === "DONE") return false;
  return new Date(dueDate) < new Date();
}

function memberName(m: TaskMember) {
  return [m.user.firstName, m.user.lastName].filter(Boolean).join(" ") || m.user.email;
}

function assigneeNames(task: TaskData): string {
  if (!task.assignees.length) return "";
  return task.assignees.map((a) => memberName(a.member)).join(", ");
}

interface TaskCardProps {
  task: TaskData;
  onEdit: (t: TaskData) => void;
  onDelete: (id: string) => void;
  onCycleStatus: (t: TaskData) => void;
}

function TaskCard({ task, onEdit, onDelete, onCycleStatus }: TaskCardProps) {
  const overdue = isOverdue(task.dueDate, task.status);
  const Meta = STATUS_META[task.status as keyof typeof STATUS_META] ?? STATUS_META.TODO;
  const Icon = Meta.icon;

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card hover:bg-accent/30 transition-colors group">
      <button
        onClick={() => Meta.clickable && onCycleStatus(task)}
        disabled={!Meta.clickable}
        className={`mt-0.5 shrink-0 ${Meta.color} ${Meta.clickable ? "hover:opacity-70 cursor-pointer" : "cursor-default"} transition-opacity`}
        title={Meta.title}
      >
        <Icon className="w-5 h-5" />
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-sm font-medium leading-snug ${task.status === "DONE" ? "line-through text-muted-foreground" : ""}`}>
            {task.title}
          </p>
          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => onEdit(task)} className="text-xs text-muted-foreground hover:text-foreground px-1">Edit</button>
            <button onClick={() => onDelete(task.id)} className="text-xs text-muted-foreground hover:text-red-600 px-1">Delete</button>
          </div>
        </div>

        {task.description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{task.description}</p>
        )}

        <div className="flex flex-wrap items-center gap-2 mt-1.5">
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${PRIORITY_COLORS[task.priority] ?? ""}`}>
            {PRIORITY_LABELS[task.priority]}
          </span>

          {task.dueDate && (
            <span className={`text-xs flex items-center gap-1 ${overdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
              {overdue && <AlertCircle className="w-3 h-3" />}
              {formatDate(task.dueDate)}
            </span>
          )}

          {task.caseRef && (
            <span className="text-xs text-muted-foreground truncate max-w-[180px]">
              {task.caseRef.caseNumber ? `${task.caseRef.caseNumber} · ` : ""}{task.caseRef.title}
            </span>
          )}

          {task.assignees.length > 0 && (
            <span className="text-xs text-muted-foreground">{assigneeNames(task)}</span>
          )}
        </div>
      </div>
    </div>
  );
}

interface GroupProps {
  title: string;
  tasks: TaskData[];
  defaultOpen?: boolean;
  onEdit: (t: TaskData) => void;
  onDelete: (id: string) => void;
  onCycleStatus: (t: TaskData) => void;
}

function TaskGroup({ title, tasks, defaultOpen = true, onEdit, onDelete, onCycleStatus }: GroupProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-6">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 mb-2 text-sm font-semibold text-foreground hover:text-teal-700 transition-colors"
      >
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? "" : "-rotate-90"}`} />
        {title}
        <span className="text-xs font-normal text-muted-foreground">({tasks.length})</span>
      </button>
      {open && (
        <div className="space-y-1.5 pl-2">
          {tasks.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2 pl-1">No tasks</p>
          ) : tasks.map((t) => (
            <TaskCard key={t.id} task={t} onEdit={onEdit} onDelete={onDelete} onCycleStatus={onCycleStatus} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function TasksClient() {
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [members, setMembers] = useState<TaskMember[]>([]);
  const [cases, setCases] = useState<TaskCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskData | null>(null);

  // Filters
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterCase, setFilterCase] = useState("");
  const [filterAssignee, setFilterAssignee] = useState("");

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set("status", filterStatus);
      if (filterPriority) params.set("priority", filterPriority);
      if (filterCase) params.set("caseId", filterCase);
      if (filterAssignee) params.set("assignedToId", filterAssignee);
      const res = await fetch(`/api/tasks?${params}`);
      const data = await res.json();
      setTasks(data.tasks ?? []);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterPriority, filterCase, filterAssignee]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  useEffect(() => {
    fetch("/api/workspaces/members").then((r) => r.json()).then((d) => setMembers(d.members ?? []));
    fetch("/api/cases").then((r) => r.json()).then((d) => setCases(d.cases ?? []));
  }, []);

  function openCreate() { setEditingTask(null); setModalOpen(true); }
  function openEdit(t: TaskData) { setEditingTask(t); setModalOpen(true); }

  function handleSaved(task: TaskData) {
    setTasks((prev) => {
      const idx = prev.findIndex((t) => t.id === task.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = task; return next; }
      return [task, ...prev];
    });
  }

  async function handleDelete(id: string) {
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  async function handleCycleStatus(task: TaskData) {
    const newStatus = STATUS_CYCLE[task.status] ?? "TODO";
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    const data = await res.json();
    if (res.ok) handleSaved(data.task);
  }

  const todo = tasks.filter((t) => t.status === "TODO");
  const inProgress = tasks.filter((t) => t.status === "IN_PROGRESS");
  const done = tasks.filter((t) => t.status === "DONE");

  const selectClass = "rounded-md border border-input bg-background px-3 py-1.5 text-sm";

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-border shrink-0">
        <div>
          <h1 className="text-xl font-semibold">Tasks</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{tasks.length} total</p>
        </div>
        <Button onClick={openCreate} className="gap-2 bg-teal-700 hover:bg-teal-800 text-white border-0">
          <Plus className="w-4 h-4" />
          New Task
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 px-8 py-4 border-b border-border shrink-0">
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={selectClass}>
          <option value="">All statuses</option>
          <option value="TODO">To Do</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="DONE">Done</option>
        </select>
        <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className={selectClass}>
          <option value="">All priorities</option>
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
          <option value="URGENT">Urgent</option>
        </select>
        <select value={filterCase} onChange={(e) => setFilterCase(e.target.value)} className={selectClass}>
          <option value="">All cases</option>
          {cases.map((c) => (
            <option key={c.id} value={c.id}>{c.caseNumber ? `${c.caseNumber} · ` : ""}{c.title}</option>
          ))}
        </select>
        <select value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)} className={selectClass}>
          <option value="">All assignees</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {[m.user.firstName, m.user.lastName].filter(Boolean).join(" ") || m.user.email}
            </option>
          ))}
        </select>
        {(filterStatus || filterPriority || filterCase || filterAssignee) && (
          <button
            onClick={() => { setFilterStatus(""); setFilterPriority(""); setFilterCase(""); setFilterAssignee(""); }}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Loading…</div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <p className="text-sm text-muted-foreground">No tasks yet.</p>
            <Button variant="ghost" size="sm" onClick={openCreate} className="gap-1 text-teal-700">
              <Plus className="w-4 h-4" /> Create your first task
            </Button>
          </div>
        ) : (
          <>
            <TaskGroup title="To Do" tasks={todo} onEdit={openEdit} onDelete={handleDelete} onCycleStatus={handleCycleStatus} />
            <TaskGroup title="In Progress" tasks={inProgress} onEdit={openEdit} onDelete={handleDelete} onCycleStatus={handleCycleStatus} />
            <TaskGroup title="Done" tasks={done} defaultOpen={false} onEdit={openEdit} onDelete={handleDelete} onCycleStatus={handleCycleStatus} />
          </>
        )}
      </div>

      <TaskModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
        members={members}
        cases={cases}
        initialTask={editingTask}
      />
    </div>
  );
}
