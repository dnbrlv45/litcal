"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Calendar, CheckSquare, User, Edit3, Trash2, Zap, Link2,
  Clock, FolderOpen, ChevronDown, ChevronUp, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface TimelineActor {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
}

interface TimelineEntry {
  id: string;
  type: string;
  title: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: TimelineActor | null;
}

interface GroupedEntries {
  label: string;
  entries: TimelineEntry[];
}

function formatDateLabel(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const entryDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (entryDate.getTime() === today.getTime()) return "Today";
  if (entryDate.getTime() === yesterday.getTime()) return "Yesterday";
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function groupByDate(entries: TimelineEntry[]): GroupedEntries[] {
  const groups: Map<string, TimelineEntry[]> = new Map();
  for (const entry of entries) {
    const d = new Date(entry.createdAt);
    const label = formatDateLabel(d);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(entry);
  }
  return Array.from(groups.entries()).map(([label, es]) => ({ label, entries: es }));
}

function typeIcon(type: string) {
  if (type.startsWith("case.staff")) return <User className="w-3.5 h-3.5" />;
  if (type === "case.status_changed") return <RefreshCw className="w-3.5 h-3.5" />;
  if (type.startsWith("case.")) return <FolderOpen className="w-3.5 h-3.5" />;
  if (type === "event.deleted") return <Trash2 className="w-3.5 h-3.5" />;
  if (type === "event.edited") return <Edit3 className="w-3.5 h-3.5" />;
  if (type === "event.google_synced") return <Link2 className="w-3.5 h-3.5" />;
  if (type === "event.rule_applied" || type === "event.rule_backfilled") return <Zap className="w-3.5 h-3.5" />;
  if (type.startsWith("event.")) return <Calendar className="w-3.5 h-3.5" />;
  if (type.startsWith("task.")) return <CheckSquare className="w-3.5 h-3.5" />;
  return <Clock className="w-3.5 h-3.5" />;
}

function typeColor(type: string): string {
  if (type.startsWith("case.staff")) return "bg-blue-100 text-blue-700";
  if (type === "case.status_changed") return "bg-amber-100 text-amber-700";
  if (type.startsWith("case.")) return "bg-slate-100 text-slate-600";
  if (type === "event.deleted") return "bg-rose-100 text-rose-700";
  if (type === "event.google_synced") return "bg-sky-100 text-sky-700";
  if (type === "event.rule_applied" || type === "event.rule_backfilled") return "bg-teal-100 text-teal-700";
  if (type.startsWith("event.")) return "bg-orange-100 text-orange-700";
  if (type === "task.completed") return "bg-emerald-100 text-emerald-700";
  if (type.startsWith("task.")) return "bg-violet-100 text-violet-700";
  return "bg-slate-100 text-slate-600";
}

function actorLabel(actor: TimelineActor | null): string | null {
  if (!actor) return null;
  const name = [actor.firstName, actor.lastName].filter(Boolean).join(" ");
  return name || actor.email;
}

export default function CaseTimeline({ caseId }: { caseId: string }) {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<"desc" | "asc">("desc");

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/cases/${caseId}/timeline`)
      .then((r) => r.json())
      .then((d: { entries?: TimelineEntry[] }) => setEntries(d.entries ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [caseId]);

  useEffect(() => { load(); }, [load]);

  const sorted = order === "desc" ? entries : [...entries].reverse();
  const groups = groupByDate(sorted);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Timeline</h2>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs text-slate-500"
          onClick={() => setOrder((o) => (o === "desc" ? "asc" : "desc"))}
        >
          {order === "desc" ? (
            <><ChevronDown className="w-3.5 h-3.5" /> Newest first</>
          ) : (
            <><ChevronUp className="w-3.5 h-3.5" /> Oldest first</>
          )}
        </Button>
      </div>

      {loading && (
        <p className="text-xs text-slate-400 py-4 text-center">Loading…</p>
      )}

      {!loading && entries.length === 0 && (
        <p className="text-xs text-slate-400 py-4 text-center">No timeline entries yet.</p>
      )}

      {!loading && groups.map((group) => (
        <div key={group.label} className="flex flex-col gap-0">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide px-1 mb-2">
            {group.label}
          </p>
          <div className="relative flex flex-col">
            {/* vertical line */}
            <div className="absolute left-[13px] top-0 bottom-0 w-px bg-slate-200" />
            {group.entries.map((entry) => (
              <div key={entry.id} className="flex gap-3 pb-4 relative">
                {/* icon dot */}
                <div className={`relative z-10 flex items-center justify-center w-7 h-7 rounded-full shrink-0 ${typeColor(entry.type)}`}>
                  {typeIcon(entry.type)}
                </div>
                <div className="flex flex-col gap-0.5 pt-0.5 min-w-0">
                  <p className="text-sm text-slate-800 leading-snug">{entry.title}</p>
                  {entry.description && (
                    <p className="text-xs text-slate-500 leading-snug">{entry.description}</p>
                  )}
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {new Date(entry.createdAt).toLocaleTimeString("en-US", {
                      hour: "numeric", minute: "2-digit",
                    })}
                    {actorLabel(entry.actor) && (
                      <> · <span className="text-slate-500">{actorLabel(entry.actor)}</span></>
                    )}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
