"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Upload, CheckCircle, AlertCircle, Plus, Pencil, Check, X,
  ChevronDown, ChevronRight, PowerOff, Power,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Rule {
  id: string;
  countyName: string;
  courtName: string | null;
  department: string | null;
  appearanceType: string | null;
  phoneNumber: string | null;
  bridge: string | null;
  password: string | null;
  remoteLink: string | null;
  requestRequired: boolean;
  active: boolean;
}

interface CountyOption {
  id: string;
  name: string;
  courts: { id: string; name: string }[];
}

interface ImportResult { created: number; updated: number; skipped: number; }

// ─── CSV parser ───────────────────────────────────────────────────────────────

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const values: string[] = [];
    let cur = ""; let inQuote = false;
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === "," && !inQuote) { values.push(cur.trim()); cur = ""; }
      else { cur += ch; }
    }
    values.push(cur.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ""; });
    return row;
  });
}

// ─── Inline text field ───────────────────────────────────────────────────────

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-8 text-sm" />
    </div>
  );
}

// ─── Rule row ─────────────────────────────────────────────────────────────────

function RuleRow({ rule, onSaved }: { rule: Rule; onSaved: (updated: Rule) => void }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    appearanceType: rule.appearanceType ?? "",
    phoneNumber:    rule.phoneNumber    ?? "",
    bridge:         rule.bridge         ?? "",
    password:       rule.password       ?? "",
    remoteLink:     rule.remoteLink     ?? "",
    requestRequired: rule.requestRequired,
  });

  function scopeLabel() {
    if (rule.department) return `Dept. ${rule.department}`;
    if (rule.courtName)  return rule.courtName;
    return "County-wide";
  }

  async function handleSave() {
    setSaving(true);
    const res = await fetch(`/api/court-hearing-rules/manage/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appearanceType:  form.appearanceType  || null,
        phoneNumber:     form.phoneNumber     || null,
        bridge:          form.bridge          || null,
        password:        form.password        || null,
        remoteLink:      form.remoteLink      || null,
        requestRequired: form.requestRequired,
      }),
    });
    setSaving(false);
    if (res.ok) {
      const { rule: updated } = await res.json() as { rule: Rule };
      onSaved(updated);
      setEditing(false);
    }
  }

  async function handleToggleActive() {
    const res = await fetch(`/api/court-hearing-rules/manage/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !rule.active }),
    });
    if (res.ok) {
      const { rule: updated } = await res.json() as { rule: Rule };
      onSaved(updated);
    }
  }

  return (
    <div className={`rounded-lg border ${rule.active ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50 opacity-60"} px-4 py-3 flex flex-col gap-3`}>
      {/* Header row */}
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${rule.active ? "text-slate-900" : "text-slate-400 line-through"}`}>
            {scopeLabel()}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            {rule.courtName
              ? `${rule.countyName} · ${rule.courtName}${rule.department ? ` · Dept. ${rule.department}` : ""}`
              : rule.countyName}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {rule.requestRequired && (
            <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
              Req.
            </span>
          )}
          {rule.appearanceType && (
            <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
              {rule.appearanceType}
            </span>
          )}
          <button
            onClick={() => setEditing((v) => !v)}
            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
            title="Edit"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => void handleToggleActive()}
            className={`p-1.5 rounded-md transition-colors ${rule.active ? "hover:bg-rose-50 text-slate-400 hover:text-rose-600" : "hover:bg-green-50 text-slate-400 hover:text-green-600"}`}
            title={rule.active ? "Deactivate" : "Reactivate"}
          >
            {rule.active ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Quick summary (non-editing) */}
      {!editing && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          {rule.remoteLink  && <span>Link: <a href={rule.remoteLink} target="_blank" rel="noopener noreferrer" className="text-teal-700 underline truncate max-w-[200px] inline-block align-bottom">{rule.remoteLink}</a></span>}
          {rule.phoneNumber && <span>Phone: {rule.phoneNumber}</span>}
          {rule.bridge      && <span>Bridge: <span className="font-mono">{rule.bridge}</span></span>}
          {rule.password    && <span>Password: <span className="font-mono">{rule.password}</span></span>}
          {!rule.remoteLink && !rule.phoneNumber && !rule.bridge && (
            <span className="italic text-slate-300">No appearance details</span>
          )}
        </div>
      )}

      {/* Edit form */}
      {editing && (
        <div className="flex flex-col gap-3 pt-1 border-t border-slate-100">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Appearance Type" value={form.appearanceType} onChange={(v) => setForm((f) => ({ ...f, appearanceType: v }))} />
            <Field label="Phone Number"    value={form.phoneNumber}    onChange={(v) => setForm((f) => ({ ...f, phoneNumber: v }))} />
            <Field label="Bridge"          value={form.bridge}         onChange={(v) => setForm((f) => ({ ...f, bridge: v }))} />
            <Field label="Password"        value={form.password}       onChange={(v) => setForm((f) => ({ ...f, password: v }))} />
          </div>
          <Field label="Remote Link" value={form.remoteLink} onChange={(v) => setForm((f) => ({ ...f, remoteLink: v }))} />
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.requestRequired}
              onChange={(e) => setForm((f) => ({ ...f, requestRequired: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 accent-slate-900"
            />
            <span className="text-sm text-slate-700">Request required</span>
          </label>
          <div className="flex gap-2">
            <Button size="sm" disabled={saving} onClick={() => void handleSave()} className="h-8">
              <Check className="w-3.5 h-3.5 mr-1" />
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => {
              setForm({
                appearanceType: rule.appearanceType ?? "",
                phoneNumber:    rule.phoneNumber    ?? "",
                bridge:         rule.bridge         ?? "",
                password:       rule.password       ?? "",
                remoteLink:     rule.remoteLink     ?? "",
                requestRequired: rule.requestRequired,
              });
              setEditing(false);
            }}>
              <X className="w-3.5 h-3.5 mr-1" />Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Add Rule Form ────────────────────────────────────────────────────────────

function AddRuleForm({
  counties,
  onCreated,
  onCountyCreated,
  onCourtCreated,
}: {
  counties: CountyOption[];
  onCreated: (rule: Rule) => void;
  onCountyCreated: (county: CountyOption) => void;
  onCourtCreated: (countyId: string, court: { id: string; name: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // County
  const [countyId, setCountyId]         = useState("");
  const [newCountyName, setNewCountyName] = useState("");
  const [addingCounty, setAddingCounty]   = useState(false);
  const [creatingCounty, setCreatingCounty] = useState(false);

  // Court
  const [courtId, setCourtId]           = useState("");
  const [newCourtName, setNewCourtName]   = useState("");
  const [addingCourt, setAddingCourt]     = useState(false);
  const [creatingCourt, setCreatingCourt] = useState(false);

  // Department
  const [department, setDepartment] = useState("");

  // Rule fields
  const [appearanceType, setAppearanceType] = useState("");
  const [phoneNumber, setPhoneNumber]       = useState("");
  const [bridge, setBridge]                 = useState("");
  const [password, setPassword]             = useState("");
  const [remoteLink, setRemoteLink]         = useState("");
  const [requestRequired, setRequestRequired] = useState(false);

  const selectedCounty = counties.find((c) => c.id === countyId);
  const availableCourts = selectedCounty?.courts ?? [];

  function reset() {
    setCountyId(""); setNewCountyName(""); setAddingCounty(false);
    setCourtId("");  setNewCourtName("");  setAddingCourt(false);
    setDepartment("");
    setAppearanceType(""); setPhoneNumber(""); setBridge("");
    setPassword(""); setRemoteLink(""); setRequestRequired(false);
    setApiError(null);
  }

  async function handleAddCounty() {
    if (!newCountyName.trim()) return;
    setCreatingCounty(true);
    const res = await fetch("/api/counties/manage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newCountyName.trim() }),
    });
    setCreatingCounty(false);
    if (res.ok) {
      const { county } = await res.json() as { county: CountyOption };
      onCountyCreated(county);
      setCountyId(county.id);
      setNewCountyName(""); setAddingCounty(false);
    }
  }

  async function handleAddCourt() {
    if (!newCourtName.trim() || !countyId) return;
    setCreatingCourt(true);
    const res = await fetch("/api/courts/manage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ countyId, name: newCourtName.trim() }),
    });
    setCreatingCourt(false);
    if (res.ok) {
      const { court } = await res.json() as { court: { id: string; name: string } };
      onCourtCreated(countyId, court);
      setCourtId(court.id);
      setNewCourtName(""); setAddingCourt(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!countyId && !newCountyName.trim()) { setApiError("Select or create a county."); return; }
    setSaving(true); setApiError(null);

    const selectedCourt = availableCourts.find((c) => c.id === courtId);

    const res = await fetch("/api/court-hearing-rules/manage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        countyName:      selectedCounty?.name ?? newCountyName.trim(),
        courtName:       selectedCourt?.name  ?? (newCourtName.trim() || undefined),
        department:      department.trim()    || undefined,
        appearanceType:  appearanceType.trim() || undefined,
        phoneNumber:     phoneNumber.trim()    || undefined,
        bridge:          bridge.trim()         || undefined,
        password:        password.trim()       || undefined,
        remoteLink:      remoteLink.trim()     || undefined,
        requestRequired,
      }),
    });
    setSaving(false);
    if (res.ok) {
      const { rule } = await res.json() as { rule: Rule };
      onCreated(rule);
      reset(); setOpen(false);
    } else {
      const d = await res.json() as { error?: string };
      setApiError(d.error ?? "Failed to create rule.");
    }
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="self-start" size="sm">
        <Plus className="w-4 h-4 mr-1.5" />Add Rule
      </Button>
    );
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="rounded-xl border border-slate-200 bg-white p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-900">New Court Hearing Rule</p>
        <button type="button" onClick={() => { reset(); setOpen(false); }} className="p-1 rounded hover:bg-slate-100 text-slate-400">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* County */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">County <span className="text-rose-500">*</span></Label>
        <select
          value={countyId}
          onChange={(e) => { setCountyId(e.target.value === "__new__" ? "" : e.target.value); setCourtId(""); if (e.target.value === "__new__") setAddingCounty(true); }}
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="">— Select county —</option>
          {counties.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          <option value="__new__" className="font-semibold">+ New county</option>
        </select>
        {addingCounty && (
          <div className="flex gap-2">
            <Input
              placeholder="County name"
              value={newCountyName}
              onChange={(e) => setNewCountyName(e.target.value)}
              className="h-8 text-sm"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleAddCounty(); } }}
              autoFocus
            />
            <Button type="button" size="sm" className="h-8 shrink-0" disabled={!newCountyName.trim() || creatingCounty} onClick={() => void handleAddCounty()}>
              {creatingCounty ? "Adding…" : "Add"}
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-8 shrink-0" onClick={() => { setAddingCounty(false); setNewCountyName(""); }}>Cancel</Button>
          </div>
        )}
      </div>

      {/* Court */}
      {countyId && (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Courthouse <span className="text-muted-foreground font-normal">(optional — leave blank for county-wide rule)</span></Label>
          <select
            value={courtId}
            onChange={(e) => { setCourtId(e.target.value === "__new__" ? "" : e.target.value); if (e.target.value === "__new__") setAddingCourt(true); }}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">— County-wide (no courthouse) —</option>
            {availableCourts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="__new__" className="font-semibold">+ New courthouse</option>
          </select>
          {addingCourt && (
            <div className="flex gap-2">
              <Input
                placeholder="Courthouse name"
                value={newCourtName}
                onChange={(e) => setNewCourtName(e.target.value)}
                className="h-8 text-sm"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleAddCourt(); } }}
                autoFocus
              />
              <Button type="button" size="sm" className="h-8 shrink-0" disabled={!newCourtName.trim() || creatingCourt} onClick={() => void handleAddCourt()}>
                {creatingCourt ? "Adding…" : "Add"}
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-8 shrink-0" onClick={() => { setAddingCourt(false); setNewCourtName(""); }}>Cancel</Button>
            </div>
          )}
        </div>
      )}

      {/* Department */}
      {courtId && (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Department <span className="text-muted-foreground font-normal">(optional — leave blank for court-wide rule)</span></Label>
          <Input
            placeholder="e.g. 10A, 285, 18b"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="h-9 text-sm"
          />
        </div>
      )}

      <div className="border-t border-slate-100 pt-3 flex flex-col gap-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Appearance Details</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Appearance Type" value={appearanceType} onChange={setAppearanceType} />
          <Field label="Phone Number"    value={phoneNumber}    onChange={setPhoneNumber} />
          <Field label="Bridge"          value={bridge}         onChange={setBridge} />
          <Field label="Password"        value={password}       onChange={setPassword} />
        </div>
        <Field label="Remote Link" value={remoteLink} onChange={setRemoteLink} />
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={requestRequired}
            onChange={(e) => setRequestRequired(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 accent-slate-900"
          />
          <span className="text-sm text-slate-700">Request required</span>
        </label>
      </div>

      {apiError && (
        <div className="flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          <AlertCircle className="w-4 h-4 shrink-0" />{apiError}
        </div>
      )}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving} className="h-9">
          {saving ? "Creating…" : "Create Rule"}
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-9" onClick={() => { reset(); setOpen(false); }}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ─── County group ─────────────────────────────────────────────────────────────

function CountyGroup({ countyName, rules, onSaved }: { countyName: string; rules: Rule[]; onSaved: (r: Rule) => void }) {
  const [open, setOpen] = useState(true);
  const active   = rules.filter((r) => r.active).length;
  const inactive = rules.filter((r) => !r.active).length;

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-left group"
      >
        {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
        <span className="text-sm font-semibold text-slate-800 capitalize group-hover:text-slate-950">{countyName}</span>
        <span className="text-xs text-slate-400">{active} active{inactive > 0 ? `, ${inactive} inactive` : ""}</span>
      </button>
      {open && (
        <div className="ml-6 flex flex-col gap-2">
          {rules.map((r) => <RuleRow key={r.id} rule={r} onSaved={onSaved} />)}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CourtRulesPage() {
  const [rules, setRules]     = useState<Rule[]>([]);
  const [counties, setCounties] = useState<CountyOption[]>([]);
  const [loading, setLoading]   = useState(true);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError]   = useState<string | null>(null);
  const [isAdmin, setIsAdmin]   = useState<boolean | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rulesRes, countiesRes] = await Promise.all([
        fetch("/api/court-hearing-rules/manage"),
        fetch("/api/counties"),
      ]);
      if (rulesRes.status === 403) { setIsAdmin(false); return; }
      setIsAdmin(true);
      if (rulesRes.ok)    setRules((await rulesRes.json() as { rules: Rule[] }).rules);
      if (countiesRes.ok) setCounties((await countiesRes.json() as { counties: CountyOption[] }).counties);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function handleRuleSaved(updated: Rule) {
    setRules((prev) => prev.map((r) => r.id === updated.id ? updated : r));
  }

  function handleRuleCreated(rule: Rule) {
    setRules((prev) => [...prev, rule]);
  }

  function handleCountyCreated(county: CountyOption) {
    setCounties((prev) => {
      if (prev.find((c) => c.id === county.id)) return prev;
      return [...prev, county].sort((a, b) => a.name.localeCompare(b.name));
    });
  }

  function handleCourtCreated(countyId: string, court: { id: string; name: string }) {
    setCounties((prev) => prev.map((c) =>
      c.id === countyId
        ? { ...c, courts: [...c.courts.filter((x) => x.id !== court.id), court].sort((a, b) => a.name.localeCompare(b.name)) }
        : c
    ));
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true); setImportResult(null); setImportError(null);
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length === 0) { setImportError("No rows found in CSV."); return; }
      const res = await fetch("/api/court-hearing-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      if (!res.ok) { setImportError("Import failed."); return; }
      setImportResult(await res.json());
      void load(); // refresh list
    } catch {
      setImportError("Could not read the file.");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // Group rules by county
  const grouped = rules.reduce<Record<string, Rule[]>>((acc, r) => {
    const key = r.countyName;
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="p-8 text-sm text-slate-400">Loading…</div>
    );
  }

  if (isAdmin === false) {
    return (
      <div className="p-8 max-w-xl">
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          Only workspace admins and owners can manage court hearing rules.
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Court Hearing Rules</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage remote appearance rules by county, courthouse, and department. Rules are matched automatically when creating events.
        </p>
      </div>

      {/* CSV Import */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 flex flex-col gap-4">
        <p className="text-sm font-semibold text-slate-800">Import from CSV</p>
        <label className="flex items-center gap-3 cursor-pointer rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 hover:border-teal-400 hover:bg-teal-50/30 transition-colors">
          <Upload className="w-5 h-5 text-slate-400 shrink-0" />
          <span className="text-sm text-slate-500">{importing ? "Importing…" : "Click to upload CSV"}</span>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={handleFile} disabled={importing} />
        </label>
        {importResult && (
          <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
            <CheckCircle className="w-4 h-4 shrink-0" />
            {importResult.created} created · {importResult.updated} updated · {importResult.skipped} skipped
          </div>
        )}
        {importError && (
          <div className="flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            <AlertCircle className="w-4 h-4 shrink-0" />{importError}
          </div>
        )}
      </div>

      {/* Manual rules */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-800">
            Rules{rules.length > 0 ? ` (${rules.length})` : ""}
          </p>
        </div>

        <AddRuleForm
          counties={counties}
          onCreated={handleRuleCreated}
          onCountyCreated={handleCountyCreated}
          onCourtCreated={handleCourtCreated}
        />

        {rules.length === 0 ? (
          <p className="text-sm text-slate-400 italic">No rules yet. Import a CSV or add one manually above.</p>
        ) : (
          <div className="flex flex-col gap-5">
            {Object.keys(grouped).sort().map((county) => (
              <CountyGroup
                key={county}
                countyName={county}
                rules={grouped[county]}
                onSaved={handleRuleSaved}
              />
            ))}
          </div>
        )}
      </div>

      {/* Matching info */}
      <div className="rounded-xl border border-slate-100 bg-slate-50 p-5 flex flex-col gap-2">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Matching priority</p>
        <ol className="list-decimal list-inside flex flex-col gap-1 text-sm text-slate-600">
          <li>County + courthouse + department</li>
          <li>County + courthouse (all departments)</li>
          <li>County-wide rule</li>
          <li>No match — manual entry, no rule applied</li>
        </ol>
      </div>
    </div>
  );
}
