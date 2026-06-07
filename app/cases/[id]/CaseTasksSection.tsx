"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Plus, CheckCircle2, Circle, Clock, AlertCircle, ListTodo } from "lucide-react";
import { Button } from "@/components/ui/button";
import TaskModal, { TaskData, TaskMember, TaskCase } from "@/components/tasks/TaskModal";

const STATUS_CYCLE: Record<string, string> = {
  TODO: "IN_PROGRESS",
  IN_PROGRESS: "DONE",
};

const STATUS_ICON: Record<string, { icon: React.ElementType; color: string; title: string; clickable: boolean }> = {
  TODO:        { icon: Circle,       color: "text-slate-400", title: "Move to In Progress", clickable: true },
  IN_PROGRESS: { icon: Clock,        color: "text-blue-500",  title: "Mark done",           clickable: true },
  DONE:        { icon: CheckCircle2, color: "text-green-600", title: "Edit to reopen",      clickable: false },
};

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

function assigneeNames(task: TaskData): string {
  if (!task.assignees.length) return "";
  return task.assignees.map((a) => memberName(a.member)).join(", ");
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

  useEffect(() => {
    void Promise.resolve().then(fetchTasks);
  }, [fetchTasks]);
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

  const thisCase: TaskCase = { id: caseId, title: caseTitle, caseNumber };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-lg bg-slate-100 text-slate-600">
            <ListTodo className="size-3.5" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-slate-950">Tasks</h3>
            <p className="mt-0.5 text-xs text-slate-500">{tasks.length} task{tasks.length !== 1 ? "s" : ""} linked to this case</p>
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="gap-1 text-teal-700 hover:bg-teal-50 hover:text-teal-800 h-8 px-2"
          onClick={() => { setEditingTask(null); setModalOpen(true); }}
        >
          <Plus className="w-3.5 h-3.5" />
          Add Task
        </Button>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground py-2">Loading tasks…</p>
      ) : tasks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
          <p className="text-sm font-semibold text-slate-700">No tasks for this case</p>
          <p className="mt-1 text-xs text-slate-500">Add follow-ups, deadlines, or case work here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => {
            const overdue = isOverdue(task.dueDate, task.status);
            const statusMeta = STATUS_ICON[task.status] ?? STATUS_ICON.TODO;
            const StatusIcon = statusMeta.icon;
            return (
              <div key={task.id}
                className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3.5 text-sm shadow-sm transition-colors hover:border-teal-200 hover:bg-teal-50/20 group">
                <button
                  onClick={() => statusMeta.clickable && handleCycleStatus(task)}
                  disabled={!statusMeta.clickable}
                  className={`mt-0.5 shrink-0 ${statusMeta.color} ${statusMeta.clickable ? "hover:opacity-70 cursor-pointer" : "cursor-default"} transition-opacity`}
                  title={statusMeta.title}
                >
                  <StatusIcon className="w-4 h-4" />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <span className={`font-semibold leading-snug ${task.status === "DONE" ? "line-through text-muted-foreground" : "text-slate-950"}`}>
                      {task.title}
                    </span>
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => { setEditingTask(task); setModalOpen(true); }} className="rounded px-1.5 py-0.5 text-xs font-medium text-muted-foreground hover:bg-slate-100 hover:text-foreground">Edit</button>
                      <button onClick={() => handleDelete(task.id)} className="rounded px-1.5 py-0.5 text-xs font-medium text-muted-foreground hover:bg-red-50 hover:text-red-600">Delete</button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-semibold ${PRIORITY_COLORS[task.priority] ?? ""}`}>
                      {PRIORITY_LABELS[task.priority]}
                    </span>
                    <span className="text-xs text-muted-foreground">{STATUS_LABELS[task.status] ?? task.status}</span>
                    {task.dueDate && (
                      <span className={`text-xs flex items-center gap-1 ${overdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                        {overdue && <AlertCircle className="w-3 h-3" />}
                        {formatDate(task.dueDate)}
                      </span>
                    )}
                    {task.assignees.length > 0 && (
                      <span className="text-xs text-muted-foreground">{assigneeNames(task)}</span>
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
