"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  FileText,
  CheckCircle2,
  ArrowRight,
  Layers,
  X,
  Inbox,
  Send,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DISCOVERY_DIRECTION_LABELS,
  DISCOVERY_STATUS_LABELS,
  EXTENSION_APPLIES_TO_LABELS,
} from "@/lib/discovery-constants";
import type { DiscoveryDirection, DiscoveryStatus, ExtensionAppliesTo } from "@prisma/client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Extension {
  id: string;
  extensionNumber: number;
  grantedDate: string;
  previousDueDate: string;
  newDueDate: string;
  mutual: boolean;
  appliesTo: ExtensionAppliesTo;
  notes: string | null;
  createdAt: string;
}

interface TeamMember {
  id: string;
  firstName: string | null;
  lastName: string | null;
}

interface DiscoveryItem {
  id: string;
  direction: DiscoveryDirection;
  servedOrReceivedDate: string;
  originalDueDate: string;
  currentDueDate: string;
  status: DiscoveryStatus;
  progressStatus: "NOT_STARTED" | "QUESTIONNAIRE_SENT" | "IN_PROGRESS" | "IN_REVIEW";
  assignedToId: string | null;
  assignedTo: TeamMember | null;
  notes: string | null;
  extensions: Extension[];
  createdAt: string;
}

const PROGRESS_LABELS: Record<string, string> = {
  NOT_STARTED: "Not Started",
  QUESTIONNAIRE_SENT: "Questionnaire Sent",
  IN_PROGRESS: "In Progress",
  IN_REVIEW: "In Review",
};

const PROGRESS_COLORS: Record<string, string> = {
  NOT_STARTED: "bg-slate-100 text-slate-600",
  QUESTIONNAIRE_SENT: "bg-purple-100 text-purple-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  IN_REVIEW: "bg-amber-100 text-amber-700",
};


function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dueDateKey(dateStr: string) {
  return dateStr.slice(0, 10);
}

function statusColor(status: DiscoveryStatus) {
  switch (status) {
    case "AWAITING_RESPONSE":  return "bg-amber-100 text-amber-700";
    case "EXTENSION_GRANTED":  return "bg-blue-100 text-blue-700";
    case "RESPONSES_RECEIVED": return "bg-teal-100 text-teal-700";
    case "OVERDUE":            return "bg-rose-100 text-rose-700";
    case "COMPLETED":          return "bg-green-100 text-green-700";
  }
}

function isOverdue(currentDueDate: string, status: DiscoveryStatus) {
  if (status === "COMPLETED" || status === "RESPONSES_RECEIVED") return false;
  return dueDateKey(currentDueDate) < localDateKey();
}

function displayStatus(item: DiscoveryItem, overdue: boolean, isCompleted: boolean): DiscoveryStatus {
  if (isCompleted) return item.status;
  if (overdue) return "OVERDUE";
  if (item.status === "OVERDUE") {
    return item.extensions.length > 0 ? "EXTENSION_GRANTED" : "AWAITING_RESPONSE";
  }
  return item.status;
}

// ─── Add Discovery Modal (two-step) ──────────────────────────────────────────

function AddDiscoveryModal({ caseId, onClose, onCreated, prefillDirection }: {
  caseId: string;
  onClose: () => void;
  onCreated: (item: DiscoveryItem) => void;
  prefillDirection?: DiscoveryDirection;
}) {
  const [step, setStep]           = useState<"direction" | "form">(prefillDirection ? "form" : "direction");
  const [direction, setDirection] = useState<DiscoveryDirection | null>(prefillDirection ?? null);
  const [date, setDate]           = useState("");
  const [notes, setNotes]         = useState("");
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState("");

  function pickDirection(dir: DiscoveryDirection) {
    setDirection(dir);
    setStep("form");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!date) { setError("Date is required"); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch(`/api/cases/${caseId}/discovery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction, servedOrReceivedDate: date, notes: notes || null }),
      });
      if (!res.ok) { const j = await res.json(); setError(j.error ?? "Failed"); return; }
      const { item } = await res.json();
      onCreated(item);
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            {step === "form" && (
              <button
                type="button"
                onClick={() => { setStep("direction"); setError(""); }}
                className="text-slate-400 hover:text-slate-600 mr-1"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <h3 className="text-base font-semibold text-slate-900">
              {step === "direction" ? "Add Discovery" : direction === "RECEIVED" ? "Received Discovery" : "Sent Discovery"}
            </h3>
            {step === "form" && direction && (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${direction === "RECEIVED" ? "bg-amber-100 text-amber-700" : "bg-teal-100 text-teal-700"}`}>
                {direction === "RECEIVED" ? "Received" : "Sent"}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>

        {/* Step 1 — Direction picker */}
        {step === "direction" && (
          <div className="px-6 py-8">
            <p className="text-sm text-slate-500 text-center mb-6">What are you adding?</p>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => pickDirection("RECEIVED")}
                className="group flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-slate-200 hover:border-amber-400 hover:bg-amber-50/40 transition-all"
              >
                <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center group-hover:bg-amber-200 transition-colors">
                  <Inbox className="w-5 h-5 text-amber-700" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-slate-900">Received</p>
                  <p className="text-xs text-slate-500 mt-0.5">from opposing party</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => pickDirection("SERVED")}
                className="group flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-slate-200 hover:border-teal-400 hover:bg-teal-50/40 transition-all"
              >
                <div className="w-12 h-12 rounded-full bg-teal-100 flex items-center justify-center group-hover:bg-teal-200 transition-colors">
                  <Send className="w-5 h-5 text-teal-700" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-slate-900">Sent</p>
                  <p className="text-xs text-slate-500 mt-0.5">to opposing party</p>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — Form */}
        {step === "form" && (
          <form onSubmit={submit}>
            <div className="px-6 py-5 space-y-4">
              <div>
                <Label htmlFor="disc-date">
                  {direction === "RECEIVED" ? "Date Received" : "Date Served"}
                </Label>
                <Input
                  id="disc-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1"
                  required
                  autoFocus
                />
              </div>
              <div>
                <Label htmlFor="disc-notes">Notes <span className="text-slate-400">(optional)</span></Label>
                <Textarea
                  id="disc-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="mt-1 resize-none"
                />
              </div>
              {error && <p className="text-sm text-rose-600">{error}</p>}
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50/60">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Adding…" : "Add Discovery"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Add Extension Modal ──────────────────────────────────────────────────────

function AddExtensionModal({ item, caseId, onClose, onGranted }: {
  item: DiscoveryItem;
  caseId: string;
  onClose: () => void;
  onGranted: (updated: DiscoveryItem) => void;
}) {
  const [grantedDate, setGrantedDate] = useState("");
  const [newDueDate, setNewDueDate]   = useState("");
  const [mutual, setMutual]           = useState(false);
  const [notes, setNotes]             = useState("");
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState("");

  const extNum = item.extensions.length + 1;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!grantedDate || !newDueDate) { setError("All date fields required"); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch(`/api/cases/${caseId}/discovery/${item.id}/extensions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grantedDate, newDueDate, mutual, notes: notes || null }),
      });
      if (!res.ok) { const j = await res.json(); setError(j.error ?? "Failed"); return; }
      const { item: updated } = await res.json();
      onGranted(updated);
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 mx-4">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-slate-900">Extension {extNum}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="ext-granted">Granted Date</Label>
            <Input id="ext-granted" type="date" value={grantedDate} onChange={(e) => setGrantedDate(e.target.value)} className="mt-1" required />
          </div>
          <div>
            <Label htmlFor="ext-new-due">New Due Date</Label>
            <Input id="ext-new-due" type="date" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)} className="mt-1" required />
            <p className="text-xs text-slate-400 mt-1">Current due: {fmt(item.currentDueDate)}</p>
          </div>
          <div>
            <Label className="block mb-1">Mutual Extension?</Label>
            <div className="flex gap-4">
              {([true, false] as const).map((v) => (
                <label key={String(v)} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="mutual"
                    checked={mutual === v}
                    onChange={() => setMutual(v)}
                    className="accent-teal-600"
                  />
                  <span className="text-sm">{v ? "Yes" : "No"}</span>
                </label>
              ))}
            </div>
            {mutual && (
              <p className="text-xs text-blue-600 mt-1.5">Both our deadline and opposing deadline will be moved.</p>
            )}
          </div>
          {!mutual && (
            <p className="text-xs text-slate-500">
              Only {item.direction === "RECEIVED" ? "our deadline" : "the opposing deadline"} will be moved.
            </p>
          )}
          <div>
            <Label htmlFor="ext-notes">Notes <span className="text-slate-400">(optional)</span></Label>
            <Textarea id="ext-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1 resize-none" />
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Granting…" : "Grant Extension"}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Discovery Item Card ──────────────────────────────────────────────────────

function DiscoveryCard({ item, caseId, members, onUpdate, onDelete }: {
  item: DiscoveryItem;
  caseId: string;
  members: TeamMember[];
  onUpdate: (updated: DiscoveryItem) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded]         = useState(false);
  const [showExtModal, setShowExtModal] = useState(false);
  const [markingDone, setMarkingDone]   = useState(false);
  const [deleting, setDeleting]         = useState(false);

  const overdue = isOverdue(item.currentDueDate, item.status);
  const isCompleted = item.status === "COMPLETED" || item.status === "RESPONSES_RECEIVED";
  const effectiveStatus = displayStatus(item, overdue, isCompleted);

  async function patchField(data: Record<string, unknown>) {
    const res = await fetch(`/api/cases/${caseId}/discovery/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) { const { item: updated } = await res.json(); onUpdate(updated); }
  }

  async function markResponsesReceived() {
    setMarkingDone(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/discovery/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "responses_received" }),
      });
      if (res.ok) { const { item: updated } = await res.json(); onUpdate(updated); }
    } finally { setMarkingDone(false); }
  }

  async function deleteItem() {
    if (!confirm("Delete this discovery item and its deadline?")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/discovery/${item.id}`, { method: "DELETE" });
      if (res.ok) onDelete(item.id);
    } finally { setDeleting(false); }
  }

  return (
    <>
      <div className={`border rounded-lg ${isCompleted ? "border-slate-200 bg-slate-50/50" : overdue ? "border-rose-200 bg-rose-50/30" : "border-slate-200 bg-white"}`}>
        {/* Card header */}
        <button
          type="button"
          className="w-full flex items-start gap-3 p-4 text-left"
          onClick={() => setExpanded((x) => !x)}
        >
          <div className="mt-0.5 shrink-0 text-slate-400">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-sm font-semibold ${isCompleted ? "text-slate-400 line-through" : "text-slate-900"}`}>
                {item.direction === "RECEIVED" ? "Our Responses Due" : "Opposing Responses Due"}
              </span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusColor(effectiveStatus)}`}>
                {DISCOVERY_STATUS_LABELS[effectiveStatus]}
              </span>
              {item.extensions.length > 0 && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                  Ext. {item.extensions.length}
                </span>
              )}
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${PROGRESS_COLORS[item.progressStatus]}`}>
                {PROGRESS_LABELS[item.progressStatus]}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {DISCOVERY_DIRECTION_LABELS[item.direction]}
              {item.assignedTo && (
                <span className="ml-1.5">· {[item.assignedTo.firstName, item.assignedTo.lastName].filter(Boolean).join(" ")}</span>
              )}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className={`text-sm font-medium ${overdue && !isCompleted ? "text-rose-600" : "text-slate-700"}`}>
              {fmt(item.currentDueDate)}
            </p>
            <p className="text-xs text-slate-400">due</p>
          </div>
        </button>

        {/* Expanded detail */}
        {expanded && (
          <div className="border-t border-slate-100 px-4 py-4 space-y-4">
            {/* Key dates */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
              <div>
                <p className="text-slate-400 font-medium uppercase tracking-wide">
                  {item.direction === "RECEIVED" ? "Date Received" : "Date Served"}
                </p>
                <p className="text-slate-700 font-semibold mt-0.5">{fmt(item.servedOrReceivedDate)}</p>
              </div>
              <div>
                <p className="text-slate-400 font-medium uppercase tracking-wide">Original Due</p>
                <p className="text-slate-700 font-semibold mt-0.5">{fmt(item.originalDueDate)}</p>
              </div>
              <div>
                <p className="text-slate-400 font-medium uppercase tracking-wide">Current Due</p>
                <p className={`font-semibold mt-0.5 ${overdue && !isCompleted ? "text-rose-600" : "text-slate-700"}`}>
                  {fmt(item.currentDueDate)}
                </p>
              </div>
              <div>
                <p className="text-slate-400 font-medium uppercase tracking-wide">Extensions</p>
                <p className="text-slate-700 font-semibold mt-0.5">{item.extensions.length}</p>
              </div>
            </div>

            {/* Assigned To & Progress */}
            {!isCompleted && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-1">Assigned To</p>
                  <select
                    value={item.assignedToId ?? ""}
                    onChange={(e) => patchField({ assignedToId: e.target.value || null })}
                    className="w-full h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700"
                  >
                    <option value="">Unassigned</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {[m.firstName, m.lastName].filter(Boolean).join(" ")}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-1">Progress</p>
                  <select
                    value={item.progressStatus}
                    onChange={(e) => patchField({ progressStatus: e.target.value })}
                    className="w-full h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700"
                  >
                    {Object.entries(PROGRESS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {item.notes && (
              <div className="text-xs">
                <p className="text-slate-400 font-medium uppercase tracking-wide mb-0.5">Notes</p>
                <p className="text-slate-600 whitespace-pre-wrap">{item.notes}</p>
              </div>
            )}

            {/* Extension history */}
            {item.extensions.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Extension History</p>
                {item.extensions.map((ext) => (
                  <div key={ext.id} className="bg-slate-50 rounded-lg p-3 text-xs space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-700">Extension {ext.extensionNumber}</span>
                      {ext.mutual && (
                        <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-600 text-[10px] font-semibold">Mutual</span>
                      )}
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px]">
                        {EXTENSION_APPLIES_TO_LABELS[ext.appliesTo]}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-500">
                      <span>Granted: {fmt(ext.grantedDate)}</span>
                      <span className="text-slate-300">·</span>
                      <span className="text-slate-400 line-through">{fmt(ext.previousDueDate)}</span>
                      <ArrowRight className="w-3 h-3 text-slate-400" />
                      <span className="text-slate-700 font-medium">{fmt(ext.newDueDate)}</span>
                    </div>
                    {ext.notes && <p className="text-slate-400 italic">{ext.notes}</p>}
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            {!isCompleted && (
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowExtModal(true)}
                >
                  <Layers className="w-3.5 h-3.5 mr-1.5" />
                  Add Extension
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={markResponsesReceived}
                  disabled={markingDone}
                  className="text-teal-700 border-teal-200 hover:bg-teal-50"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                  {markingDone ? "Marking…" : "Mark Responses Received"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={deleteItem}
                  disabled={deleting}
                  className="text-rose-600 border-rose-200 hover:bg-rose-50 ml-auto"
                >
                  {deleting ? "Deleting…" : "Delete"}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {showExtModal && (
        <AddExtensionModal
          item={item}
          caseId={caseId}
          onClose={() => setShowExtModal(false)}
          onGranted={(updated) => { onUpdate(updated); setShowExtModal(false); }}
        />
      )}
    </>
  );
}

// ─── Main Section ─────────────────────────────────────────────────────────────

export default function CaseDiscoverySection({ caseId }: { caseId: string }) {
  const [items, setItems]                   = useState<DiscoveryItem[]>([]);
  const [members, setMembers]               = useState<TeamMember[]>([]);
  const [loading, setLoading]               = useState(true);
  const [showAddModal, setShowAddModal]     = useState(false);
  const [prefillDirection, setPrefillDirection] = useState<DiscoveryDirection | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [discRes, membersRes] = await Promise.all([
        fetch(`/api/cases/${caseId}/discovery`),
        fetch("/api/workspaces/members"),
      ]);
      if (discRes.ok) { const { items: data } = await discRes.json(); setItems(data); }
      if (membersRes.ok) {
        const data = await membersRes.json();
        setMembers((data.members ?? []).map((m: { user: TeamMember }) => m.user));
      }
    } finally { setLoading(false); }
  }, [caseId]);

  useEffect(() => { load(); }, [load]);

  function handleCreated(item: DiscoveryItem) {
    setItems((prev) => [item, ...prev]);
    setShowAddModal(false);
  }

  function handleUpdate(updated: DiscoveryItem) {
    setItems((prev) => prev.map((i) => i.id === updated.id ? updated : i));
  }

  function handleDelete(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  const active    = items.filter((i) => i.status !== "COMPLETED" && i.status !== "RESPONSES_RECEIVED");
  const completed = items.filter((i) => i.status === "COMPLETED" || i.status === "RESPONSES_RECEIVED");

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-700">
            Discovery
            {items.length > 0 && (
              <span className="ml-1.5 text-xs text-slate-400">({items.length})</span>
            )}
          </span>
        </div>
        {items.length > 0 && (
          <Button size="sm" onClick={() => setShowAddModal(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add Discovery
          </Button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-sm text-slate-400 py-4 text-center">Loading…</div>
      ) : items.length === 0 ? (
        <div className="space-y-3 pt-1">
          <p className="text-xs text-slate-400 text-center">No discovery items yet. What are you adding?</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => { setPrefillDirection("RECEIVED"); setShowAddModal(true); }}
              className="group flex flex-col items-center gap-2.5 py-5 px-3 rounded-xl border-2 border-slate-200 hover:border-amber-400 hover:bg-amber-50/30 transition-all"
            >
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center group-hover:bg-amber-200 transition-colors">
                <Inbox className="w-4 h-4 text-amber-700" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-800">Received</p>
                <p className="text-xs text-slate-400 mt-0.5">from opposing party</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => { setPrefillDirection("SERVED"); setShowAddModal(true); }}
              className="group flex flex-col items-center gap-2.5 py-5 px-3 rounded-xl border-2 border-slate-200 hover:border-teal-400 hover:bg-teal-50/30 transition-all"
            >
              <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center group-hover:bg-teal-200 transition-colors">
                <Send className="w-4 h-4 text-teal-700" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-800">Sent</p>
                <p className="text-xs text-slate-400 mt-0.5">to opposing party</p>
              </div>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Active items */}
          {active.map((item) => (
            <DiscoveryCard
              key={item.id}
              item={item}
              caseId={caseId}
              members={members}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ))}

          {/* Completed items */}
          {completed.length > 0 && (
            <CompletedSection items={completed} caseId={caseId} members={members} onUpdate={handleUpdate} onDelete={handleDelete} />
          )}
        </div>
      )}

      {showAddModal && (
        <AddDiscoveryModal
          caseId={caseId}
          prefillDirection={prefillDirection}
          onClose={() => { setShowAddModal(false); setPrefillDirection(undefined); }}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}

function CompletedSection({ items, caseId, members, onUpdate, onDelete }: {
  items: DiscoveryItem[];
  caseId: string;
  members: TeamMember[];
  onUpdate: (updated: DiscoveryItem) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 mt-2"
        onClick={() => setOpen((x) => !x)}
      >
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        {items.length} completed
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {items.map((item) => (
            <DiscoveryCard key={item.id} item={item} caseId={caseId} members={members} onUpdate={onUpdate} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
