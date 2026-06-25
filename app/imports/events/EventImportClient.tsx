"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarDays, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type ParsedEvent = {
  uid: string;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  allDay: boolean;
  eventType: string;
  subtype: string | null;
  department: string | null;
  location: string | null;
  caseId: string | null;
  caseTitle: string | null;
  caseNumber: string | null;
  matchMethod: string | null;
  warnings: string[];
};

type WorkspaceCase = {
  id: string;
  title: string;
  caseNumber: string | null;
};

type PreviewResult = {
  totalParsed: number;
  eventsToImport: number;
  skippedAlarms: number;
  skippedDuplicates: number;
  matched: number;
  unmatched: number;
  events: ParsedEvent[];
  workspaceCases: WorkspaceCase[];
};

type CommitResult = {
  createdCount: number;
  failedCount: number;
  failed: { title: string; error: string }[];
};

const EVENT_TYPE_STYLES: Record<string, string> = {
  HEARING: "bg-blue-100 text-blue-700",
  TRIAL: "bg-red-100 text-red-700",
  DEPOSITION: "bg-purple-100 text-purple-700",
  MEDIATION: "bg-amber-100 text-amber-700",
  DEADLINE: "bg-orange-100 text-orange-700",
  CASE_MANAGEMENT_CONFERENCE: "bg-teal-100 text-teal-700",
  OTHER: "bg-slate-100 text-slate-600",
};

function formatDate(iso: string, allDay: boolean) {
  const d = new Date(iso);
  if (allDay) return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" });
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" });
}

function formatType(eventType: string, subtype: string | null) {
  const label = eventType.replace(/_/g, " ");
  return subtype ? `${label} (${subtype})` : label;
}

export default function EventImportClient() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [caseOverrides, setCaseOverrides] = useState<Map<string, string>>(new Map());

  function overrideCase(uid: string, caseId: string) {
    setCaseOverrides((prev) => {
      const next = new Map(prev);
      if (caseId) next.set(uid, caseId);
      else next.delete(uid);
      return next;
    });
  }

  const selectedEvents = useMemo(
    () => (preview?.events.filter((e) => selectedUids.has(e.uid)) ?? []).map((e) => {
      const overrideCaseId = caseOverrides.get(e.uid);
      if (!overrideCaseId) return e;
      return { ...e, caseId: overrideCaseId };
    }),
    [preview, selectedUids, caseOverrides],
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  async function onFileSelected(selected: File) {
    setFile(selected);
    setPreview(null);
    setResult(null);
    setError(null);
    setLoading(true);
    try {
      const text = await selected.text();
      const res = await fetch("/api/imports/events/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ icsContent: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not preview import.");
      setPreview(data);
      // Select all events by default
      setSelectedUids(new Set((data.events as ParsedEvent[]).map((e) => e.uid)));
    } catch (err) {
      console.error("Import preview failed:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (selectedEvents.length === 0) {
      setError("Select at least one event to import.");
      return;
    }
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/imports/events/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: selectedEvents }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed.");
      setResult(data);
      setSelectedUids(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  function toggleEvent(uid: string) {
    setSelectedUids((current) => {
      const next = new Set(current);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  function selectMatched() {
    if (!preview) return;
    setSelectedUids(new Set(preview.events.filter((e) => e.caseId).map((e) => e.uid)));
  }

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-4 py-5 md:px-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950">Import Events</h1>
            <p className="mt-1 text-sm text-slate-500">Upload a Google Calendar .ics file, review parsed events, then approve the import.</p>
          </div>
          <Link
            href="/calendar"
            className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Back to Calendar
          </Link>
        </div>
      </div>

      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5 md:px-8">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <input
            ref={fileInputRef}
            type="file"
            accept=".ics"
            tabIndex={-1}
            style={{ position: "absolute", width: 0, height: 0, overflow: "hidden", opacity: 0 }}
            onChange={(event) => {
              const selected = event.target.files?.[0];
              if (selected) onFileSelected(selected);
              event.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => {
              if (fileInputRef.current) {
                fileInputRef.current.value = "";
                fileInputRef.current.click();
              }
            }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const dropped = e.dataTransfer.files?.[0];
              if (dropped) onFileSelected(dropped);
            }}
            className={`flex w-full min-h-28 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${dragOver ? "border-teal-500 bg-teal-50" : "border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100"}`}
          >
            <CalendarDays className="size-8 text-teal-700" />
            {file ? (
              <p className="text-sm font-medium text-slate-700">{file.name}</p>
            ) : (
              <>
                <p className="text-sm font-medium text-slate-700">Click to choose a file or drag &amp; drop</p>
                <p className="text-xs text-slate-500">.ics calendar file</p>
              </>
            )}
          </button>
          {loading && <div className="mt-3 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="size-4 animate-spin" /> Parsing calendar events...</div>}
          {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}
        </section>

        {preview && (
          <>
            <section className="grid gap-3 md:grid-cols-5">
              <Metric label="Total in file" value={preview.totalParsed} />
              <Metric label="Events to import" value={preview.eventsToImport} />
              <Metric label="Matched to cases" value={preview.matched} />
              <Metric label="Unmatched" value={preview.unmatched} />
              <Metric label="Skipped (alarms/dupes)" value={preview.skippedAlarms + preview.skippedDuplicates} />
            </section>

            <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-950">{selectedEvents.length} selected for import</h2>
                  <p className="text-xs text-slate-500">All events are selected by default. Deselect any you want to skip.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={selectMatched}>Select Matched Only</Button>
                  <Button variant="outline" onClick={() => setSelectedUids(new Set(preview.events.map((e) => e.uid)))}>Select All</Button>
                  <Button variant="outline" onClick={() => setSelectedUids(new Set())}>Clear</Button>
                  <Button onClick={handleImport} disabled={importing || selectedEvents.length === 0} className="bg-teal-700 text-white hover:bg-teal-800">
                    {importing ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                    Import Events
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="w-12 px-4 py-3">Use</th>
                      <th className="px-4 py-3">Event</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Matched Case</th>
                      <th className="px-4 py-3">Dept</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.events.map((ev) => (
                      <tr key={ev.uid} className={ev.caseId ? "bg-white" : "bg-amber-50/40"}>
                        <td className="px-4 py-3 align-top">
                          <input
                            type="checkbox"
                            checked={selectedUids.has(ev.uid)}
                            onChange={() => toggleEvent(ev.uid)}
                            className="size-4 rounded border-slate-300"
                            aria-label={`Import ${ev.title}`}
                          />
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="font-semibold text-slate-950 max-w-xs truncate" title={ev.title}>{ev.title}</div>
                          {ev.location && <div className="mt-1 text-xs text-slate-500 truncate max-w-xs" title={ev.location}>{ev.location}</div>}
                        </td>
                        <td className="px-4 py-3 align-top text-slate-700 whitespace-nowrap">
                          <div>{formatDate(ev.startTime, ev.allDay)}</div>
                          {ev.allDay && <div className="mt-1 text-xs text-slate-500">All day</div>}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold whitespace-nowrap ${EVENT_TYPE_STYLES[ev.eventType] ?? EVENT_TYPE_STYLES.OTHER}`}>
                            {formatType(ev.eventType, ev.subtype)}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-top text-slate-700">
                          {ev.caseId && !caseOverrides.has(ev.uid) ? (
                            <div>
                              <div className="font-medium max-w-xs truncate" title={ev.caseTitle ?? ""}>{ev.caseTitle}</div>
                              {ev.caseNumber && <div className="mt-1 text-xs text-slate-500">#{ev.caseNumber}</div>}
                              <Badge className="mt-1 bg-green-100 text-green-700">{ev.matchMethod === "caseNumber" ? "Case #" : ev.matchMethod === "partyName" ? "Party" : "Title"}</Badge>
                            </div>
                          ) : (
                            <CasePicker
                              cases={preview?.workspaceCases ?? []}
                              value={caseOverrides.get(ev.uid) ?? ""}
                              onChange={(caseId) => overrideCase(ev.uid, caseId)}
                            />
                          )}
                        </td>
                        <td className="px-4 py-3 align-top text-slate-700">
                          {ev.department || <span className="text-slate-400">-</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {result && (
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              {result.failedCount ? <AlertTriangle className="size-5 text-amber-600" /> : <CheckCircle2 className="size-5 text-green-600" />}
              <h2 className="text-sm font-semibold text-slate-950">Import complete</h2>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              Created {result.createdCount} event{result.createdCount === 1 ? "" : "s"}, failed {result.failedCount}.
            </p>
            {result.failed.length > 0 && (
              <div className="mt-3 space-y-2">
                {result.failed.map((item) => (
                  <div key={`${item.title}-${item.error}`} className="flex gap-2 text-sm text-red-700">
                    <XCircle className="mt-0.5 size-4 shrink-0" />
                    <span>{item.title}: {item.error}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="text-2xl font-bold text-slate-950">{value}</div>
      <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

function CasePicker({ cases, value, onChange }: { cases: WorkspaceCase[]; value: string; onChange: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const selected = cases.find((c) => c.id === value);

  const filtered = search
    ? cases.filter((c) => {
        const q = search.toLowerCase();
        return c.title.toLowerCase().includes(q) || (c.caseNumber?.toLowerCase().includes(q) ?? false);
      })
    : cases;

  return (
    <div className="relative">
      {selected ? (
        <div className="flex items-center gap-1">
          <div className="text-sm font-medium truncate max-w-[180px]" title={selected.title}>{selected.title}</div>
          <button type="button" onClick={() => onChange("")} className="text-xs text-slate-400 hover:text-slate-600 ml-1">✕</button>
        </div>
      ) : (
        <input
          type="text"
          placeholder="Search cases…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          className="w-full max-w-[220px] rounded border border-slate-300 px-2 py-1 text-sm placeholder:text-slate-400 focus:border-teal-500 focus:outline-none"
        />
      )}
      {open && !selected && (
        <div className="absolute z-50 mt-1 max-h-48 w-72 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-400">No cases found</div>
          ) : (
            filtered.slice(0, 20).map((c) => (
              <button
                key={c.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onChange(c.id); setSearch(""); setOpen(false); }}
                className="flex w-full flex-col px-3 py-2 text-left hover:bg-slate-50"
              >
                <span className="text-sm font-medium text-slate-900 truncate">{c.title}</span>
                {c.caseNumber && <span className="text-xs text-slate-500">#{c.caseNumber}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
