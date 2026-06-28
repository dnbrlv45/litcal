"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Mail,
  ScanLine,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Briefcase,
  CalendarPlus,
  CalendarX2,
  ChevronDown,
  ChevronUp,
  FileText,
  Loader2,
  Inbox,
  PlugZap,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";

type Status = "PENDING" | "APPROVED" | "IGNORED" | "DUPLICATE";
type FilterTab = "PENDING" | "DUPLICATE" | "APPROVED" | "IGNORED";
type ConnectionState = "connected" | "needs_read_scope" | "not_connected" | "no_workspace" | "error" | "loading";
type StatusCounts = Record<FilterTab, number>;

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
  userAction: string | null;
  createdAt: string;
}

interface ConnectionInfo {
  email?: string;
  state: ConnectionState;
}

interface AIInboxMetrics {
  totalSuggestions: number;
  approvalRate: number;
  ignoreRate: number;
  duplicateRate: number;
  editBeforeApprovalRate: number;
  counts: {
    approved: number;
    ignored: number;
    duplicates: number;
    editedBeforeApproval: number;
    rescans: number;
    updates: number;
    cancellations: number;
  };
  classificationBreakdown: Record<string, { total: number; approved: number; ignored: number; duplicates: number }>;
  avgConfidenceByClassification: Record<string, number>;
  mostCommonlyCorrectedFields: { field: string; count: number }[];
}

const CLASSIFICATION_COLORS: Record<string, string> = {
  CALENDAR_EVENT:       "bg-blue-50 text-blue-700 ring-blue-200",
  EVENT_CANCELLATION:   "bg-rose-50 text-rose-700 ring-rose-200",
  DISCOVERY:            "bg-cyan-50 text-cyan-700 ring-cyan-200",
  DISCOVERY_EXTENSION:  "bg-amber-50 text-amber-700 ring-amber-200",
  NEW_CASE:             "bg-green-50 text-green-700 ring-green-200",
  IGNORE:               "bg-slate-50 text-slate-600 ring-slate-200",
};

const CLASSIFICATION_LABELS: Record<string, string> = {
  CALENDAR_EVENT:      "Calendar Event",
  EVENT_CANCELLATION:  "Event Cancellation",
  DISCOVERY:           "Discovery",
  DISCOVERY_EXTENSION: "Discovery Extension",
  NEW_CASE:            "New Case",
  IGNORE:              "Ignore",
};

const EMPTY_COUNTS: StatusCounts = {
  PENDING: 0,
  DUPLICATE: 0,
  APPROVED: 0,
  IGNORED: 0,
};

function ConfidenceBadge({ value }: { value: number | null }) {
  if (value == null) return null;
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? "text-green-600" : pct >= 50 ? "text-amber-600" : "text-red-500";
  return <span className={`text-xs font-semibold ${color}`}>{pct}% confidence</span>;
}

function SummaryField({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="min-w-0 rounded-md bg-white px-3 py-2 ring-1 ring-slate-200">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-0.5 truncate text-sm font-medium ${value ? "text-slate-800" : "text-slate-400"}`}>
        {valueOrDash(value)}
      </div>
    </div>
  );
}

function valueOrDash(value: unknown) {
  if (value == null || value === "") return "Not found";
  return String(value);
}

function formatReceivedAt(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function suggestionVerb(classification: string, duplicate: boolean) {
  if (duplicate) return "Review duplicate";
  if (classification === "CALENDAR_EVENT") return "Create calendar event";
  if (classification === "EVENT_CANCELLATION") return "Cancel event";
  if (classification === "DISCOVERY") return "Create discovery deadline";
  if (classification === "DISCOVERY_EXTENSION") return "Apply discovery extension";
  if (classification === "NEW_CASE") return "Create case";
  return "Review suggestion";
}

function suggestionIcon(classification: string) {
  if (classification === "CALENDAR_EVENT") return CalendarPlus;
  if (classification === "EVENT_CANCELLATION") return CalendarX2;
  if (classification === "DISCOVERY" || classification === "DISCOVERY_EXTENSION") return FileText;
  if (classification === "NEW_CASE") return Briefcase;
  return ShieldCheck;
}

function SuggestionCard({
  s,
  onAction,
  onRescan,
  onBusyChange,
}: {
  s: AISuggestion;
  onAction: (id: string, action: string, extractedData?: Record<string, unknown>, extra?: { notes?: string; matchedEventId?: string }) => Promise<void>;
  onRescan: (messageId: string, suggestionId: string) => Promise<{ created: { classification: string; status: string }[]; error?: string } | null>;
  onBusyChange?: (id: string, busy: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [acting, setActing] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const [rescanResult, setRescanResult] = useState<{ created: { classification: string; status: string }[]; error?: string } | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editJson, setEditJson] = useState(() => JSON.stringify(s.extractedData, null, 2));
  const [jsonError, setJsonError] = useState("");

  // Tell the parent when this card is mid-interaction so auto-refresh pauses.
  const busy = acting || rescanning || editMode;
  useEffect(() => {
    onBusyChange?.(s.id, busy);
    return () => onBusyChange?.(s.id, false);
  }, [busy, s.id, onBusyChange]);

  const data = s.extractedData as {
    case?: Record<string, string | null>;
    event?: Record<string, string | null>;
    discovery?: Record<string, string | null>;
    discoveryExtension?: Record<string, string | null>;
    cancellation?: Record<string, string | null>;
    existingEventWarning?: string;
    matchedEventId?: string;
    matchedEventDetails?: { id: string; title: string; date: string; eventType: string; caseTitle: string | null; caseNumber: string | null };
    matchedCaseId?: string;
    matchedCaseTitle?: string;
    matchedCaseNumber?: string;
  };
  const [noteText, setNoteText] = useState("");

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
    await onAction(s.id, action, parsed, {
      notes: noteText || undefined,
      matchedEventId: data.matchedEventId,
    });
    setActing(false);
  }

  const isDuplicate = s.status === "DUPLICATE";
  const ActionIcon = suggestionIcon(s.classification);
  const actionLabel = suggestionVerb(s.classification, isDuplicate);
  const caseTitle = [data.case?.plaintiff, "v.", data.case?.defendant].filter(Boolean).join(" ");
  const primaryDate =
    data.cancellation?.originalDate ??
    data.event?.date ??
    data.discovery?.servedOrReceivedDate ??
    data.discoveryExtension?.newDate ??
    data.case?.dateFiled;
  const primaryDetail =
    data.cancellation?.eventType ??
    data.event?.eventType ??
    data.discovery?.discoveryType ??
    data.discoveryExtension?.appliesTo ??
    data.case?.caseType;

  return (
    <div className={`rounded-xl border bg-white shadow-sm ${isDuplicate ? "border-amber-200" : "border-slate-200"}`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`grid size-10 shrink-0 place-items-center rounded-lg ring-1 ${
            isDuplicate ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-teal-50 text-teal-700 ring-teal-200"
          }`}>
            {isDuplicate ? <AlertTriangle className="size-5" /> : <ActionIcon className="size-5" />}
          </div>
          <div className="min-w-0 flex-1">
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
              {s.sender}{s.receivedAt ? ` · ${formatReceivedAt(s.receivedAt)}` : ""}
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Review summary</span>
            <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-teal-700 ring-1 ring-slate-200">
              {actionLabel}
            </span>
          </div>
          <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
            <SummaryField label="Case" value={data.matchedCaseTitle ?? (caseTitle || data.case?.caseNumber)} />
            <SummaryField label="Case number" value={data.matchedCaseNumber ?? data.case?.caseNumber} />
            {data.matchedCaseId && (
              <span className="col-span-2 text-xs text-teal-700 font-medium">✓ Matched to existing case</span>
            )}
            <SummaryField label="Date" value={primaryDate} />
            <SummaryField label="Type" value={primaryDetail} />
            <SummaryField label="Court" value={data.case?.court ?? data.case?.county} />
            {data.cancellation?.reason && <SummaryField label="Reason" value={data.cancellation.reason} />}
            {data.cancellation?.newDate && <SummaryField label="New date" value={data.cancellation.newDate} />}
            <SummaryField label="Attorney" value={data.event?.attorney ?? data.discoveryExtension?.requestedBy} />
          </div>
        </div>

        {data.matchedEventDetails ? (
          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/70 p-3">
            <p className="text-xs font-bold text-amber-800 mb-1.5">Possible Match Found</p>
            <div className="grid gap-1 text-xs text-amber-900 sm:grid-cols-2">
              <SummaryField label="Existing event" value={data.matchedEventDetails.title} />
              <SummaryField label="Date" value={data.matchedEventDetails.date} />
              <SummaryField label="Type" value={data.matchedEventDetails.eventType} />
              <SummaryField label="Case" value={data.matchedEventDetails.caseTitle} />
            </div>
          </div>
        ) : data.existingEventWarning ? (
          <p className="mt-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5">
            ⚠ {data.existingEventWarning}
          </p>
        ) : null}

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
          ? <><ChevronUp className="size-3.5" /> Hide raw extraction</>
          : <><ChevronDown className="size-3.5" /> Raw extraction</>}
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

      {/* Notes */}
      {(s.status === "PENDING" || s.status === "DUPLICATE") && (
        <div className="border-t border-slate-100 px-3 pt-2">
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Add a note (optional)..."
            className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-teal-300 focus:ring-1 focus:ring-teal-200 resize-none"
            rows={1}
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-slate-100 p-3">
        {(s.status === "PENDING" || s.status === "DUPLICATE") && (
          <>
            {/* Update Existing — shown when a matching event was found */}
            {data.matchedEventId && s.classification === "CALENDAR_EVENT" && (
              <button
                onClick={() => act("update_existing")}
                disabled={acting}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {acting ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                Update Existing
              </button>
            )}
            {/* Cancel Existing — shown for cancellation suggestions with a matched event */}
            {data.matchedEventId && s.classification === "EVENT_CANCELLATION" && (
              <button
                onClick={() => act("cancel_existing")}
                disabled={acting}
                className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50 transition-colors"
              >
                {acting ? <Loader2 className="size-3.5 animate-spin" /> : <CalendarX2 className="size-3.5" />}
                Cancel Existing
              </button>
            )}
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
                {actionLabel}
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
              const result = await onRescan(s.gmailMessageId!, s.id);
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

function QueueMetric({ label, value, tone }: {
  label: string;
  value: number;
  tone: "teal" | "amber" | "green" | "slate";
}) {
  const colors = {
    teal:  "bg-teal-50 text-teal-800 ring-teal-200",
    amber: "bg-amber-50 text-amber-800 ring-amber-200",
    green: "bg-green-50 text-green-800 ring-green-200",
    slate: "bg-slate-50 text-slate-700 ring-slate-200",
  }[tone];

  return (
    <div className={`rounded-lg px-3 py-2 ring-1 ${colors}`}>
      <div className="text-lg font-bold leading-none">{value}</div>
      <div className="mt-1 text-[11px] font-semibold">{label}</div>
    </div>
  );
}

function AdminMetricsPanel({ metrics }: { metrics: AIInboxMetrics | null }) {
  if (!metrics) return null;

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">AI Feedback Metrics</h2>
          <p className="mt-1 text-xs text-slate-500">Visible to super admins only.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <MetricChip label="Total" value={String(metrics.totalSuggestions)} />
          <MetricChip label="Approved" value={formatRate(metrics.approvalRate)} />
          <MetricChip label="Ignored" value={formatRate(metrics.ignoreRate)} />
          <MetricChip label="Duplicates" value={formatRate(metrics.duplicateRate)} />
          <MetricChip label="Edited" value={formatRate(metrics.editBeforeApprovalRate)} />
        </div>
      </div>
      {/* Classification breakdown */}
      {metrics.classificationBreakdown && Object.keys(metrics.classificationBreakdown).length > 0 && (
        <div className="mt-3 border-t border-slate-200 pt-3">
          <p className="text-xs font-semibold text-slate-700 mb-2">By Classification</p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {Object.entries(metrics.classificationBreakdown).map(([cls, data]) => (
              <div key={cls} className="rounded-md bg-white px-2.5 py-1.5 ring-1 ring-slate-200">
                <div className="text-[10px] font-bold text-slate-500 uppercase">{CLASSIFICATION_LABELS[cls] ?? cls}</div>
                <div className="text-xs text-slate-700 mt-0.5">
                  {data.total} total · {data.approved} approved
                  {metrics.avgConfidenceByClassification?.[cls] != null && (
                    <span className="text-slate-400"> · {Math.round(metrics.avgConfidenceByClassification[cls] * 100)}% conf</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Action counts */}
      <div className="mt-3 border-t border-slate-200 pt-3 flex flex-wrap gap-2">
        <MetricChip label="Rescans" value={String(metrics.counts.rescans ?? 0)} />
        <MetricChip label="Updates" value={String(metrics.counts.updates ?? 0)} />
        <MetricChip label="Cancellations" value={String(metrics.counts.cancellations ?? 0)} />
      </div>
      {/* Corrected fields */}
      <div className="mt-3 border-t border-slate-200 pt-3">
        <p className="text-xs font-semibold text-slate-700">Most commonly corrected fields</p>
        {metrics.mostCommonlyCorrectedFields.length === 0 ? (
          <p className="mt-1 text-xs text-slate-500">No corrections recorded yet.</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {metrics.mostCommonlyCorrectedFields.map((item) => (
              <span key={item.field} className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200">
                {item.field} <span className="text-slate-400">({item.count})</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-white px-3 py-2 text-center ring-1 ring-slate-200">
      <div className="text-sm font-bold text-slate-900">{value}</div>
      <div className="mt-0.5 text-[10px] font-semibold text-slate-500">{label}</div>
    </div>
  );
}

function formatRate(value: number) {
  return `${Math.round(value * 100)}%`;
}

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

export default function AIInboxClient({ isSuperAdmin = false }: { isSuperAdmin?: boolean }) {
  const [tab, setTab] = useState<FilterTab>("PENDING");
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [counts, setCounts] = useState<StatusCounts>(EMPTY_COUNTS);
  const [metrics, setMetrics] = useState<AIInboxMetrics | null>(null);
  const [connInfo, setConnInfo] = useState<ConnectionInfo>({ state: "loading" });
  const [loading, setLoading]   = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [scanError, setScanError]   = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [watchStatus, setWatchStatus] = useState<{ healthy: boolean; watchExpiration: string | null; lastWebhookAt: string | null; lastWebhookLog: string | null } | null>(null);
  const [registeringWatch, setRegisteringWatch] = useState(false);

  const fetchConnection = useCallback(async () => {
    setConnInfo({ state: "loading" });
    const res  = await fetch("/api/ai-inbox/connection");
    const json = await res.json() as { connection?: { email: string } | null; state: ConnectionState };
    setConnInfo({ state: json.state, email: json.connection?.email });
  }, []);

  // `silent` skips the loading skeleton so background auto-refreshes don't flicker the list.
  const fetchingRef = useRef(false);
  const fetchSuggestions = useCallback(async (opts?: { silent?: boolean }) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    if (!opts?.silent) setLoading(true);
    try {
      const res  = await fetch(`/api/ai-inbox/suggestions?status=${tab}`);
      const json = await res.json() as { suggestions: AISuggestion[]; counts?: Partial<StatusCounts> };
      setSuggestions(json.suggestions ?? []);
      setCounts({ ...EMPTY_COUNTS, ...(json.counts ?? {}) });
    } finally {
      if (!opts?.silent) setLoading(false);
      fetchingRef.current = false;
    }
  }, [tab]);

  // Idle/activity tracking + busy-card tracking gate the auto-refresh below.
  const lastActivityRef = useRef(0);
  const busyIdsRef = useRef<Set<string>>(new Set());
  const reportBusy = useCallback((id: string, busy: boolean) => {
    if (busy) busyIdsRef.current.add(id);
    else busyIdsRef.current.delete(id);
  }, []);

  useEffect(() => { void fetchConnection(); }, [fetchConnection]);
  useEffect(() => { void fetchSuggestions(); }, [fetchSuggestions]);
  useEffect(() => {
    if (!isSuperAdmin) return;
    fetch("/api/ai-inbox/metrics")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => setMetrics(data as AIInboxMetrics | null))
      .catch(() => null);
  }, [isSuperAdmin]);

  // Mark the user "active" on any real interaction so we don't refresh mid-click/typing.
  useEffect(() => {
    const bump = () => { lastActivityRef.current = Date.now(); };
    bump(); // seed on mount so we don't fire an immediate refresh
    const events = ["mousemove", "mousedown", "keydown", "scroll", "wheel", "touchstart"] as const;
    for (const ev of events) window.addEventListener(ev, bump, { passive: true });
    return () => { for (const ev of events) window.removeEventListener(ev, bump); };
  }, []);

  // Auto-refresh: only when idle ≥8s, tab visible, nothing in flight, no card busy.
  useEffect(() => {
    const IDLE_MS = 8000;
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastActivityRef.current < IDLE_MS) return;
      if (busyIdsRef.current.size > 0) return;
      if (fetchingRef.current || scanning || registeringWatch) return;
      void fetchSuggestions({ silent: true });
    }, 4000);
    return () => clearInterval(id);
  }, [fetchSuggestions, scanning, registeringWatch]);

  useEffect(() => {
    fetch("/api/ai-inbox/watch-status")
      .then(r => r.ok ? r.json() : null)
      .then(d => setWatchStatus(d as { healthy: boolean; watchExpiration: string | null; lastWebhookAt: string | null; lastWebhookLog: string | null } | null))
      .catch(() => null);
  }, []);

  async function handleRegisterWatch() {
    setRegisteringWatch(true);
    try {
      const res = await fetch("/api/ai-inbox/setup-watch", { method: "POST" });
      const json = await res.json() as { ok?: boolean; watchExpiration?: string; error?: string };
      if (json.ok) {
        setWatchStatus({ healthy: true, watchExpiration: json.watchExpiration ?? null, lastWebhookAt: null, lastWebhookLog: null });
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
    setActionNotice(null);
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

  async function handleRescan(messageId: string, suggestionId: string) {
    const res = await fetch("/api/ai-inbox/rescan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, suggestionId }),
    });
    const json = await res.json() as { ok?: boolean; created?: { classification: string; status: string }[]; error?: string };
    if (!res.ok) return { created: [], error: json.error ?? "Rescan failed" };
    await fetchSuggestions();
    if (isSuperAdmin) {
      fetch("/api/ai-inbox/metrics")
        .then((r) => r.ok ? r.json() : null)
        .then((data) => setMetrics(data as AIInboxMetrics | null))
        .catch(() => null);
    }
    return { created: json.created ?? [] };
  }

  async function handleAction(id: string, action: string, extractedData?: Record<string, unknown>, extra?: { notes?: string; matchedEventId?: string }) {
    setActionNotice(null);
    const res  = await fetch(`/api/ai-inbox/suggestions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, extractedData, ...extra }),
    });
    const json = await res.json() as { error?: string };
    if (!res.ok) { alert(json.error ?? "Action failed"); return; }
    const notices: Record<string, string> = {
      ignore: "Suggestion ignored.",
      update_existing: "Existing event updated.",
      cancel_existing: "Existing event cancelled.",
      rescan: "Suggestion rescanned.",
    };
    setActionNotice(notices[action] ?? "Suggestion approved and applied.");
    await fetchSuggestions();
    if (isSuperAdmin) {
      fetch("/api/ai-inbox/metrics")
        .then((r) => r.ok ? r.json() : null)
        .then((data) => setMetrics(data as AIInboxMetrics | null))
        .catch(() => null);
    }
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
        {actionNotice && (
          <p className="mt-2 text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">{actionNotice}</p>
        )}

        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          <QueueMetric label="Pending review" value={counts.PENDING} tone="teal" />
          <QueueMetric label="Possible duplicates" value={counts.DUPLICATE} tone="amber" />
          <QueueMetric label="Approved" value={counts.APPROVED} tone="green" />
          <QueueMetric label="Ignored" value={counts.IGNORED} tone="slate" />
        </div>

        {isSuperAdmin && <AdminMetricsPanel metrics={metrics} />}

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
          <div className="mt-2 rounded-lg bg-teal-50 border border-teal-200 px-4 py-2 text-xs text-teal-700 space-y-0.5">
            <div>
              <CheckCircle2 className="inline size-3.5 mr-1.5 -mt-0.5" />
              Gmail push active · expires {new Date(watchStatus.watchExpiration).toLocaleDateString()}
            </div>
            {watchStatus.lastWebhookAt && (
              <div className="text-teal-600 pl-5">
                Last webhook: {new Date(watchStatus.lastWebhookAt).toLocaleString()}
                {watchStatus.lastWebhookLog && <span className="ml-2 opacity-70">· {watchStatus.lastWebhookLog}</span>}
              </div>
            )}
            {!watchStatus.lastWebhookAt && (
              <div className="text-amber-600 pl-5">No webhook received yet — send a test email to litcalai@gmail.com</div>
            )}
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
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.value
                ? "border-teal-600 text-teal-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
              tab === t.value ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-500"
            }`}>
              {counts[t.value]}
            </span>
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
              <SuggestionCard key={s.id} s={s} onAction={handleAction} onRescan={handleRescan} onBusyChange={reportBusy} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
