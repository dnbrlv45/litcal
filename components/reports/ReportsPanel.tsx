"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { CalendarDays, Download, FileClock, Scale } from "lucide-react";
import type { LucideIcon } from "lucide-react";

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
  const day = now.getUTCDay();
  const start = new Date(now);
  start.setUTCDate(now.getUTCDate() - day);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return {
    start: start.toISOString().slice(0, 10),
    end:   end.toISOString().slice(0, 10),
  };
}

function daysFromNow(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function ReportsPanel({ isAdmin, attorneys }: Props) {
  const week = getWeekBounds();
  const today = daysFromNow(0);

  const [calStart, setCalStart]       = useState(week.start);
  const [calEnd, setCalEnd]           = useState(week.end);
  const [calAttorney, setCalAttorney] = useState("");
  const [calLoading, setCalLoading]   = useState(false);
  const [calError, setCalError]       = useState<string | null>(null);

  const [caseAttorney, setCaseAttorney] = useState("");
  const [caseLoading, setCaseLoading]   = useState(false);
  const [caseError, setCaseError]       = useState<string | null>(null);

  const [discoveryEnd, setDiscoveryEnd]           = useState(daysFromNow(90));
  const [discoveryAttorney, setDiscoveryAttorney] = useState("");
  const [discoveryLoading, setDiscoveryLoading]   = useState(false);
  const [discoveryError, setDiscoveryError]       = useState<string | null>(null);

  const [trialStart, setTrialStart]       = useState(today);
  const [trialEnd, setTrialEnd]           = useState(daysFromNow(180));
  const [trialAttorney, setTrialAttorney] = useState("");
  const [trialLoading, setTrialLoading]   = useState(false);
  const [trialError, setTrialError]       = useState<string | null>(null);

  async function downloadReport({
    endpoint,
    params,
    fallback,
    setLoading,
    setError,
  }: {
    endpoint: string;
    params: URLSearchParams;
    fallback: string;
    setLoading: (loading: boolean) => void;
    setError: (error: string | null) => void;
  }) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${endpoint}?${params}`);
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      triggerDownload(blob, match?.[1] ?? fallback);
    } catch {
      setError("Report failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function downloadCalendar() {
    const params = new URLSearchParams({
      start: calStart,
      end: calEnd,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    if (calAttorney) params.set("attorneyId", calAttorney);
    void downloadReport({
      endpoint: "/api/exports/weekly-calendar",
      params,
      fallback: "litcal-weekly-calendar.xlsx",
      setLoading: setCalLoading,
      setError: setCalError,
    });
  }

  function downloadCases() {
    const params = new URLSearchParams();
    if (caseAttorney) params.set("attorneyId", caseAttorney);
    void downloadReport({
      endpoint: "/api/exports/open-cases",
      params,
      fallback: "litcal-open-cases.xlsx",
      setLoading: setCaseLoading,
      setError: setCaseError,
    });
  }

  function downloadDiscovery() {
    const params = new URLSearchParams({ end: discoveryEnd });
    if (discoveryAttorney) params.set("attorneyId", discoveryAttorney);
    void downloadReport({
      endpoint: "/api/exports/current-discovery",
      params,
      fallback: "litcal-current-discovery.xlsx",
      setLoading: setDiscoveryLoading,
      setError: setDiscoveryError,
    });
  }

  function downloadTrials() {
    const params = new URLSearchParams({ start: trialStart, end: trialEnd });
    if (trialAttorney) params.set("attorneyId", trialAttorney);
    void downloadReport({
      endpoint: "/api/exports/trial-dates",
      params,
      fallback: "litcal-trial-dates.xlsx",
      setLoading: setTrialLoading,
      setError: setTrialError,
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <ReportCard
        icon={CalendarDays}
        title="Weekly Calendar"
        description="Export a date-range calendar workbook with a Calendar tab and Events list."
        error={calError}
        loading={calLoading}
        disabled={!calStart || !calEnd}
        buttonLabel="Download Excel"
        onDownload={downloadCalendar}
      >
        <DateRange start={calStart} end={calEnd} onStart={setCalStart} onEnd={setCalEnd} />
        <AttorneySelect isAdmin={isAdmin} attorneys={attorneys} value={calAttorney} onChange={setCalAttorney} />
      </ReportCard>

      <ReportCard
        icon={Scale}
        title="Open Cases"
        description="Export all active and pending cases, including assigned staff."
        error={caseError}
        loading={caseLoading}
        buttonLabel="Download Excel"
        onDownload={downloadCases}
      >
        <AttorneySelect isAdmin={isAdmin} attorneys={attorneys} value={caseAttorney} onChange={setCaseAttorney} />
      </ReportCard>

      <ReportCard
        icon={FileClock}
        title="Current Discovery Due"
        description="Export active discovery response deadlines, including overdue items, due through the selected date."
        error={discoveryError}
        loading={discoveryLoading}
        disabled={!discoveryEnd}
        buttonLabel="Download Excel"
        onDownload={downloadDiscovery}
      >
        <DateInput label="Due Through" value={discoveryEnd} onChange={setDiscoveryEnd} />
        <AttorneySelect isAdmin={isAdmin} attorneys={attorneys} value={discoveryAttorney} onChange={setDiscoveryAttorney} />
      </ReportCard>

      <ReportCard
        icon={CalendarDays}
        title="Trial Dates"
        description="Export upcoming trial settings with case, court, and assigned attorney details."
        error={trialError}
        loading={trialLoading}
        disabled={!trialStart || !trialEnd}
        buttonLabel="Download Excel"
        onDownload={downloadTrials}
      >
        <DateRange start={trialStart} end={trialEnd} onStart={setTrialStart} onEnd={setTrialEnd} />
        <AttorneySelect isAdmin={isAdmin} attorneys={attorneys} value={trialAttorney} onChange={setTrialAttorney} />
      </ReportCard>
    </div>
  );
}

function ReportCard({
  icon: Icon,
  title,
  description,
  error,
  loading,
  disabled,
  buttonLabel,
  onDownload,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  error: string | null;
  loading: boolean;
  disabled?: boolean;
  buttonLabel: string;
  onDownload: () => void;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-700 ring-1 ring-teal-100">
            <Icon className="size-4" />
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-slate-950">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-4 px-5 py-4">
        {children}
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button
          type="button"
          onClick={onDownload}
          disabled={loading || disabled}
          className="flex items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-800 disabled:opacity-50"
        >
          <Download className="size-4" />
          {loading ? "Generating..." : buttonLabel}
        </button>
      </div>
    </section>
  );
}

function DateRange({
  start,
  end,
  onStart,
  onEnd,
}: {
  start: string;
  end: string;
  onStart: (value: string) => void;
  onEnd: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <DateInput label="Start Date" value={start} onChange={onStart} />
      <DateInput label="End Date" value={end} onChange={onEnd} />
    </div>
  );
}

function DateInput({ label, value, onChange }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-600">{label}</label>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
      />
    </div>
  );
}

function AttorneySelect({ isAdmin, attorneys, value, onChange }: {
  isAdmin: boolean;
  attorneys: Attorney[];
  value: string;
  onChange: (value: string) => void;
}) {
  if (!isAdmin || attorneys.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-600">Attorney</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
      >
        <option value="">All Attorneys</option>
        {attorneys.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>
    </div>
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
