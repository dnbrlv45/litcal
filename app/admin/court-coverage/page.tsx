"use client";

import { useEffect, useState } from "react";
import { Separator } from "@/components/ui/separator";

type AlertType = "COUNTY" | "DEPARTMENT";

interface CoverageAlert {
  id: string;
  alertType: AlertType;
  state: string;
  county: string;
  court: string;
  department: string;
  firstSeenAt: string;
  resolved: boolean;
  resolvedAt: string | null;
  futureEventCount: number;
}

interface RuleRequest {
  id: string;
  state: string;
  county: string;
  court: string | null;
  department: string | null;
  appearanceType: string | null;
  remoteLink: string | null;
  phoneNumber: string | null;
  bridge: string | null;
  password: string | null;
  requestRequired: boolean;
  requestContactEmail: string | null;
  notes: string | null;
  reviewed: boolean;
  accepted: boolean;
  reviewedAt: string | null;
  createdAt: string;
  requestedBy: { firstName: string | null; lastName: string | null; email: string };
  workspace: { name: string };
}

export default function CourtCoveragePage() {
  const [alerts, setAlerts] = useState<CoverageAlert[]>([]);
  const [requests, setRequests] = useState<RuleRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [updatePreviews, setUpdatePreviews] = useState<Record<string, { count: number; hasRule: boolean }>>({});

  async function load() {
    const [alertsRes, requestsRes] = await Promise.all([
      fetch("/api/admin/court-coverage/alerts"),
      fetch("/api/admin/court-rule-requests"),
    ]);
    const alertsData = await alertsRes.json();
    const requestsData = await requestsRes.json();
    setAlerts(alertsData.alerts ?? []);
    setRequests(requestsData.requests ?? []);
    setLoading(false);
  }

  async function loadPreview(alertId: string) {
    if (updatePreviews[alertId] !== undefined) return;
    const res = await fetch(`/api/admin/court-coverage/preview-updates?alertId=${alertId}`);
    const data = await res.json();
    setUpdatePreviews((prev) => ({ ...prev, [alertId]: { count: data.updatableCount ?? 0, hasRule: data.hasRule ?? false } }));
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const unresolved = alerts.filter((a) => !a.resolved);
    for (const a of unresolved) loadPreview(a.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alerts]);

  async function markReviewed(requestId: string) {
    setPendingId(requestId);
    try {
      await fetch("/api/admin/court-rule-requests/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId }),
      });
      await load();
    } finally {
      setPendingId(null);
    }
  }

  async function acceptRequest(requestId: string) {
    setPendingId(requestId);
    try {
      const res = await fetch("/api/admin/court-rule-requests/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error ?? "Failed"); return; }
      await load();
    } finally {
      setPendingId(null);
    }
  }

  async function resolve(alertId: string, updateEvents: boolean) {
    setPendingId(alertId);
    try {
      const res = await fetch("/api/admin/court-coverage/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertId, updateEvents }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error ?? "Failed"); return; }
      await load();
    } finally {
      setPendingId(null);
    }
  }

  const countyAlerts = alerts.filter((a) => a.alertType === "COUNTY");
  const deptAlerts = alerts.filter((a) => a.alertType === "DEPARTMENT");

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto bg-slate-50 p-8">
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 p-8">
      <div className="max-w-5xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">Court Coverage Queue</h1>
        <p className="text-sm text-slate-500 mt-1">
          Events created for counties or departments with no matching CourtHearingRule.
        </p>

        <Separator className="my-6" />

        <Section title="Unknown Counties" alerts={countyAlerts} pendingId={pendingId} previews={updatePreviews} onResolve={resolve} />

        <div className="mt-10" />

        <Section title="Unknown Departments" alerts={deptAlerts} pendingId={pendingId} previews={updatePreviews} onResolve={resolve} />

        <div className="mt-10" />

        <RequestsSection requests={requests} pendingId={pendingId} onAccept={acceptRequest} onDismiss={markReviewed} />
      </div>
    </div>
  );
}

function Section({
  title,
  alerts,
  pendingId,
  previews,
  onResolve,
}: {
  title: string;
  alerts: CoverageAlert[];
  pendingId: string | null;
  previews: Record<string, { count: number; hasRule: boolean }>;
  onResolve: (id: string, updateEvents: boolean) => void;
}) {
  const unresolved = alerts.filter((a) => !a.resolved);
  const resolved = alerts.filter((a) => a.resolved);

  return (
    <div>
      <h2 className="text-base font-semibold text-slate-800 mb-3">{title}</h2>

      {unresolved.length === 0 && resolved.length === 0 && (
        <p className="text-sm text-slate-400">No alerts.</p>
      )}

      {unresolved.length > 0 && (
        <AlertTable alerts={unresolved} pendingId={pendingId} previews={previews} onResolve={onResolve} />
      )}

      {resolved.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600">
            {resolved.length} resolved
          </summary>
          <div className="mt-2">
            <AlertTable alerts={resolved} pendingId={pendingId} previews={previews} onResolve={onResolve} />
          </div>
        </details>
      )}
    </div>
  );
}

function AlertTable({
  alerts,
  pendingId,
  previews,
  onResolve,
}: {
  alerts: CoverageAlert[];
  pendingId: string | null;
  previews: Record<string, { count: number; hasRule: boolean }>;
  onResolve: (id: string, updateEvents: boolean) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50 text-xs font-medium text-slate-500 uppercase tracking-wide">
            <th className="px-4 py-2 text-left">County</th>
            <th className="px-4 py-2 text-left">Court</th>
            <th className="px-4 py-2 text-left">Department</th>
            <th className="px-4 py-2 text-left">First Seen</th>
            <th className="px-4 py-2 text-right">Events</th>
            <th className="px-4 py-2 text-left">Status</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {alerts.map((a) => {
            const preview = previews[a.id];
            const busy = pendingId === a.id;
            return (
              <tr key={a.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-3 font-medium text-slate-900 capitalize">{a.county} <span className="text-slate-400 font-normal uppercase text-xs">{a.state}</span></td>
                <td className="px-4 py-3 text-slate-600 capitalize">{a.court || "—"}</td>
                <td className="px-4 py-3 text-slate-600 uppercase">{a.department || "—"}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                  {new Date(a.firstSeenAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right text-slate-700 font-medium">{a.futureEventCount}</td>
                <td className="px-4 py-3">
                  {a.resolved ? (
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                      Resolved
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700 border border-amber-200">
                      Open
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {!a.resolved && (
                    <div className="flex items-center justify-end gap-2">
                      {preview?.hasRule && preview.count > 0 && (
                        <button
                          disabled={busy}
                          onClick={() => onResolve(a.id, true)}
                          className="rounded bg-teal-600 px-3 py-1 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50"
                        >
                          {busy ? "Updating…" : `Update ${preview.count} event${preview.count !== 1 ? "s" : ""} & resolve`}
                        </button>
                      )}
                      <button
                        disabled={busy}
                        onClick={() => onResolve(a.id, false)}
                        className="rounded border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {busy ? "…" : "Resolve only"}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RequestsSection({
  requests,
  pendingId,
  onAccept,
  onDismiss,
}: {
  requests: RuleRequest[];
  pendingId: string | null;
  onAccept: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const pending = requests.filter((r) => !r.reviewed);
  const reviewed = requests.filter((r) => r.reviewed);

  return (
    <div>
      <h2 className="text-base font-semibold text-slate-800 mb-1">Rule Requests</h2>
      <p className="text-xs text-slate-400 mb-4">Submitted by users. Accept to create the rule instantly, or dismiss to close without adding.</p>

      {pending.length === 0 && reviewed.length === 0 && (
        <p className="text-sm text-slate-400">No requests yet.</p>
      )}

      {pending.length > 0 && (
        <div className="flex flex-col gap-3">
          {pending.map((r) => {
            const name = [r.requestedBy.firstName, r.requestedBy.lastName].filter(Boolean).join(" ") || r.requestedBy.email;
            const busy = pendingId === r.id;
            const hasRuleInfo = !!(r.remoteLink || r.phoneNumber);

            return (
              <div key={r.id} className="rounded-lg border border-slate-200 bg-white shadow-sm p-4 flex flex-col gap-3">
                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 capitalize">
                      {r.county} <span className="uppercase text-xs text-slate-400 font-normal">{r.state}</span>
                      {r.court && <span className="text-slate-500 font-normal"> · {r.court}</span>}
                      {r.department && <span className="text-slate-400 font-normal"> · Dept. {r.department.toUpperCase()}</span>}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">{name} · {r.workspace.name} · {new Date(r.createdAt).toLocaleDateString()}</p>
                  </div>
                  {hasRuleInfo && (
                    <span className="shrink-0 inline-flex items-center rounded-full bg-teal-50 border border-teal-200 px-2 py-0.5 text-xs text-teal-700 font-medium">
                      Ready to accept
                    </span>
                  )}
                </div>

                {/* Rule details */}
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600">
                  {r.appearanceType && <span className="capitalize"><span className="text-slate-400">Type:</span> {r.appearanceType}</span>}
                  {r.remoteLink && (
                    <span><span className="text-slate-400">Link:</span>{" "}
                      <a href={r.remoteLink} target="_blank" rel="noopener noreferrer" className="text-teal-700 underline truncate max-w-[220px] inline-block align-bottom">{r.remoteLink}</a>
                    </span>
                  )}
                  {r.phoneNumber && <span><span className="text-slate-400">Phone:</span> {r.phoneNumber}</span>}
                  {r.bridge && <span><span className="text-slate-400">Bridge:</span> <span className="font-mono">{r.bridge}</span></span>}
                  {r.password && <span><span className="text-slate-400">Password:</span> <span className="font-mono">{r.password}</span></span>}
                  {r.requestRequired && <span className="text-amber-700 font-medium">Request required{r.requestContactEmail ? ` · ${r.requestContactEmail}` : ""}</span>}
                </div>

                {r.notes && (
                  <p className="text-xs text-slate-500 italic border-t border-slate-100 pt-2">{r.notes}</p>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                  <button
                    disabled={busy}
                    onClick={() => onAccept(r.id)}
                    className="rounded bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50"
                  >
                    {busy ? "Accepting…" : "Accept & create rule"}
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => onDismiss(r.id)}
                    className="rounded border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {reviewed.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600">
            {reviewed.length} reviewed
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            {reviewed.map((r) => {
              const name = [r.requestedBy.firstName, r.requestedBy.lastName].filter(Boolean).join(" ") || r.requestedBy.email;
              return (
                <div key={r.id} className="rounded-lg border border-slate-100 bg-white px-4 py-2.5 flex items-center gap-3 opacity-60">
                  <span className="text-sm text-slate-500 capitalize flex-1">
                    {r.county} <span className="uppercase text-xs text-slate-400">{r.state}</span>
                    {r.court && ` · ${r.court}`}
                    {r.department && ` · ${r.department.toUpperCase()}`}
                  </span>
                  {r.accepted && <span className="text-xs text-teal-600 font-medium">Accepted</span>}
                  <span className="text-xs text-slate-400">{name}</span>
                  <span className="text-xs text-slate-400">{new Date(r.createdAt).toLocaleDateString()}</span>
                </div>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}
