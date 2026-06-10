"use client";

import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertCircle } from "lucide-react";

const US_STATES = [
  { code: "AL", name: "Alabama" }, { code: "AK", name: "Alaska" }, { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" }, { code: "CA", name: "California" }, { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" }, { code: "DE", name: "Delaware" }, { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" }, { code: "HI", name: "Hawaii" }, { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" }, { code: "IN", name: "Indiana" }, { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" }, { code: "KY", name: "Kentucky" }, { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" }, { code: "MD", name: "Maryland" }, { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" }, { code: "MN", name: "Minnesota" }, { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" }, { code: "MT", name: "Montana" }, { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" }, { code: "NH", name: "New Hampshire" }, { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" }, { code: "NY", name: "New York" }, { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" }, { code: "OH", name: "Ohio" }, { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" }, { code: "PA", name: "Pennsylvania" }, { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" }, { code: "SD", name: "South Dakota" }, { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" }, { code: "UT", name: "Utah" }, { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" }, { code: "WA", name: "Washington" }, { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" }, { code: "WY", name: "Wyoming" },
];

interface CountyOption {
  id: string;
  name: string;
  state: string;
  courts: { id: string; name: string }[];
}

function Field({ label, value, onChange, placeholder, optional }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; optional?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-sm">
        {label}{" "}
        {optional && <span className="text-slate-400 font-normal text-xs">(optional)</span>}
      </Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-9 text-sm" />
    </div>
  );
}

export default function RequestCourtRulePage() {
  const [allCounties, setAllCounties] = useState<CountyOption[]>([]);

  // Location
  const [state, setState] = useState("CA");
  const [countyId, setCountyId] = useState("");
  const [countyText, setCountyText] = useState("");
  const [courtId, setCourtId] = useState("");
  const [courtText, setCourtText] = useState("");
  const [department, setDepartment] = useState("");

  // Appearance info
  const [appearanceType, setAppearanceType] = useState("");
  const [remoteLink, setRemoteLink] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [bridge, setBridge] = useState("");
  const [password, setPassword] = useState("");
  const [requestRequired, setRequestRequired] = useState(false);
  const [requestContactEmail, setRequestContactEmail] = useState("");
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/counties")
      .then((r) => r.json())
      .then((d: { counties: CountyOption[] }) => setAllCounties(d.counties ?? []));
  }, []);

  const countiesForState = allCounties.filter((c) => c.state.toUpperCase() === state.toUpperCase());
  const selectedCounty = countiesForState.find((c) => c.id === countyId);
  const availableCourts = selectedCounty?.courts ?? [];
  const selectedCourt = availableCourts.find((c) => c.id === courtId);

  const countyName = selectedCounty?.name ?? countyText;
  const courtName = selectedCourt?.name ?? courtText;

  function reset() {
    setCountyId(""); setCountyText(""); setCourtId(""); setCourtText(""); setDepartment("");
    setAppearanceType(""); setRemoteLink(""); setPhoneNumber(""); setBridge(""); setPassword("");
    setRequestRequired(false); setRequestContactEmail(""); setNotes("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!countyName.trim()) { setError("County is required."); return; }
    setSaving(true); setError(null);

    const res = await fetch("/api/court-rule-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        state,
        county: countyName.trim(),
        court: courtName.trim() || undefined,
        department: department.trim() || undefined,
        appearanceType: appearanceType.trim() || undefined,
        remoteLink: remoteLink.trim() || undefined,
        phoneNumber: phoneNumber.trim() || undefined,
        bridge: bridge.trim() || undefined,
        password: password.trim() || undefined,
        requestRequired,
        requestContactEmail: requestContactEmail.trim() || undefined,
        notes: notes.trim() || undefined,
      }),
    });

    setSaving(false);
    if (res.ok) {
      setSuccess(true);
      reset();
    } else {
      const d = await res.json() as { error?: string };
      setError(d.error ?? "Failed to submit request.");
    }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 p-8">
      <div className="max-w-xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">Request a Court Rule</h1>
        <p className="text-sm text-slate-500 mt-1">
          Fill in as much as you know. If you include the remote appearance link, we may be able to approve it right away.
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-8 flex flex-col gap-6">

          {/* ── Location ── */}
          <div className="flex flex-col gap-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Location</p>

            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">State</Label>
              <select
                value={state}
                onChange={(e) => { setState(e.target.value); setCountyId(""); setCourtId(""); }}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {US_STATES.map((s) => (
                  <option key={s.code} value={s.code}>{s.name}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">County <span className="text-rose-500">*</span></Label>
              {countiesForState.length > 0 ? (
                <select
                  value={countyId}
                  onChange={(e) => { setCountyId(e.target.value); setCourtId(""); }}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">— Select county —</option>
                  {countiesForState.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              ) : (
                <Input
                  placeholder="County name"
                  value={countyText}
                  onChange={(e) => setCountyText(e.target.value)}
                  className="h-9 text-sm"
                />
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Courthouse <span className="text-slate-400 font-normal text-xs">(optional)</span></Label>
              {availableCourts.length > 0 ? (
                <select
                  value={courtId}
                  onChange={(e) => setCourtId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">— Select courthouse —</option>
                  {availableCourts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              ) : (
                <Input
                  placeholder="e.g. Stanley Mosk Courthouse"
                  value={courtText}
                  onChange={(e) => setCourtText(e.target.value)}
                  className="h-9 text-sm"
                />
              )}
            </div>

            <Field label="Department" value={department} onChange={setDepartment} placeholder="e.g. 10A, 285" optional />
          </div>

          {/* ── Appearance info ── */}
          <div className="flex flex-col gap-4 pt-2 border-t border-slate-200">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Remote Appearance Info <span className="normal-case font-normal text-slate-400">(fill in what you know)</span></p>

            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Appearance Type <span className="text-slate-400 font-normal text-xs">(optional)</span></Label>
              <select
                value={appearanceType}
                onChange={(e) => setAppearanceType(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">— Unknown —</option>
                <option value="zoom">Zoom</option>
                <option value="teams">Microsoft Teams</option>
                <option value="court call">CourtCall</option>
                <option value="phone">Phone</option>
                <option value="webex">Webex</option>
                <option value="other">Other</option>
              </select>
            </div>

            <Field label="Remote Link" value={remoteLink} onChange={setRemoteLink} placeholder="https://zoom.us/j/..." optional />
            <Field label="Phone Number" value={phoneNumber} onChange={setPhoneNumber} placeholder="(213) 555-0100" optional />
            <Field label="Bridge / Access Code" value={bridge} onChange={setBridge} placeholder="123456789" optional />
            <Field label="Password / PIN" value={password} onChange={setPassword} placeholder="Optional" optional />

            <div className="flex flex-col gap-3">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={requestRequired}
                  onChange={(e) => setRequestRequired(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 accent-slate-900"
                />
                <span className="text-sm text-slate-700">Remote appearance must be requested in advance</span>
              </label>
              {requestRequired && (
                <Field label="Request Email" value={requestContactEmail} onChange={setRequestContactEmail} placeholder="clerk@court.gov" optional />
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Additional Notes <span className="text-slate-400 font-normal text-xs">(optional)</span></Label>
              <textarea
                rows={3}
                placeholder="Anything else that would help — filing deadlines, portal links, special instructions, etc."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              />
            </div>
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

          <Button type="submit" disabled={saving || !countyName.trim()} className="self-start">
            {saving ? "Submitting…" : "Submit Request"}
          </Button>
        </form>
      </div>
    </div>
  );
}
