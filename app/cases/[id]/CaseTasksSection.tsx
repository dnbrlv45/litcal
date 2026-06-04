"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, CheckCircle2, Circle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import TaskModal, { TaskData, TaskMember, TaskCase } from "@/app/tasks/TaskModal";

const PRIORITY_COLORS: Record<string, string> = {
  LOW:    "bg-slate-100 text-slate-600",
  MEDIUM: "bg-blue-50 text-blue-700",
  HIGH:   "bg-orange-50 text-orange-700",
  URGENT: "bg-red-50 text-red-700",
};
const PRIORITY_LABELS: Record<string, string> = {
  LOW: "Low", MEDIUM: "Medium", HIGH: "High", URGENT: "Urgent",
};
const STATUS_LABELS: Record<string, string> = {
  TODO: "To Do", IN_PROGRESS: "In Progress", DONE: "Done",
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

interface Props {
  caseId: string;
  caseTitle: string;
  caseNumber: string | null;
}

export default function CaseTasksSection({ caseId, caseTitle, caseNumber }: Props) {
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [members, setMembers] = useState<TaskMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskData | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks?caseId=${caseId}`);
      const data = await res.json();
      setTasks(data.tasks ?? []);
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);
  useEffect(() => {
    fetch("/api/workspaces/members").then((r) => r.json()).then((d) => setMembers(d.members ?? []));
  }, []);

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

  async function handleToggleDone(task: TaskData) {
    const newStatus = task.status === "DONE" ? "TODO" : "DONE";
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    const data = await res.json();
    if (res.ok) handleSaved(data.task);
  }

  const thisCase: TaskCase = { id: caseId, title: caseTitle, caseNumber };

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Tasks</h3>
        <Button
          size="sm"
          variant="ghost"
          className="gap-1 text-teal-700 hover:text-teal-800 h-7 px-2"
          onClick={() => { setEditingTask(null); setModalOpen(true); }}
        >
          <Plus className="w-3.5 h-3.5" />
          Add Task
        </Button>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground py-2">Loading…</p>
      ) : tasks.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">No tasks for this case.</p>
      ) : (
        <div className="space-y-1.5">
          {tasks.map((task) => {
            const overdue = isOverdue(task.dueDate, task.status);
            return (
              <div key={task.id}
                className="flex items-start gap-2.5 p-2.5 rounded-md border border-border bg-card hover:bg-accent/30 transition-colors group text-sm">
                <button
                  onClick={() => handleToggleDone(task)}
                  className={`mt-0.5 shrink-0 ${task.status === "DONE" ? "text-green-600" : "text-slate-300 hover:text-teal-600"} transition-colors`}
                >
                  {task.status === "DONE" ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <span className={`font-medium leading-snug ${task.status === "DONE" ? "line-through text-muted-foreground" : ""}`}>
                      {task.title}
                    </span>
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => { setEditingTask(task); setModalOpen(true); }} className="text-xs text-muted-foreground hover:text-foreground px-1">Edit</button>
                      <button onClick={() => handleDelete(task.id)} className="text-xs text-muted-foreground hover:text-red-600 px-1">Delete</button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${PRIORITY_COLORS[task.priority] ?? ""}`}>
                      {PRIORITY_LABELS[task.priority]}
                    </span>
                    <span className="text-xs text-muted-foreground">{STATUS_LABELS[task.status] ?? task.status}</span>
                    {task.dueDate && (
                      <span className={`text-xs flex items-center gap-1 ${overdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                        {overdue && <AlertCircle className="w-3 h-3" />}
                        {formatDate(task.dueDate)}
                      </span>
                    )}
                    {task.assignedTo && (
                      <span className="text-xs text-muted-foreground">{memberName(task.assignedTo)}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <TaskModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
        members={members}
        cases={[thisCase]}
        initialTask={editingTask}
        defaultCaseId={caseId}
      />
    </div>
  );
}
