"use client";

import { useState } from "react";
import { Download } from "lucide-react";

interface Attorney {
  id: string;
  name: string;
}

interface Props {
  isAdmin: boolean;
  attorneys: Attorney[];
}

function getWeekBounds() {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun
  const start = new Date(now);
  start.setUTCDate(now.getUTCDate() - day);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return {
    start: start.toISOString().slice(0, 10),
    end:   end.toISOString().slice(0, 10),
  };
}

export default function ExportsPanel({ isAdmin, attorneys }: Props) {
  const week = getWeekBounds();

  // Weekly calendar state
  const [calStart, setCalStart]       = useState(week.start);
  const [calEnd, setCalEnd]           = useState(week.end);
  const [calAttorney, setCalAttorney] = useState("");
  const [calLoading, setCalLoading]   = useState(false);
  const [calError, setCalError]       = useState<string | null>(null);

  // Open cases state
  const [caseAttorney, setCaseAttorney] = useState("");
  const [caseLoading, setCaseLoading]   = useState(false);
  const [caseError, setCaseError]       = useState<string | null>(null);

  async function downloadCalendar() {
    setCalLoading(true);
    setCalError(null);
    try {
      const params = new URLSearchParams({ start: calStart, end: calEnd });
      if (calAttorney) params.set("attorneyId", calAttorney);
      const res = await fetch(`/api/exports/weekly-calendar?${params}`);
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? "litcal-calendar.csv";
      triggerDownload(blob, filename);
    } catch {
      setCalError("Export failed. Please try again.");
    } finally {
      setCalLoading(false);
    }
  }

  async function downloadCases() {
    setCaseLoading(true);
    setCaseError(null);
    try {
      const params = new URLSearchParams();
      if (caseAttorney) params.set("attorneyId", caseAttorney);
      const res = await fetch(`/api/exports/open-cases?${params}`);
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? "litcal-open-cases.csv";
      triggerDownload(blob, filename);
    } catch {
      setCaseError("Export failed. Please try again.");
    } finally {
      setCaseLoading(false);
    }
  }

  return (
    <>
      {/* Weekly Calendar Export */}
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-semibold text-slate-950">Weekly Calendar</h2>
          <p className="mt-1 text-sm text-slate-500">
            Export events to CSV by date range and attorney.
          </p>
        </div>
        <div className="px-5 py-4 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">Start Date</label>
              <input
                type="date"
                value={calStart}
                onChange={(e) => setCalStart(e.target.value)}
                className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">End Date</label>
              <input
                type="date"
                value={calEnd}
                onChange={(e) => setCalEnd(e.target.value)}
                className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
          </div>

          {isAdmin && attorneys.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">Attorney</label>
              <select
                value={calAttorney}
                onChange={(e) => setCalAttorney(e.target.value)}
                className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
              >
                <option value="">All Attorneys</option>
                {attorneys.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          )}

          {calError && <p className="text-sm text-rose-600">{calError}</p>}

          <button
            type="button"
            onClick={downloadCalendar}
            disabled={calLoading || !calStart || !calEnd}
            className="flex items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-800 disabled:opacity-50"
          >
            <Download className="size-4" />
            {calLoading ? "Generating…" : "Download Excel"}
          </button>
        </div>
      </div>

      {/* Open Cases Export */}
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-semibold text-slate-950">Open Cases</h2>
          <p className="mt-1 text-sm text-slate-500">
            Export all active and pending cases to CSV.
          </p>
        </div>
        <div className="px-5 py-4 flex flex-col gap-4">
          {isAdmin && attorneys.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">Attorney</label>
              <select
                value={caseAttorney}
                onChange={(e) => setCaseAttorney(e.target.value)}
                className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
              >
                <option value="">All Attorneys</option>
                {attorneys.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          )}

          {caseError && <p className="text-sm text-rose-600">{caseError}</p>}

          <button
            type="button"
            onClick={downloadCases}
            disabled={caseLoading}
            className="flex items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-800 disabled:opacity-50"
          >
            <Download className="size-4" />
            {caseLoading ? "Generating…" : "Download Excel"}
          </button>
        </div>
      </div>
    </>
  );
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
