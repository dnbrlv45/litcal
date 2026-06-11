"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Layers,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DISCOVERY_TYPE_LABELS,
  DISCOVERY_DIRECTION_LABELS,
  DISCOVERY_STATUS_LABELS,
  EXTENSION_APPLIES_TO_LABELS,
} from "@/lib/discovery";
import type { DiscoveryType, DiscoveryDirection, DiscoveryStatus, ExtensionAppliesTo } from "@prisma/client";

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

interface DiscoveryItem {
  id: string;
  discoveryType: DiscoveryType;
  direction: DiscoveryDirection;
  servedOrReceivedDate: string;
  originalDueDate: string;
  currentDueDate: string;
  status: DiscoveryStatus;
  notes: string | null;
  extensions: Extension[];
  createdAt: string;
}

const DISCOVERY_TYPES = Object.keys(DISCOVERY_TYPE_LABELS) as DiscoveryType[];
const DIRECTIONS       = Object.keys(DISCOVERY_DIRECTION_LABELS) as DiscoveryDirection[];
const APPLIES_TO_OPTS  = Object.keys(EXTENSION_APPLIES_TO_LABELS) as ExtensionAppliesTo[];

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
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
  return new Date(currentDueDate) < new Date();
}

// ─── Add Discovery Modal ──────────────────────────────────────────────────────

function AddDiscoveryModal({ caseId, onClose, onCreated }: {
  caseId: string;
  onClose: () => void;
  onCreated: (item: DiscoveryItem) => void;
}) {
  const [discoveryType, setDiscoveryType] = useState<DiscoveryType>("FORM_INTERROGATORIES");
  const [direction, setDirection]          = useState<DiscoveryDirection>("RECEIVED");
  const [date, setDate]                    = useState("");
  const [notes, setNotes]                  = useState("");
  const [saving, setSaving]                = useState(false);
  const [error, setError]                  = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!date) { setError("Date is required"); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch(`/api/cases/${caseId}/discovery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discoveryType, direction, servedOrReceivedDate: date, notes: notes || null }),
      });
      if (!res.ok) { const j = await res.json(); setError(j.error ?? "Failed"); return; }
      const { item } = await res.json();
      onCreated(item);
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 mx-4">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-slate-900">Add Discovery</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="disc-type">Discovery Type</Label>
            <select
              id="disc-type"
              value={discoveryType}
              onChange={(e) => setDiscoveryType(e.target.value as DiscoveryType)}
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {DISCOVERY_TYPES.map((t) => (
                <option key={t} value={t}>{DISCOVERY_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="disc-dir">Direction</Label>
            <select
              id="disc-dir"
              value={direction}
              onChange={(e) => setDirection(e.target.value as DiscoveryDirection)}
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {DIRECTIONS.map((d) => (
                <option key={d} value={d}>{DISCOVERY_DIRECTION_LABELS[d]}</option>
              ))}
            </select>
          </div>
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
            />
          </div>
          <div>
            <Label htmlFor="disc-notes">Notes (optional)</Label>
            <Textarea
              id="disc-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1 resize-none"
            />
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Adding…" : "Add Discovery"}
            </Button>
          </div>
        </form>
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
  const [appliesTo, setAppliesTo]     = useState<ExtensionAppliesTo>("OUR_DEADLINE");
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
        body: JSON.stringify({ grantedDate, newDueDate, mutual, appliesTo, notes: notes || null }),
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
          <div>
            <h3 className="text-base font-semibold text-slate-900">Extension {extNum}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{DISCOVERY_TYPE_LABELS[item.discoveryType]}</p>
          </div>
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
              {[true, false].map((v) => (
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
          </div>
          <div>
            <Label htmlFor="ext-applies">Applies To</Label>
            <select
              id="ext-applies"
              value={appliesTo}
              onChange={(e) => setAppliesTo(e.target.value as ExtensionAppliesTo)}
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {APPLIES_TO_OPTS.map((a) => (
                <option key={a} value={a}>{EXTENSION_APPLIES_TO_LABELS[a]}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="ext-notes">Notes (optional)</Label>
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

function DiscoveryCard({ item, caseId, onUpdate, onDelete }: {
  item: DiscoveryItem;
  caseId: string;
  onUpdate: (updated: DiscoveryItem) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded]         = useState(false);
  const [showExtModal, setShowExtModal] = useState(false);
  const [markingDone, setMarkingDone]   = useState(false);
  const [deleting, setDeleting]         = useState(false);

  const overdue = isOverdue(item.currentDueDate, item.status);
  const isCompleted = item.status === "COMPLETED" || item.status === "RESPONSES_RECEIVED";

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
                {DISCOVERY_TYPE_LABELS[item.discoveryType]}
              </span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusColor(overdue && !isCompleted ? "OVERDUE" : item.status)}`}>
                {DISCOVERY_STATUS_LABELS[overdue && !isCompleted ? "OVERDUE" : item.status]}
              </span>
              {item.extensions.length > 0 && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                  Ext. {item.extensions.length}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">{DISCOVERY_DIRECTION_LABELS[item.direction]}</p>
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
  const [items, setItems]             = useState<DiscoveryItem[]>([]);
  const [loading, setLoading]         = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/discovery`);
      if (res.ok) { const { items: data } = await res.json(); setItems(data); }
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
        <Button size="sm" onClick={() => setShowAddModal(true)}>
          <Plus className="w-3.5 h-3.5 mr-1" />
          Add Discovery
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-sm text-slate-400 py-4 text-center">Loading…</div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <FileText className="w-8 h-8 text-slate-200 mb-2" />
          <p className="text-sm text-slate-400">No discovery items yet.</p>
          <p className="text-xs text-slate-300 mt-1">Add discovery to automatically calculate response deadlines.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Active items */}
          {active.map((item) => (
            <DiscoveryCard
              key={item.id}
              item={item}
              caseId={caseId}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ))}

          {/* Completed items */}
          {completed.length > 0 && (
            <CompletedSection items={completed} caseId={caseId} onUpdate={handleUpdate} onDelete={handleDelete} />
          )}
        </div>
      )}

      {showAddModal && (
        <AddDiscoveryModal
          caseId={caseId}
          onClose={() => setShowAddModal(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}

function CompletedSection({ items, caseId, onUpdate, onDelete }: {
  items: DiscoveryItem[];
  caseId: string;
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
            <DiscoveryCard key={item.id} item={item} caseId={caseId} onUpdate={onUpdate} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
