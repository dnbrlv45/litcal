"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Calendar, CheckSquare, User, Edit3, Trash2, Zap, Link2,
  Clock, FolderOpen, ChevronDown, ChevronUp, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { TIMELINE_FILTERS } from "@/lib/case-timeline-constants";
import type { TimelineFilter } from "@/lib/case-timeline-constants";

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
  importance: string;
  createdAt: string;
  actor: TimelineActor | null;
}

interface ApiResponse {
  entries: TimelineEntry[];
  nextCursor: string | null;
  total: number;
}

interface DateGroup {
  label: string;
  entries: TimelineEntry[];
}

function formatDateLabel(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (d.getTime() === today.getTime()) return "Today";
  if (d.getTime() === yesterday.getTime()) return "Yesterday";
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function groupByDate(entries: TimelineEntry[]): DateGroup[] {
  const groups = new Map<string, TimelineEntry[]>();
  for (const e of entries) {
    const label = formatDateLabel(new Date(e.createdAt));
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(e);
  }
  return Array.from(groups.entries()).map(([label, es]) => ({ label, entries: es }));
}

function typeIcon(type: string) {
  if (type.startsWith("case.staff"))  return <User className="w-3.5 h-3.5" />;
  if (type === "case.status_changed") return <RefreshCw className="w-3.5 h-3.5" />;
  if (type.startsWith("case."))       return <FolderOpen className="w-3.5 h-3.5" />;
  if (type === "event.deleted")       return <Trash2 className="w-3.5 h-3.5" />;
  if (type === "event.edited")        return <Edit3 className="w-3.5 h-3.5" />;
  if (type === "event.google_synced") return <Link2 className="w-3.5 h-3.5" />;
  if (type === "event.rule_applied" || type === "event.rule_backfilled") return <Zap className="w-3.5 h-3.5" />;
  if (type.startsWith("event."))      return <Calendar className="w-3.5 h-3.5" />;
  if (type.startsWith("task."))       return <CheckSquare className="w-3.5 h-3.5" />;
  return <Clock className="w-3.5 h-3.5" />;
}

function typeColor(type: string): string {
  if (type.startsWith("case.staff"))  return "bg-blue-100 text-blue-700";
  if (type === "case.status_changed") return "bg-amber-100 text-amber-700";
  if (type.startsWith("case."))       return "bg-slate-100 text-slate-600";
  if (type === "event.deleted")       return "bg-rose-100 text-rose-700";
  if (type === "event.google_synced") return "bg-sky-100 text-sky-700";
  if (type === "event.rule_applied" || type === "event.rule_backfilled") return "bg-teal-100 text-teal-700";
  if (type.startsWith("event."))      return "bg-orange-100 text-orange-700";
  if (type === "task.completed")      return "bg-emerald-100 text-emerald-700";
  if (type.startsWith("task."))       return "bg-violet-100 text-violet-700";
  return "bg-slate-100 text-slate-600";
}

function actorLabel(actor: TimelineActor | null): string | null {
  if (!actor) return null;
  return [actor.firstName, actor.lastName].filter(Boolean).join(" ") || actor.email;
}

export default function CaseTimeline({ caseId }: { caseId: string }) {
  const [entries, setEntries]       = useState<TimelineEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [order, setOrder]           = useState<"desc" | "asc">("desc");
  const [filter, setFilter]         = useState<TimelineFilter>("all");
  const [importanceMode, setImportanceMode] = useState<"normal" | "all">("normal");

  // track current query params to avoid stale closures in load more
  const queryRef = useRef({ order, filter, importanceMode });
  queryRef.current = { order, filter, importanceMode };

  const fetchPage = useCallback(async (cursor: string | null, append: boolean) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const { order: o, filter: f, importanceMode: im } = queryRef.current;
      const params = new URLSearchParams({
        order: o, filter: f, importance: im,
        ...(cursor ? { cursor } : {}),
      });
      const res = await fetch(`/api/cases/${caseId}/timeline?${params}`);
      const data = await res.json() as ApiResponse;
      setEntries((prev) => append ? [...prev, ...data.entries] : data.entries);
      setNextCursor(data.nextCursor);
      setTotal(data.total);
    } catch { /* ignore */ } finally {
      if (append) setLoadingMore(false); else setLoading(false);
    }
  }, [caseId]);

  // Reset and reload whenever filters/order change
  useEffect(() => { void fetchPage(null, false); }, [fetchPage, order, filter, importanceMode]);

  const groups = groupByDate(entries);
  const remaining = total - entries.length;

  return (
    <div className="flex flex-col gap-4">

      {/* Header row */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-semibold text-slate-700">Timeline</h2>
        <div className="flex items-center gap-2">
          {/* Important only toggle */}
          <button
            onClick={() => setImportanceMode((m) => m === "normal" ? "all" : "normal")}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              importanceMode === "all"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
            }`}
          >
            {importanceMode === "all" ? "All activity" : "Important only"}
          </button>
          {/* Oldest/newest toggle */}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs text-slate-500 px-2"
            onClick={() => setOrder((o) => o === "desc" ? "asc" : "desc")}
          >
            {order === "desc"
              ? <><ChevronDown className="w-3.5 h-3.5" />Newest</>
              : <><ChevronUp className="w-3.5 h-3.5" />Oldest</>}
          </Button>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex gap-1.5 flex-wrap">
        {TIMELINE_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              filter === f.key
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Entries */}
      {loading && (
        <p className="text-xs text-slate-400 py-4 text-center">Loading…</p>
      )}

      {!loading && entries.length === 0 && (
        <p className="text-xs text-slate-400 py-4 text-center">No timeline entries.</p>
      )}

      {!loading && groups.map((group) => (
        <div key={group.label}>
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide px-1 mb-2">
            {group.label}
          </p>
          <div className="relative flex flex-col">
            <div className="absolute left-[13px] top-0 bottom-0 w-px bg-slate-200" />
            {group.entries.map((entry) => (
              <div key={entry.id} className={`flex gap-3 pb-4 relative ${entry.importance === "LOW" ? "opacity-60" : ""}`}>
                <div className={`relative z-10 flex items-center justify-center w-7 h-7 rounded-full shrink-0 ${typeColor(entry.type)}`}>
                  {typeIcon(entry.type)}
                </div>
                <div className="flex flex-col gap-0.5 pt-0.5 min-w-0">
                  <p className={`text-sm leading-snug ${entry.importance === "HIGH" ? "font-medium text-slate-900" : "text-slate-700"}`}>
                    {entry.title}
                  </p>
                  {entry.description && (
                    <p className="text-xs text-slate-500 leading-snug">{entry.description}</p>
                  )}
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {new Date(entry.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
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

      {/* Load more */}
      {nextCursor && (
        <button
          onClick={() => void fetchPage(nextCursor, true)}
          disabled={loadingMore}
          className="text-xs text-slate-500 hover:text-slate-700 py-1 text-center disabled:opacity-50"
        >
          {loadingMore ? "Loading…" : `Load more${remaining > 0 ? ` (${remaining} remaining)` : ""}`}
        </button>
      )}
    </div>
  );
}
