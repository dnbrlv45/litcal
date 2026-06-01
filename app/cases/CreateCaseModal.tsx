"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const CASE_TYPES = [
  { value: "CIVIL", label: "Civil" },
  { value: "CRIMINAL", label: "Criminal" },
  { value: "FAMILY", label: "Family" },
  { value: "BANKRUPTCY", label: "Bankruptcy" },
  { value: "IMMIGRATION", label: "Immigration" },
  { value: "ADMINISTRATIVE", label: "Administrative" },
  { value: "OTHER", label: "Other" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateCaseModal({ open, onClose, onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [caseNumber, setCaseNumber] = useState("");
  const [caseType, setCaseType] = useState("CIVIL");
  const [court, setCourt] = useState("");
  const [judge, setJudge] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setTitle(""); setCaseNumber(""); setCaseType("CIVIL");
    setCourt(""); setJudge(""); setJurisdiction("");
    setDescription(""); setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError("Case name is required."); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, caseNumber, caseType, court, judge, jurisdiction, description }),
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

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); reset(); } }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Case</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="case-title">Case Name <span className="text-destructive">*</span></Label>
            <Input id="case-title" placeholder="e.g. Garcia v. State Farm Insurance Co." value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="case-number">Case Number</Label>
              <Input id="case-number" placeholder="e.g. 24-CV-01234" value={caseNumber} onChange={(e) => setCaseNumber(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="case-type">Case Type</Label>
              <select
                id="case-type"
                value={caseType}
                onChange={(e) => setCaseType(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {CASE_TYPES.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="case-court">Court</Label>
            <Input id="case-court" placeholder="e.g. Los Angeles Superior Court" value={court} onChange={(e) => setCourt(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="case-judge">Judge</Label>
              <Input id="case-judge" placeholder="e.g. Hon. Jane Doe" value={judge} onChange={(e) => setJudge(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="case-jurisdiction">Jurisdiction</Label>
              <Input id="case-jurisdiction" placeholder="e.g. California" value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="case-desc">Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea id="case-desc" placeholder="Brief summary of the case…" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
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
