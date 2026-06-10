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
  notes: string | null;
  reviewed: boolean;
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

        <RequestsSection requests={requests} pendingId={pendingId} onMarkReviewed={markReviewed} />
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
  onMarkReviewed,
}: {
  requests: RuleRequest[];
  pendingId: string | null;
  onMarkReviewed: (id: string) => void;
}) {
  const pending = requests.filter((r) => !r.reviewed);
  const reviewed = requests.filter((r) => r.reviewed);

  return (
    <div>
      <h2 className="text-base font-semibold text-slate-800 mb-3">Rule Requests</h2>
      <p className="text-xs text-slate-400 mb-4">Submitted by users for courts not yet covered. Review and add the rule in <a href="/admin/court-rules" className="underline hover:text-slate-600">Court Rules</a>.</p>

      {pending.length === 0 && reviewed.length === 0 && (
        <p className="text-sm text-slate-400">No requests yet.</p>
      )}

      {pending.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-xs font-medium text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-2 text-left">County</th>
                <th className="px-4 py-2 text-left">Court</th>
                <th className="px-4 py-2 text-left">Dept</th>
                <th className="px-4 py-2 text-left">Notes</th>
                <th className="px-4 py-2 text-left">From</th>
                <th className="px-4 py-2 text-left">Date</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {pending.map((r) => {
                const name = [r.requestedBy.firstName, r.requestedBy.lastName].filter(Boolean).join(" ") || r.requestedBy.email;
                const busy = pendingId === r.id;
                return (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-medium text-slate-900 capitalize">{r.county} <span className="text-slate-400 font-normal uppercase text-xs">{r.state}</span></td>
                    <td className="px-4 py-3 text-slate-600 capitalize">{r.court || "—"}</td>
                    <td className="px-4 py-3 text-slate-600 uppercase">{r.department || "—"}</td>
                    <td className="px-4 py-3 text-slate-500 max-w-xs truncate">{r.notes || "—"}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{name}<br /><span className="text-slate-400">{r.workspace.name}</span></td>
                    <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">{new Date(r.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        disabled={busy}
                        onClick={() => onMarkReviewed(r.id)}
                        className="rounded border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {busy ? "…" : "Mark reviewed"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {reviewed.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600">
            {reviewed.length} reviewed
          </summary>
          <div className="mt-2 rounded-lg border border-slate-100 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                {reviewed.map((r) => {
                  const name = [r.requestedBy.firstName, r.requestedBy.lastName].filter(Boolean).join(" ") || r.requestedBy.email;
                  return (
                    <tr key={r.id} className="border-b border-slate-100 last:border-0 opacity-60">
                      <td className="px-4 py-2 text-slate-500 capitalize">{r.county} <span className="uppercase text-xs text-slate-400">{r.state}</span></td>
                      <td className="px-4 py-2 text-slate-400 capitalize">{r.court || "—"}</td>
                      <td className="px-4 py-2 text-slate-400 uppercase">{r.department || "—"}</td>
                      <td className="px-4 py-2 text-slate-400 text-xs">{name}</td>
                      <td className="px-4 py-2 text-slate-400 text-xs">{new Date(r.createdAt).toLocaleDateString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
