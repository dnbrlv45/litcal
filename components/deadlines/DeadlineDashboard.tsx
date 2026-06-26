"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  Search,
  Scale,
  CheckCircle2,
  Zap,
  Gavel,
  AlertTriangle,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import DeadlineDetailPanel from "./DeadlineDetailPanel";
import type { DeadlineItem, TrialItem } from "@/app/api/deadlines/route";

interface Props {
  currentUserId: string;
  currentUserJobTitle: string | null;
  currentUserRole: string;
}

interface Member {
  id: string;
  jobTitle: string | null;
  user: { id: string; firstName: string | null; lastName: string | null; email: string };
}

interface Filters {
  attorneyId: string;
  paralegalId: string;
  caseId: string;
  source: string;
  assignedToMe: boolean;
  includeCompleted: boolean;
}

const DEFAULT_FILTERS: Filters = {
  attorneyId: "",
  paralegalId: "",
  caseId: "",
  source: "",
  assignedToMe: false,
  includeCompleted: false,
};

const LS_SECTIONS = "litcal_deadline_sections";
const LS_FILTERS = "litcal_deadline_filters";

function startOfDay(d: Date) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function daysDiff(a: Date, b: Date) {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / (1000 * 60 * 60 * 24));
}

function DaysBadge({ dueDate, isCompleted }: { dueDate: string; isCompleted: boolean }) {
  if (isCompleted) return null;
  const today = startOfDay(new Date());
  const due = new Date(dueDate);
  const diff = daysDiff(today, due);
  if (diff < 0) {
    return (
      <span className="text-xs font-semibold text-rose-600 whitespace-nowrap">
        {Math.abs(diff)}d overdue
      </span>
    );
  }
  if (diff === 0) {
    return <span className="text-xs font-semibold text-orange-500 whitespace-nowrap">Due today</span>;
  }
  return <span className="text-xs text-slate-400 whitespace-nowrap">in {diff}d</span>;
}

function StatusDot({ dueDate, isCompleted }: { dueDate: string; isCompleted: boolean }) {
  if (isCompleted) return <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />;
  const today = startOfDay(new Date());
  const due = new Date(dueDate);
  const diff = daysDiff(today, due);
  if (diff < 0) return <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />;
  if (diff === 0) return <span className="w-2 h-2 rounded-full bg-orange-400 shrink-0" />;
  if (diff <= 7) return <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />;
  return <span className="w-2 h-2 rounded-full bg-slate-300 shrink-0" />;
}

function DeadlineRow({
  item,
  selected,
  onClick,
}: {
  item: DeadlineItem;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 text-left rounded-lg transition-colors ${
        selected ? "bg-teal-50 ring-1 ring-teal-200" : "hover:bg-slate-50"
      }`}
    >
      <StatusDot dueDate={item.dueDate} isCompleted={item.isCompleted} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-semibold text-slate-900 truncate ${item.isCompleted ? "line-through text-slate-400" : ""}`}>
            {item.title}
          </span>
          {item.discoveryItemId && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 shrink-0">Discovery</span>
          )}
          {item.extensionCount != null && item.extensionCount > 0 && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 shrink-0">
              Ext. {item.extensionCount}
            </span>
          )}
          {!item.discoveryItemId && item.source === "generated" && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700 shrink-0">
              <Zap className="w-2.5 h-2.5" />
              Auto
            </span>
          )}
          {item.type === "task" && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 shrink-0">Task</span>
          )}
        </div>
        {(item.caseTitle || item.caseNumber) && (
          <div className="flex items-center gap-1 mt-0.5 text-xs text-slate-400 truncate">
            {item.caseTitle && <span className="truncate">{item.caseTitle}</span>}
            {item.caseNumber && <span className="shrink-0">#{item.caseNumber}</span>}
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="text-xs text-slate-500">
          {new Date(item.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </span>
        <DaysBadge dueDate={item.dueDate} isCompleted={item.isCompleted} />
        {item.assignedAttorneyName && (
          <span className="text-[10px] text-slate-400 truncate max-w-[80px]">{item.assignedAttorneyName}</span>
        )}
      </div>
    </button>
  );
}

function SectionHeader({
  label,
  count,
  collapsed,
  onToggle,
  icon,
}: {
  label: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center gap-2 px-1 py-2 text-left group"
    >
      {collapsed ? (
        <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      ) : (
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      )}
      {icon}
      <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">{label}</span>
      <span className="text-[11px] font-semibold text-slate-400 bg-slate-100 rounded-full px-1.5 py-0.5 leading-none">
        {count}
      </span>
    </button>
  );
}

export default function DeadlineDashboard({ currentUserId, currentUserJobTitle, currentUserRole }: Props) {
  const [deadlines, setDeadlines] = useState<DeadlineItem[]>([]);
  const [trials, setTrials] = useState<TrialItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [selectedDeadline, setSelectedDeadline] = useState<DeadlineItem | null>(null);
  const [completing, setCompleting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [bulkCompleting, setBulkCompleting] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);

  // Restore persisted state
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_SECTIONS);
      if (saved) setCollapsedSections(new Set(JSON.parse(saved) as string[]));
    } catch { /* ignore */ }
    try {
      const savedFilters = localStorage.getItem(LS_FILTERS);
      if (savedFilters) setFilters(JSON.parse(savedFilters) as Filters);
    } catch { /* ignore */ }
  }, []);

  function persistSections(next: Set<string>) {
    try { localStorage.setItem(LS_SECTIONS, JSON.stringify([...next])); } catch { /* ignore */ }
  }

  function persistFilters(next: Filters) {
    try { localStorage.setItem(LS_FILTERS, JSON.stringify(next)); } catch { /* ignore */ }
  }

  function toggleSection(key: string) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      persistSections(next);
      return next;
    });
  }

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      persistFilters(next);
      return next;
    });
  }

  // Fetch workspace members
  useEffect(() => {
    fetch("/api/workspaces/members")
      .then((r) => r.json())
      .then((d) => setMembers((d.members ?? []) as Member[]))
      .catch(() => {});
  }, []);

  const fetchDeadlines = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.attorneyId) params.set("attorneyId", filters.attorneyId);
    if (filters.paralegalId) params.set("paralegalId", filters.paralegalId);
    if (filters.caseId) params.set("caseId", filters.caseId);
    if (filters.source) params.set("source", filters.source);
    if (filters.includeCompleted) params.set("includeCompleted", "true");
    if (filters.assignedToMe) params.set("attorneyId", currentUserId);

    try {
      const res = await fetch(`/api/deadlines?${params}`);
      if (!res.ok) return;
      const data = await res.json() as { deadlines: DeadlineItem[]; trials: TrialItem[] };
      setDeadlines(data.deadlines ?? []);
      setTrials(data.trials ?? []);
    } finally {
      setLoading(false);
    }
  }, [filters, currentUserId]);

  useEffect(() => { void fetchDeadlines(); }, [fetchDeadlines]);

  const attorneys = members.filter((m) => m.jobTitle === "ATTORNEY");
  const paralegals = members.filter((m) => m.jobTitle === "PARALEGAL");

  function memberName(m: Member) {
    return [m.user.firstName, m.user.lastName].filter(Boolean).join(" ") || m.user.email;
  }

  // Search + sectioning
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return deadlines;
    return deadlines.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        (d.caseTitle ?? "").toLowerCase().includes(q) ||
        (d.caseNumber ?? "").toLowerCase().includes(q)
    );
  }, [deadlines, search]);

  const today = startOfDay(new Date());
  const endOfWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const fourteenDaysAgo = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000);

  const sections = useMemo(() => {
    const overdue: DeadlineItem[] = [];
    const dueToday: DeadlineItem[] = [];
    const thisWeek: DeadlineItem[] = [];
    const thisMonth: DeadlineItem[] = [];
    const upcoming: DeadlineItem[] = [];
    const completedRecently: DeadlineItem[] = [];

    for (const d of filtered) {
      if (d.isCompleted) {
        const completedAt = d.completedAt ? new Date(d.completedAt) : null;
        if (completedAt && completedAt >= fourteenDaysAgo) completedRecently.push(d);
        continue;
      }
      const due = startOfDay(new Date(d.dueDate));
      const diff = daysDiff(today, due);
      if (diff < 0) overdue.push(d);
      else if (diff === 0) dueToday.push(d);
      else if (due < endOfWeek) thisWeek.push(d);
      else if (due <= endOfMonth) thisMonth.push(d);
      else upcoming.push(d);
    }

    return { overdue, dueToday, thisWeek, thisMonth, upcoming, completedRecently };
  }, [filtered, today, endOfWeek, endOfMonth, fourteenDaysAgo]);

  async function handleMarkComplete(id: string) {
    setCompleting(true);
    try {
      await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "DONE" }),
      });
      await fetchDeadlines();
      setSelectedDeadline(null);
    } finally {
      setCompleting(false);
    }
  }

  async function handleBulkComplete() {
    setBulkCompleting(true);
    try {
      await fetch("/api/deadlines/bulk-complete", { method: "POST" });
      await fetchDeadlines();
      setSelectedDeadline(null);
    } finally {
      setBulkCompleting(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    try {
      await fetch(`/api/calendar/events/${id}`, { method: "DELETE" });
      await fetchDeadlines();
      setSelectedDeadline(null);
    } finally {
      setDeleting(false);
    }
  }

  function renderSection(key: string, label: string, items: DeadlineItem[], icon?: React.ReactNode) {
    if (items.length === 0) return null;
    const collapsed = collapsedSections.has(key);
    return (
      <div key={key} className="flex flex-col">
        <SectionHeader
          label={label}
          count={items.length}
          collapsed={collapsed}
          onToggle={() => toggleSection(key)}
          icon={icon}
        />
        {!collapsed && (
          <div className="flex flex-col gap-0.5">
            {items.map((item) => (
              <DeadlineRow
                key={item.id}
                item={item}
                selected={selectedDeadline?.id === item.id}
                onClick={() => setSelectedDeadline(item.id === selectedDeadline?.id ? null : item)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const totalCount = filtered.filter((d) => !d.isCompleted).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Page header */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-lg bg-teal-50 text-teal-700">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-950">Deadline Dashboard</h1>
            <p className="text-sm text-slate-500">
              {loading ? "Loading…" : `${totalCount} open deadline${totalCount !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 px-6 py-3 border-b border-slate-200 bg-white shrink-0">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search deadlines…"
            className="pl-8 h-8 text-sm"
          />
        </div>

        {attorneys.length > 0 && (
          <select
            value={filters.assignedToMe ? currentUserId : filters.attorneyId}
            onChange={(e) => updateFilter("attorneyId", e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">All Attorneys</option>
            {attorneys.map((m) => (
              <option key={m.id} value={m.user.id}>{memberName(m)}</option>
            ))}
          </select>
        )}

        {paralegals.length > 0 && (
          <select
            value={filters.paralegalId}
            onChange={(e) => updateFilter("paralegalId", e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">All Paralegals</option>
            {paralegals.map((m) => (
              <option key={m.id} value={m.user.id}>{memberName(m)}</option>
            ))}
          </select>
        )}

        <select
          value={filters.source}
          onChange={(e) => updateFilter("source", e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="">All Sources</option>
          <option value="generated">Generated</option>
          <option value="manual">Manual</option>
        </select>

        <label className="flex items-center gap-1.5 cursor-pointer select-none text-xs text-slate-600">
          <input
            type="checkbox"
            checked={filters.assignedToMe}
            onChange={(e) => updateFilter("assignedToMe", e.target.checked)}
            className="h-3.5 w-3.5 rounded border-slate-300 accent-teal-600"
          />
          Assigned to me
        </label>

        <label className="flex items-center gap-1.5 cursor-pointer select-none text-xs text-slate-600">
          <input
            type="checkbox"
            checked={filters.includeCompleted}
            onChange={(e) => updateFilter("includeCompleted", e.target.checked)}
            className="h-3.5 w-3.5 rounded border-slate-300 accent-teal-600"
          />
          Include completed
        </label>

        {(filters.attorneyId || filters.paralegalId || filters.source || filters.assignedToMe || filters.includeCompleted) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-slate-500"
            onClick={() => { setFilters(DEFAULT_FILTERS); persistFilters(DEFAULT_FILTERS); }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Main content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Sections list */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-24 text-slate-400 text-sm">
              Loading deadlines…
            </div>
          ) : totalCount === 0 && sections.completedRecently.length === 0 && trials.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <div className="grid size-12 place-items-center rounded-full bg-slate-100">
                <Scale className="w-6 h-6 text-slate-400" />
              </div>
              <p className="text-slate-500 text-sm">No deadlines found</p>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {sections.overdue.length > 0 && (
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <SectionHeader
                        label="Overdue"
                        count={sections.overdue.length}
                        collapsed={collapsedSections.has("overdue")}
                        onToggle={() => toggleSection("overdue")}
                        icon={<AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />}
                      />
                    </div>
                    <button
                      onClick={handleBulkComplete}
                      disabled={bulkCompleting}
                      className="text-[11px] font-medium text-slate-500 hover:text-teal-700 hover:underline disabled:opacity-50 shrink-0 px-1"
                    >
                      {bulkCompleting ? "Completing…" : "Mark all complete"}
                    </button>
                  </div>
                  {!collapsedSections.has("overdue") && (
                    <div className="flex flex-col gap-0.5">
                      {sections.overdue.map((item) => (
                        <DeadlineRow
                          key={item.id}
                          item={item}
                          selected={selectedDeadline?.id === item.id}
                          onClick={() => setSelectedDeadline(item.id === selectedDeadline?.id ? null : item)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
              {renderSection(
                "today",
                "Due Today",
                sections.dueToday,
                <Calendar className="w-3.5 h-3.5 text-orange-500 shrink-0" />
              )}
              {renderSection("week", "Due This Week", sections.thisWeek)}
              {renderSection("month", "Due This Month", sections.thisMonth)}
              {renderSection("upcoming", "Upcoming", sections.upcoming)}

              {/* Upcoming Trials */}
              {trials.length > 0 && (
                <div className="flex flex-col">
                  <SectionHeader
                    label="Upcoming Trials"
                    count={trials.length}
                    collapsed={collapsedSections.has("trials")}
                    onToggle={() => toggleSection("trials")}
                    icon={<Gavel className="w-3.5 h-3.5 text-violet-500 shrink-0" />}
                  />
                  {!collapsedSections.has("trials") && (
                    <div className="flex flex-col gap-2 mt-1">
                      {trials.map((trial) => {
                        const daysUntil = daysDiff(today, new Date(trial.startTime));
                        return (
                          <div key={trial.id} className="rounded-lg border border-violet-200 bg-violet-50/40 px-4 py-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <Gavel className="w-3.5 h-3.5 text-violet-600 shrink-0" />
                                  <span className="text-sm font-semibold text-slate-900 truncate">{trial.title}</span>
                                </div>
                                {trial.caseTitle && (
                                  <div className="mt-0.5 text-xs text-slate-500 truncate">
                                    {trial.caseId ? (
                                      <Link href={`/cases/${trial.caseId}`} className="hover:text-teal-700 hover:underline">
                                        {trial.caseTitle}{trial.caseNumber ? ` #${trial.caseNumber}` : ""}
                                      </Link>
                                    ) : (
                                      <>{trial.caseTitle}{trial.caseNumber ? ` #${trial.caseNumber}` : ""}</>
                                    )}
                                  </div>
                                )}
                                {trial.assignedAttorneyName && (
                                  <div className="mt-0.5 text-xs text-slate-400">{trial.assignedAttorneyName}</div>
                                )}
                              </div>
                              <div className="flex flex-col items-end gap-1 shrink-0">
                                <span className="text-xs font-semibold text-slate-700">
                                  {new Date(trial.startTime).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                </span>
                                <span className={`text-xs font-semibold ${daysUntil <= 7 ? "text-rose-600" : daysUntil <= 30 ? "text-amber-600" : "text-slate-500"}`}>
                                  {daysUntil === 0 ? "Today" : `in ${daysUntil}d`}
                                </span>
                              </div>
                            </div>
                            {trial.relatedDeadlines.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {trial.relatedDeadlines.slice(0, 5).map((rd) => (
                                  <span
                                    key={rd.id}
                                    className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 truncate max-w-[140px]"
                                    title={rd.title}
                                  >
                                    {rd.title}
                                  </span>
                                ))}
                                {trial.relatedDeadlines.length > 5 && (
                                  <span className="text-[10px] text-slate-400">+{trial.relatedDeadlines.length - 5} more</span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Completed Recently */}
              {sections.completedRecently.length > 0 && (
                <div className="flex flex-col">
                  <SectionHeader
                    label="Completed Recently"
                    count={sections.completedRecently.length}
                    collapsed={collapsedSections.has("completed")}
                    onToggle={() => toggleSection("completed")}
                    icon={<CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />}
                  />
                  {!collapsedSections.has("completed") && (
                    <div className="flex flex-col gap-0.5">
                      {sections.completedRecently.map((item) => (
                        <DeadlineRow
                          key={item.id}
                          item={item}
                          selected={selectedDeadline?.id === item.id}
                          onClick={() => setSelectedDeadline(item.id === selectedDeadline?.id ? null : item)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selectedDeadline && (
          <div className="shrink-0 px-3 py-4 overflow-y-auto">
            <DeadlineDetailPanel
              deadline={selectedDeadline}
              onClose={() => setSelectedDeadline(null)}
              onMarkComplete={handleMarkComplete}
              onDelete={handleDelete}
              completing={completing}
              deleting={deleting}
            />
          </div>
        )}
      </div>
    </div>
  );
}
