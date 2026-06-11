"use client";

import { useState, useEffect, useRef } from "react";
import { X, ArrowLeft, Inbox, Send, Search, ChevronRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DISCOVERY_TYPE_LABELS } from "@/lib/discovery-constants";
import type { DiscoveryType, DiscoveryDirection } from "@prisma/client";

interface CaseOption {
  id: string;
  title: string;
  caseNumber: string | null;
  status: string;
}

const DISCOVERY_TYPES = Object.keys(DISCOVERY_TYPE_LABELS) as DiscoveryType[];

function fmt(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function calcPreviewDue(dateStr: string): string {
  if (!dateStr) return "";
  const base = new Date(dateStr + "T00:00:00Z");
  const raw = new Date(base.getTime() + 31 * 24 * 60 * 60 * 1000);
  const day = raw.getUTCDay();
  if (day === 6) raw.setUTCDate(raw.getUTCDate() + 2);
  if (day === 0) raw.setUTCDate(raw.getUTCDate() + 1);
  return fmt(raw);
}

type Step = "direction" | "details";

interface Props {
  onClose: () => void;
  onCreated: () => void;
  prefillDirection?: DiscoveryDirection;
}

export default function QuickAddDiscoveryModal({ onClose, onCreated, prefillDirection }: Props) {
  const [step, setStep]                   = useState<Step>(prefillDirection ? "details" : "direction");
  const [direction, setDirection]         = useState<DiscoveryDirection | null>(prefillDirection ?? null);
  const [cases, setCases]                 = useState<CaseOption[]>([]);
  const [caseSearch, setCaseSearch]       = useState("");
  const [selectedCase, setSelectedCase]   = useState<CaseOption | null>(null);
  const [discoveryType, setDiscoveryType] = useState<DiscoveryType>("FORM_INTERROGATORIES");
  const [date, setDate]                   = useState("");
  const [notes, setNotes]                 = useState("");
  const [saving, setSaving]               = useState(false);
  const [error, setError]                 = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/cases")
      .then((r) => r.json())
      .then((d) => setCases((d.cases ?? []).filter((c: CaseOption) => c.status === "ACTIVE" || c.status === "PENDING")));
  }, []);

  useEffect(() => {
    if (step === "details") setTimeout(() => searchRef.current?.focus(), 50);
  }, [step]);

  function pickDirection(dir: DiscoveryDirection) {
    setDirection(dir);
    setStep("details");
  }

  const filteredCases = cases.filter((c) =>
    c.title.toLowerCase().includes(caseSearch.toLowerCase()) ||
    (c.caseNumber ?? "").toLowerCase().includes(caseSearch.toLowerCase())
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCase) { setError("Select a case"); return; }
    if (!date)         { setError("Date is required"); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch(`/api/cases/${selectedCase.id}/discovery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discoveryType,
          direction,
          servedOrReceivedDate: date,
          notes: notes || null,
        }),
      });
      if (!res.ok) { const j = await res.json(); setError(j.error ?? "Failed"); return; }
      onCreated();
    } finally { setSaving(false); }
  }

  const previewDue = calcPreviewDue(date);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            {step === "details" && !prefillDirection && (
              <button
                type="button"
                onClick={() => { setStep("direction"); setSelectedCase(null); }}
                className="text-slate-400 hover:text-slate-600 mr-1"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <h3 className="text-base font-semibold text-slate-900">
              {step === "direction" ? "Add Discovery" : direction === "RECEIVED" ? "Received Discovery" : "Sent Discovery"}
            </h3>
            {step === "details" && direction && (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${direction === "RECEIVED" ? "bg-amber-100 text-amber-700" : "bg-teal-100 text-teal-700"}`}>
                {direction === "RECEIVED" ? "Received" : "Sent"}
              </span>
            )}
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step 1 — Direction */}
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
                  <p className="text-xs text-slate-500 mt-0.5">on opposing party</p>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — Details */}
        {step === "details" && (
          <form onSubmit={submit}>
            <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Case picker */}
              <div>
                <Label className="mb-1.5 block">Case</Label>
                {selectedCase ? (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-teal-300 bg-teal-50 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{selectedCase.title}</p>
                      {selectedCase.caseNumber && (
                        <p className="text-xs text-slate-500">#{selectedCase.caseNumber}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => { setSelectedCase(null); setCaseSearch(""); }}
                      className="text-slate-400 hover:text-slate-600 shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <Input
                        ref={searchRef}
                        placeholder="Search cases…"
                        value={caseSearch}
                        onChange={(e) => setCaseSearch(e.target.value)}
                        className="pl-8 h-9 text-sm"
                      />
                    </div>
                    {caseSearch && (
                      <div className="border border-slate-200 rounded-lg overflow-hidden max-h-44 overflow-y-auto shadow-sm">
                        {filteredCases.length === 0 ? (
                          <p className="text-xs text-slate-400 px-3 py-2">No active cases found</p>
                        ) : (
                          filteredCases.slice(0, 8).map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => { setSelectedCase(c); setCaseSearch(""); }}
                              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-slate-50 text-sm"
                            >
                              <span className="truncate font-medium text-slate-800">{c.title}</span>
                              {c.caseNumber && (
                                <span className="text-xs text-slate-400 shrink-0">#{c.caseNumber}</span>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                    {!caseSearch && cases.length > 0 && (
                      <div className="border border-slate-200 rounded-lg overflow-hidden max-h-44 overflow-y-auto shadow-sm">
                        {cases.slice(0, 8).map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setSelectedCase(c)}
                            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-slate-50 text-sm"
                          >
                            <span className="truncate font-medium text-slate-800">{c.title}</span>
                            {c.caseNumber && (
                              <span className="text-xs text-slate-400 shrink-0">#{c.caseNumber}</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Discovery type */}
              <div>
                <Label htmlFor="qd-type" className="mb-1.5 block">Discovery Type</Label>
                <select
                  id="qd-type"
                  value={discoveryType}
                  onChange={(e) => setDiscoveryType(e.target.value as DiscoveryType)}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  {DISCOVERY_TYPES.map((t) => (
                    <option key={t} value={t}>{DISCOVERY_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>

              {/* Date */}
              <div>
                <Label htmlFor="qd-date" className="mb-1.5 block">
                  {direction === "RECEIVED" ? "Date Received" : "Date Served"}
                </Label>
                <Input
                  id="qd-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="h-9"
                  required
                />
                {previewDue && (
                  <p className="text-xs text-slate-400 mt-1">
                    Response due: <span className="font-medium text-slate-600">{previewDue}</span>
                  </p>
                )}
              </div>

              {/* Notes */}
              <div>
                <Label htmlFor="qd-notes" className="mb-1.5 block">Notes <span className="text-slate-400">(optional)</span></Label>
                <Textarea
                  id="qd-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="resize-none"
                />
              </div>

              {error && <p className="text-sm text-rose-600">{error}</p>}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/60">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button
                type="submit"
                disabled={saving || !selectedCase || !date}
                className="bg-teal-700 hover:bg-teal-800 text-white border-0"
              >
                {saving ? "Adding…" : "Add Discovery"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
