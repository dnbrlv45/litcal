"use client";

import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertCircle } from "lucide-react";

interface CountyOption {
  id: string;
  name: string;
  state: string;
  courts: { id: string; name: string }[];
}

export default function RequestCourtRulePage() {
  const [counties, setCounties] = useState<CountyOption[]>([]);
  const [countyId, setCountyId] = useState("");
  const [courtId, setCourtId] = useState("");
  const [department, setDepartment] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/counties")
      .then((r) => r.json())
      .then((d: { counties: CountyOption[] }) => setCounties(d.counties ?? []));
  }, []);

  const selectedCounty = counties.find((c) => c.id === countyId);
  const availableCourts = selectedCounty?.courts ?? [];
  const selectedCourt = availableCourts.find((c) => c.id === courtId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!countyId) { setError("Please select a county."); return; }
    setSaving(true); setError(null);
    const res = await fetch("/api/court-rule-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        county: selectedCounty?.name ?? "",
        court: selectedCourt?.name ?? undefined,
        department: department.trim() || undefined,
        notes: notes.trim() || undefined,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setSuccess(true);
      setCountyId(""); setCourtId(""); setDepartment(""); setNotes("");
    } else {
      const d = await res.json() as { error?: string };
      setError(d.error ?? "Failed to submit request.");
    }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 p-8">
      <div className="max-w-xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">Request Court Rule</h1>
        <p className="text-sm text-slate-500 mt-1">
          Don&apos;t see remote appearance info for a court? Submit a request and we&apos;ll research and add it.
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-8 flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="county">County <span className="text-rose-500">*</span></Label>
            <select
              id="county"
              value={countyId}
              onChange={(e) => { setCountyId(e.target.value); setCourtId(""); }}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">— Select county —</option>
              {counties.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.state})</option>
              ))}
            </select>
          </div>

          {countyId && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="court">Courthouse <span className="text-slate-400 font-normal text-xs">(optional)</span></Label>
              <select
                id="court"
                value={courtId}
                onChange={(e) => setCourtId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">— All courthouses —</option>
                {availableCourts.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {courtId && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dept">Department <span className="text-slate-400 font-normal text-xs">(optional)</span></Label>
              <Input
                id="dept"
                placeholder="e.g. 10A, 285"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">What do you know about this court&apos;s remote appearance setup? <span className="text-slate-400 font-normal text-xs">(optional)</span></Label>
            <textarea
              id="notes"
              rows={3}
              placeholder="e.g. They use Zoom, the link is posted on the court website. Request must be filed 5 days before."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
          </div>

          {success && (
            <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
              <CheckCircle className="w-4 h-4 shrink-0" />
              Request submitted — we&apos;ll review it and add the rule.
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              <AlertCircle className="w-4 h-4 shrink-0" />{error}
            </div>
          )}

          <Button type="submit" disabled={saving || !countyId} className="self-start">
            {saving ? "Submitting…" : "Submit Request"}
          </Button>
        </form>
      </div>
    </div>
  );
}
