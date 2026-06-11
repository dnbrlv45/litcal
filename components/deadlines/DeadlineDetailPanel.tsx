"use client";

import { X, Briefcase, Calendar, CheckCircle2, Trash2, ExternalLink, Zap, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { DeadlineItem } from "@/app/api/deadlines/route";

interface Props {
  deadline: DeadlineItem;
  onClose: () => void;
  onMarkComplete: (id: string) => void;
  onDelete: (id: string) => void;
  completing: boolean;
  deleting: boolean;
}

function daysLabel(dueDate: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const diff = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return { label: `${Math.abs(diff)} day${Math.abs(diff) !== 1 ? "s" : ""} overdue`, color: "text-rose-600" };
  if (diff === 0) return { label: "Due today", color: "text-orange-600" };
  return { label: `in ${diff} day${diff !== 1 ? "s" : ""}`, color: "text-slate-500" };
}

const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: "bg-blue-100 text-blue-800",
  COMPLETED: "bg-green-100 text-green-800",
  CANCELLED: "bg-slate-100 text-slate-600",
  RESCHEDULED: "bg-amber-100 text-amber-800",
  TODO: "bg-slate-100 text-slate-700",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  DONE: "bg-green-100 text-green-800",
};

export default function DeadlineDetailPanel({ deadline, onClose, onMarkComplete, onDelete, completing, deleting }: Props) {
  const { label, color } = daysLabel(deadline.dueDate);
  const statusColor = STATUS_COLORS[deadline.status] ?? "bg-slate-100 text-slate-700";

  return (
    <div className="ml-5 w-[360px] shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-end px-5 py-4 shrink-0">
        <div className="flex items-center gap-1">
          {deadline.type === "task" && deadline.status !== "DONE" && (
            <button
              onClick={() => onMarkComplete(deadline.id)}
              disabled={completing}
              className="p-1.5 rounded-lg hover:bg-green-50 transition-colors text-slate-500 hover:text-green-600"
              title="Mark complete"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
            </button>
          )}
          {deadline.type === "event" && deadline.source === "manual" && (
            <button
              onClick={() => onDelete(deadline.id)}
              disabled={deleting}
              className="p-1.5 rounded-lg hover:bg-rose-50 transition-colors text-slate-500 hover:text-rose-600"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-950">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 pb-6 flex flex-col gap-5">
        {/* Title */}
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-bold leading-tight text-slate-950">{deadline.title}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusColor}`}>
              {deadline.status}
            </span>
            {deadline.source === "generated" && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-teal-100 text-teal-800">
                <Zap className="w-3 h-3" />
                Auto
              </span>
            )}
            <span className="text-xs text-slate-500 capitalize">{deadline.type}</span>
          </div>
        </div>

        {/* Due date */}
        <div className="flex flex-col gap-1 border-b border-slate-200 pb-5">
          <div className="flex items-center gap-3 text-sm text-slate-700">
            <Calendar className="w-4 h-4 shrink-0 text-slate-500" />
            <span>{new Date(deadline.dueDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</span>
          </div>
          <div className={`flex items-center gap-3 text-sm font-semibold ${color}`}>
            <AlertTriangle className="w-4 h-4 shrink-0 opacity-60" />
            <span>{label}</span>
          </div>
        </div>

        {/* Source */}
        {deadline.sourceLabel && (
          <div className="flex items-start gap-3 text-sm border-b border-slate-200 pb-5">
            <Zap className="w-4 h-4 shrink-0 text-slate-400 mt-0.5" />
            <div>
              <span className="block text-xs text-slate-500">Source</span>
              <span className="text-slate-800 font-medium">{deadline.sourceLabel}</span>
            </div>
          </div>
        )}

        {/* Case */}
        {deadline.caseId && deadline.caseTitle && (
          <div className="border-b border-slate-200">
            <Link href={`/cases/${deadline.caseId}`} className="flex items-center gap-3 py-4 text-sm group">
              <Briefcase className="w-4 h-4 shrink-0 text-slate-500" />
              <span className="flex-1">
                <span className="block text-xs text-slate-500">Case</span>
                <span className="font-semibold text-slate-900 group-hover:text-teal-800">
                  {deadline.caseTitle}
                  {deadline.caseNumber && <span className="ml-1.5 font-normal text-slate-500">#{deadline.caseNumber}</span>}
                </span>
                {deadline.caseCounty && <span className="block text-xs text-slate-400 mt-0.5">{deadline.caseCounty} County</span>}
              </span>
              <ExternalLink className="size-4 text-slate-400" />
            </Link>
          </div>
        )}

        {/* Assigned */}
        {(deadline.assignedAttorneyName || deadline.assignedParalegalName) && (
          <div className="flex flex-col gap-2 border-b border-slate-200 pb-5 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Assigned</span>
            {deadline.assignedAttorneyName && (
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-teal-500 shrink-0" />
                <span className="text-slate-800">{deadline.assignedAttorneyName}</span>
                <span className="text-xs text-slate-400">Attorney</span>
              </div>
            )}
            {deadline.assignedParalegalName && (
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-violet-400 shrink-0" />
                <span className="text-slate-800">{deadline.assignedParalegalName}</span>
                <span className="text-xs text-slate-400">Paralegal</span>
              </div>
            )}
          </div>
        )}

        {/* Related event */}
        {deadline.triggerEventId && deadline.triggerEventTitle && (
          <div className="rounded-lg border border-violet-200 bg-violet-50/60 px-3 py-3 text-xs flex flex-col gap-0.5">
            <span className="font-semibold text-violet-900">Triggered by</span>
            <span className="text-violet-700">{deadline.triggerEventTitle}</span>
            {deadline.triggerEventType && (
              <span className="text-violet-500 uppercase tracking-wide text-[10px]">{deadline.triggerEventType.replace(/_/g, " ")}</span>
            )}
          </div>
        )}

        {/* Priority (tasks) */}
        {deadline.priority && (
          <div className="text-sm text-slate-700">
            <span className="text-xs text-slate-500">Priority: </span>
            <span className="font-semibold">{deadline.priority}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2 pt-1">
          {deadline.caseId && (
            <Link
              href={`/cases/${deadline.caseId}`}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 text-sm font-semibold text-white hover:bg-slate-800"
            >
              <Briefcase className="size-4" />
              Open Case
            </Link>
          )}
          {deadline.relatedEventId && (
            <Link
              href={`/?event=${deadline.relatedEventId}`}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Calendar className="size-4" />
              Open Event
            </Link>
          )}
          {deadline.type === "task" && deadline.status !== "DONE" && (
            <Button
              onClick={() => onMarkComplete(deadline.id)}
              disabled={completing}
              className="h-10 bg-green-600 hover:bg-green-700 text-white"
            >
              <CheckCircle2 className="size-4 mr-1.5" />
              {completing ? "Saving…" : "Mark Complete"}
            </Button>
          )}
          {deadline.type === "event" && deadline.source === "manual" && (
            <Button
              variant="outline"
              onClick={() => onDelete(deadline.id)}
              disabled={deleting}
              className="h-10 border-rose-200 text-rose-600 hover:bg-rose-50"
            >
              <Trash2 className="size-4 mr-1.5" />
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
