"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CASE_TYPES = [
  { value: "AUTO_ACCIDENT",       label: "Auto Accident" },
  { value: "SLIP_AND_FALL",       label: "Slip & Fall" },
  { value: "GOVERNMENT_CLAIM",    label: "Government Claim" },
  { value: "DOG_BITE",            label: "Dog Bite" },
  { value: "PREMISES_LIABILITY",  label: "Premises Liability" },
  { value: "MEDICAL_MALPRACTICE", label: "Medical Malpractice" },
  { value: "WRONGFUL_DEATH",      label: "Wrongful Death" },
  { value: "PRODUCT_LIABILITY",   label: "Product Liability" },
  { value: "OTHER",               label: "Other" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const EMPTY = {
  title: "", caseNumber: "", caseType: "AUTO_ACCIDENT",
  county: "", court: "",
  defendant: "", defenseFirm: "", defenseAttorney: "",
};

export default function CreateCaseModal({ open, onClose, onCreated }: Props) {
  const [fields, setFields] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(key: keyof typeof EMPTY) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setFields((f) => ({ ...f, [key]: e.target.value }));
  }

  function reset() { setFields(EMPTY); setError(null); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fields.title.trim()) { setError("Case name is required."); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) throw new Error();
      onCreated();
      onClose();
      reset();
    } catch {
      setError("Failed to create case. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const select = "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); reset(); } }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Case</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-2">
          {/* Case Name */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="case-title">Case Name <span className="text-destructive">*</span></Label>
            <Input id="case-title" placeholder="e.g. Garcia v. State Farm Insurance Co." value={fields.title} onChange={set("title")} autoFocus />
          </div>

          {/* Number + Type */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="case-number">Case Number</Label>
              <Input id="case-number" placeholder="e.g. 24-CV-01234" value={fields.caseNumber} onChange={set("caseNumber")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="case-type">Case Type</Label>
              <select id="case-type" value={fields.caseType} onChange={set("caseType")} className={select}>
                {CASE_TYPES.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* County + Court */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="case-county">County</Label>
              <Input id="case-county" placeholder="e.g. Los Angeles" value={fields.county} onChange={set("county")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="case-court">Court</Label>
              <Input id="case-court" placeholder="e.g. Superior Court" value={fields.court} onChange={set("court")} />
            </div>
          </div>

          {/* Defense */}
          <div className="border-t border-border pt-3 flex flex-col gap-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Defense</p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="case-defendant">Defendant</Label>
              <Input id="case-defendant" placeholder="e.g. John Doe" value={fields.defendant} onChange={set("defendant")} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="case-defense-firm">Defense Firm</Label>
                <Input id="case-defense-firm" placeholder="e.g. Smith & Associates" value={fields.defenseFirm} onChange={set("defenseFirm")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="case-defense-attorney">Defense Attorney</Label>
                <Input id="case-defense-attorney" placeholder="e.g. Jane Smith, Esq." value={fields.defenseAttorney} onChange={set("defenseAttorney")} />
              </div>
            </div>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <DialogFooter className="mt-1">
            <Button type="button" variant="ghost" onClick={() => { onClose(); reset(); }}>Cancel</Button>
            <Button type="submit" disabled={saving} className="bg-teal-700 hover:bg-teal-800 text-white border-0">
              {saving ? "Creating…" : "Create Case"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
