"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Mail,
  ScanLine,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Inbox,
  PlugZap,
  RefreshCw,
  RotateCcw,
} from "lucide-react";

type Status = "PENDING" | "APPROVED" | "IGNORED" | "DUPLICATE";
type FilterTab = "PENDING" | "DUPLICATE" | "APPROVED" | "IGNORED";
type ConnectionState = "connected" | "needs_read_scope" | "not_connected" | "no_workspace" | "error" | "loading";

interface AISuggestion {
  id: string;
  gmailMessageId: string | null;
  classification: string;
  confidence: number | null;
  subject: string | null;
  sender: string | null;
  receivedAt: string | null;
  status: Status;
  extractedData: Record<string, unknown>;
  missingFields: string[] | null;
  duplicateOfId: string | null;
  createdAt: string;
}

interface ConnectionInfo {
  email?: string;
  state: ConnectionState;
}

const CLASSIFICATION_COLORS: Record<string, string> = {
  CALENDAR_EVENT:       "bg-blue-50 text-blue-700 ring-blue-200",
  DISCOVERY_EXTENSION:  "bg-amber-50 text-amber-700 ring-amber-200",
  NEW_CASE:             "bg-green-50 text-green-700 ring-green-200",
  IGNORE:               "bg-slate-50 text-slate-600 ring-slate-200",
};

const CLASSIFICATION_LABELS: Record<string, string> = {
  CALENDAR_EVENT:      "Calendar Event",
  DISCOVERY_EXTENSION: "Discovery Extension",
  NEW_CASE:            "New Case",
  IGNORE:              "Ignore",
};

function ConfidenceBadge({ value }: { value: number | null }) {
  if (value == null) return null;
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? "text-green-600" : pct >= 50 ? "text-amber-600" : "text-red-500";
  return <span className={`text-xs font-semibold ${color}`}>{pct}% confidence</span>;
}

function SuggestionCard({
  s,
  onAction,
  onRescan,
}: {
  s: AISuggestion;
  onAction: (id: string, action: string, extractedData?: Record<string, unknown>) => Promise<void>;
  onRescan: (messageId: string) => Promise<{ created: { classification: string; status: string }[]; error?: string } | null>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [acting, setActing] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const [rescanResult, setRescanResult] = useState<{ created: { classification: string; status: string }[]; error?: string } | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editJson, setEditJson] = useState(() => JSON.stringify(s.extractedData, null, 2));
  const [jsonError, setJsonError] = useState("");

  const data = s.extractedData as {
    case?: Record<string, string | null>;
    event?: Record<string, string | null>;
    discoveryExtension?: Record<string, string | null>;
    existingEventWarning?: string;
  };

  async function act(action: string) {
    setActing(true);
    let parsed: Record<string, unknown> | undefined;
    if (editMode) {
      try {
        parsed = JSON.parse(editJson);
        setJsonError("");
      } catch {
        setJsonError("Invalid JSON — fix before approving.");
        setActing(false);
        return;
      }
    }
    await onAction(s.id, action, parsed);
    setActing(false);
  }

  const isDuplicate = s.status === "DUPLICATE";

  return (
    <div className={`rounded-xl border bg-white shadow-sm ${isDuplicate ? "border-amber-200" : "border-slate-200"}`}>
      <div className="p-4">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${CLASSIFICATION_COLORS[s.classification] ?? "bg-slate-50 text-slate-600 ring-slate-200"}`}>
            {CLASSIFICATION_LABELS[s.classification] ?? s.classification}
          </span>
          <ConfidenceBadge value={s.confidence} />
          {isDuplicate && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
              <AlertTriangle className="size-3" /> Possible Duplicate
            </span>
          )}
          <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${
            s.status === "APPROVED" ? "bg-green-50 text-green-700" :
            s.status === "IGNORED"  ? "bg-slate-100 text-slate-500" :
            "bg-slate-100 text-slate-600"
          }`}>
            {s.status}
          </span>
        </div>

        <p className="font-semibold text-slate-900 truncate">{s.subject ?? "(no subject)"}</p>
        <p className="text-sm text-slate-500 mt-0.5">
          {s.sender}{s.receivedAt ? ` · ${new Date(s.receivedAt).toLocaleDateString()}` : ""}
        </p>

        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
          {data.case?.plaintiff  && <span><span className="font-medium">Plaintiff:</span> {data.case.plaintiff}</span>}
          {data.case?.defendant  && <span><span className="font-medium">Defendant:</span> {data.case.defendant}</span>}
          {data.case?.caseNumber && <span><span className="font-medium">Case #:</span> {data.case.caseNumber}</span>}
          {data.event?.date      && <span><span className="font-medium">Date:</span> {data.event.date}</span>}
          {data.event?.eventType && <span><span className="font-medium">Type:</span> {data.event.eventType}</span>}
          {data.discoveryExtension?.newDate && (
            <span><span className="font-medium">New Discovery Deadline:</span> {data.discoveryExtension.newDate}</span>
          )}
        </div>

        {data.existingEventWarning && (
          <p className="mt-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5">
            ⚠ {data.existingEventWarning}
          </p>
        )}

        {Array.isArray(s.missingFields) && s.missingFields.length > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            <span className="font-medium text-slate-700">Missing:</span> {s.missingFields.join(", ")}
          </p>
        )}
      </div>

      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-center gap-1 border-t border-slate-100 py-2 text-xs text-slate-500 hover:bg-slate-50 transition-colors"
      >
        {expanded
          ? <><ChevronUp className="size-3.5" /> Less</>
          : <><ChevronDown className="size-3.5" /> Details</>}
      </button>

      {expanded && (
        <div className="border-t border-slate-100 p-4">
          {editMode ? (
            <div className="space-y-2">
              <textarea
                value={editJson}
                onChange={(e) => setEditJson(e.target.value)}
                className="w-full font-mono text-xs rounded-lg border border-slate-200 p-3 min-h-[200px] focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              {jsonError && <p className="text-xs text-red-600">{jsonError}</p>}
            </div>
          ) : (
            <pre className="text-xs text-slate-600 overflow-auto bg-slate-50 rounded-lg p-3 max-h-64">
              {JSON.stringify(s.extractedData, null, 2)}
            </pre>
          )}
          <button
            onClick={() => { setEditMode((v) => !v); setJsonError(""); }}
            className="mt-2 text-xs text-teal-600 hover:underline"
          >
            {editMode ? "Cancel edit" : "Edit extracted data"}
          </button>
        </div>
      )}

      <div className="flex gap-2 border-t border-slate-100 p-3">
        {(s.status === "PENDING" || s.status === "DUPLICATE") && (
          <>
            {s.status === "DUPLICATE" ? (
              <button
                onClick={() => act("create_anyway")}
                disabled={acting}
                className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
              >
                {acting ? <Loader2 className="size-3.5 animate-spin" /> : <AlertTriangle className="size-3.5" />}
                Create Anyway
              </button>
            ) : (
              <button
                onClick={() => act("approve")}
                disabled={acting}
                className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50 transition-colors"
              >
                {acting ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                Approve
              </button>
            )}
            <button
              onClick={() => act("ignore")}
              disabled={acting}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              <XCircle className="size-3.5" />
              Ignore
            </button>
          </>
        )}
        {s.gmailMessageId && (
          <button
            onClick={async () => {
              setRescanning(true);
              setRescanResult(null);
              const result = await onRescan(s.gmailMessageId!);
              setRescanResult(result);
              setRescanning(false);
            }}
            disabled={rescanning || acting}
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            {rescanning ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
            {rescanning ? "Rescanning…" : "Rescan"}
          </button>
        )}
      </div>
      {rescanResult && (
        <div className={`border-t px-4 py-3 text-xs ${rescanResult.error ? "border-red-100 bg-red-50 text-red-700" : "border-teal-100 bg-teal-50 text-teal-700"}`}>
          {rescanResult.error ? (
            <span>Rescan error: {rescanResult.error}</span>
          ) : rescanResult.created.length === 0 ? (
            <span>Rescan complete — no suggestions created.</span>
          ) : (
            <span>
              Rescan created {rescanResult.created.length} suggestion{rescanResult.created.length !== 1 ? "s" : ""}:{" "}
              {rescanResult.created.map((c) => c.classification).join(", ")}. Refresh the page to see them.
            </span>
          )}
        </div>
      )}
    </div>
  );
}

const TABS: { label: string; value: FilterTab }[] = [
  { label: "Pending",    value: "PENDING" },
  { label: "Duplicates", value: "DUPLICATE" },
  { label: "Approved",   value: "APPROVED" },
  { label: "Ignored",    value: "IGNORED" },
];

function ConnectionBanner({ info, onScanClick, scanning }: {
  info: ConnectionInfo;
  onScanClick: () => void;
  scanning: boolean;
}) {
  if (info.state === "loading") {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="size-4 animate-spin" /> Checking Gmail connection…
      </div>
    );
  }

  if (info.state === "connected") {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-lg bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 ring-1 ring-green-200">
          <PlugZap className="size-3.5" />
          {info.email}
        </div>
        <button
          onClick={onScanClick}
          disabled={scanning}
          className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60 transition-colors"
        >
          {scanning
            ? <><Loader2 className="size-4 animate-spin" /> Scanning…</>
            : <><ScanLine className="size-4" /> Scan Inbox</>}
        </button>
      </div>
    );
  }

  if (info.state === "needs_read_scope") {
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
          <AlertTriangle className="size-3.5" />
          Inbox reading is not enabled. Reconnect Gmail with inbox access.
        </div>
        <a
          href="/api/auth/google/gmail"
          className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition-colors"
        >
          <RefreshCw className="size-4" />
          Reconnect Gmail
        </a>
      </div>
    );
  }

  if (info.state === "not_connected") {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-500">No Gmail inbox connected.</span>
        <a
          href="/settings/calendar"
          className="text-sm font-semibold text-teal-600 hover:underline"
        >
          Connect in Settings → Calendar
        </a>
      </div>
    );
  }

  return (
    <div className="text-sm text-red-600">
      Could not reach Gmail. Check your connection in{" "}
      <a href="/settings/calendar" className="underline">Settings → Calendar</a>.
    </div>
  );
}

export default function AIInboxClient() {
  const [tab, setTab] = useState<FilterTab>("PENDING");
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [connInfo, setConnInfo] = useState<ConnectionInfo>({ state: "loading" });
  const [loading, setLoading]   = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [scanError, setScanError]   = useState<string | null>(null);
  const [watchStatus, setWatchStatus] = useState<{ healthy: boolean; watchExpiration: string | null } | null>(null);
  const [registeringWatch, setRegisteringWatch] = useState(false);

  const fetchConnection = useCallback(async () => {
    setConnInfo({ state: "loading" });
    const res  = await fetch("/api/ai-inbox/connection");
    const json = await res.json() as { connection?: { email: string } | null; state: ConnectionState };
    setConnInfo({ state: json.state, email: json.connection?.email });
  }, []);

  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    const res  = await fetch(`/api/ai-inbox/suggestions?status=${tab}`);
    const json = await res.json() as { suggestions: AISuggestion[] };
    setSuggestions(json.suggestions ?? []);
    setLoading(false);
  }, [tab]);

  useEffect(() => { void fetchConnection(); }, [fetchConnection]);
  useEffect(() => { void fetchSuggestions(); }, [fetchSuggestions]);

  useEffect(() => {
    fetch("/api/ai-inbox/watch-status")
      .then(r => r.ok ? r.json() : null)
      .then(d => setWatchStatus(d as { healthy: boolean; watchExpiration: string | null } | null))
      .catch(() => null);
  }, []);

  async function handleRegisterWatch() {
    setRegisteringWatch(true);
    try {
      const res = await fetch("/api/ai-inbox/setup-watch", { method: "POST" });
      const json = await res.json() as { ok?: boolean; watchExpiration?: string; error?: string };
      if (json.ok) {
        setWatchStatus({ healthy: true, watchExpiration: json.watchExpiration ?? null });
        alert(`Gmail watch registered! Expires: ${json.watchExpiration ?? "unknown"}`);
      } else {
        alert(`Failed: ${json.error ?? "unknown error"}`);
      }
    } catch {
      alert("Request failed — check console");
    }
    setRegisteringWatch(false);
  }

  async function handleScan() {
    setScanning(true);
    setScanResult(null);
    setScanError(null);
    const res  = await fetch("/api/ai-inbox/test-scan", { method: "POST" });
    const json = await res.json() as { scanned?: number; created?: number; errors?: number; error?: string };
    if (!res.ok) {
      setScanError(json.error ?? "Scan failed");
    } else {
      const created = json.created ?? 0;
      const errors  = json.errors ?? 0;
      const msg = created > 0
        ? `Scanned ${json.scanned} emails · ${created} new suggestion${created !== 1 ? "s" : ""} created`
        : errors > 0
          ? `Scanned ${json.scanned} emails · ${errors} failed (check Gemini API key)`
          : `Scanned ${json.scanned} emails · nothing new`;
      setScanResult(msg);
      await fetchSuggestions();
    }
    setScanning(false);
  }

  async function handleRescan(messageId: string) {
    const res = await fetch("/api/ai-inbox/rescan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId }),
    });
    const json = await res.json() as { ok?: boolean; created?: { classification: string; status: string }[]; error?: string };
    if (!res.ok) return { created: [], error: json.error ?? "Rescan failed" };
    await fetchSuggestions();
    return { created: json.created ?? [] };
  }

  async function handleAction(id: string, action: string, extractedData?: Record<string, unknown>) {
    const res  = await fetch(`/api/ai-inbox/suggestions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, extractedData }),
    });
    const json = await res.json() as { error?: string };
    if (!res.ok) { alert(json.error ?? "Action failed"); return; }
    await fetchSuggestions();
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-lg bg-teal-50 text-teal-700">
              <Inbox className="size-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">AI Inbox</h1>
              <p className="text-xs text-slate-500">Review AI-extracted litigation suggestions before creating anything</p>
            </div>
          </div>
          <ConnectionBanner info={connInfo} onScanClick={handleScan} scanning={scanning} />
        </div>

        {scanResult && (
          <p className="mt-2 text-sm text-teal-700 bg-teal-50 rounded-lg px-3 py-2">{scanResult}</p>
        )}
        {scanError && (
          <p className="mt-2 text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{scanError}</p>
        )}

        {watchStatus && !watchStatus.healthy && (
          <div className="mt-2 flex items-center justify-between gap-3 rounded-lg bg-orange-50 border border-orange-200 px-4 py-2.5 text-xs text-orange-800">
            <span>
              <PlugZap className="inline size-3.5 mr-1.5 -mt-0.5" />
              Gmail push notifications are not active. Register the watch so new emails are processed automatically.
            </span>
            <button
              onClick={() => void handleRegisterWatch()}
              disabled={registeringWatch}
              className="shrink-0 flex items-center gap-1.5 rounded-md bg-orange-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-700 disabled:opacity-50"
            >
              {registeringWatch ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
              {registeringWatch ? "Registering…" : "Register Watch"}
            </button>
          </div>
        )}

        {watchStatus?.healthy && watchStatus.watchExpiration && (
          <div className="mt-2 rounded-lg bg-teal-50 border border-teal-200 px-4 py-2 text-xs text-teal-700">
            <CheckCircle2 className="inline size-3.5 mr-1.5 -mt-0.5" />
            Gmail push active · expires {new Date(watchStatus.watchExpiration).toLocaleDateString()}
          </div>
        )}

        <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5 text-xs text-amber-800">
          <Mail className="inline size-3.5 mr-1.5 -mt-0.5" />
          AI suggestions are never applied automatically. You must approve each one before any case, event, or deadline is created.
        </div>
      </div>

      {/* Tabs */}
      <div className="shrink-0 flex gap-0.5 border-b border-slate-200 bg-white px-6 pt-2">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.value
                ? "border-teal-600 text-teal-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : suggestions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
            <Inbox className="size-10 opacity-40" />
            <p className="text-sm">No {tab.toLowerCase()} suggestions</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 max-w-3xl mx-auto">
            {suggestions.map((s) => (
              <SuggestionCard key={s.id} s={s} onAction={handleAction} onRescan={handleRescan} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
