"use client";

import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COUNTIES_AND_COURTS } from "@/lib/counties-courts";

const CASE_TYPES = [
  { value: "AUTO_ACCIDENT",       label: "Auto Accident" },
  { value: "SLIP_AND_FALL",       label: "Slip & Fall" },
  { value: "GOVERNMENT_CLAIM",    label: "Government Claim" },
  { value: "DOG_BITE",            label: "Dog Bite" },
  { value: "PREMISES_LIABILITY",  label: "Premises Liability" },
  { value: "MEDICAL_MALPRACTICE", label: "Medical Malpractice" },
  { value: "WRONGFUL_DEATH",      label: "Wrongful Death" },
  { value: "PRODUCT_LIABILITY",   label: "Product Liability" },
  { value: "UIM_ARBITRATION",     label: "UIM Arbitration" },
  { value: "OTHER",               label: "Other" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const EMPTY = {
  title: "", caseNumber: "", caseType: "AUTO_ACCIDENT",
  countyName: "", courtName: "",
  plaintiff: "", filingDate: "", dateOfLoss: "",
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

  function setCounty(e: React.ChangeEvent<HTMLSelectElement>) {
    setFields((f) => ({ ...f, countyName: e.target.value, courtName: "" }));
  }

  function reset() { setFields(EMPTY); setError(null); }

  const courts = useMemo(
    () => COUNTIES_AND_COURTS.find((c) => c.name === fields.countyName)?.courts ?? [],
    [fields.countyName],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fields.title.trim()) { setError("Case name is required."); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: fields.title,
          caseNumber: fields.caseNumber,
          caseType: fields.caseType,
          countyName: fields.countyName || null,
          courtName: fields.courtName || null,
          plaintiff: fields.plaintiff || null,
          filingDate: fields.filingDate || null,
          dateOfLoss: fields.dateOfLoss || null,
          defendant: fields.defendant,
          defenseFirm: fields.defenseFirm,
          defenseAttorney: fields.defenseAttorney,
        }),
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

          {/* Plaintiff + Filing Date */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="case-plaintiff">Plaintiff</Label>
              <Input id="case-plaintiff" placeholder="e.g. Jane Garcia" value={fields.plaintiff} onChange={set("plaintiff")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="case-filing-date">Date Filed</Label>
              <Input id="case-filing-date" type="date" value={fields.filingDate} onChange={set("filingDate")} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="case-date-of-loss">Date of Loss</Label>
            <Input id="case-date-of-loss" type="date" value={fields.dateOfLoss} onChange={set("dateOfLoss")} />
          </div>

          {/* County + Court */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="case-county">County</Label>
              <select id="case-county" value={fields.countyName} onChange={setCounty} className={select}>
                <option value="">— Select county —</option>
                {COUNTIES_AND_COURTS.map(({ name }) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="case-court">Court</Label>
              <select
                id="case-court"
                value={fields.courtName}
                onChange={set("courtName")}
                disabled={!fields.countyName}
                className={select}
              >
                <option value="">{fields.countyName ? "— Select court —" : "— Select county first —"}</option>
                {courts.map(({ name }) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
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
