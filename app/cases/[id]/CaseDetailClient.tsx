"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Calendar, MapPin, Pencil, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EVENT_TYPE_COLORS } from "@/lib/google-calendar";
import type { EventType } from "@/lib/google-calendar";

const STATUS_OPTIONS = ["ACTIVE", "PENDING", "CLOSED", "ARCHIVED"] as const;
const STATUS_COLORS = {
  ACTIVE:   "bg-green-100 text-green-700",
  PENDING:  "bg-yellow-100 text-yellow-700",
  CLOSED:   "bg-slate-100 text-slate-600",
  ARCHIVED: "bg-slate-100 text-slate-400",
};
const TYPE_LABELS: Record<string, string> = {
  AUTO_ACCIDENT: "Auto Accident", SLIP_AND_FALL: "Slip & Fall",
  GOVERNMENT_CLAIM: "Government Claim", DOG_BITE: "Dog Bite",
  PREMISES_LIABILITY: "Premises Liability", MEDICAL_MALPRACTICE: "Medical Malpractice",
  WRONGFUL_DEATH: "Wrongful Death", PRODUCT_LIABILITY: "Product Liability",
  OTHER: "Other",
};
const EVENT_TYPE_LABELS: Record<string, string> = {
  HEARING: "Hearing", DEPOSITION: "Deposition", TRIAL: "Trial",
  CONFERENCE: "Conference", MEETING: "Meeting", DEADLINE: "Deadline",
  REMINDER: "Reminder", OTHER: "Other",
};

interface CaseEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  eventType: EventType;
  location: string | null;
}

interface CaseData {
  id: string;
  title: string;
  caseNumber: string | null;
  status: keyof typeof STATUS_COLORS;
  caseType: string;
  court: string | null;
  county: string | null;
  judge: string | null;
  description: string | null;
  defendant: string | null;
  defenseFirm: string | null;
  defenseAttorney: string | null;
  filingDate: string | null;
  events: CaseEvent[];
}

export default function CaseDetailClient({ id }: { id: string }) {
  const [caseData, setCaseData] = useState<CaseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [editTitle, setEditTitle] = useState("");
  const [editCaseNumber, setEditCaseNumber] = useState("");
  const [editStatus, setEditStatus] = useState<string>("ACTIVE");
  const [editCourt, setEditCourt] = useState("");
  const [editCounty, setEditCounty] = useState("");
  const [editJudge, setEditJudge] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDefendant, setEditDefendant] = useState("");
  const [editDefenseFirm, setEditDefenseFirm] = useState("");
  const [editDefenseAttorney, setEditDefenseAttorney] = useState("");

  const fetchCase = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/cases/${id}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCaseData(data.case);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchCase(); }, [fetchCase]);

  function startEdit() {
    if (!caseData) return;
    setEditTitle(caseData.title);
    setEditCaseNumber(caseData.caseNumber ?? "");
    setEditStatus(caseData.status);
    setEditCourt(caseData.court ?? "");
    setEditCounty(caseData.county ?? "");
    setEditJudge(caseData.judge ?? "");
    setEditDescription(caseData.description ?? "");
    setEditDefendant(caseData.defendant ?? "");
    setEditDefenseFirm(caseData.defenseFirm ?? "");
    setEditDefenseAttorney(caseData.defenseAttorney ?? "");
    setError(null);
    setEditing(true);
  }

  async function handleSave() {
    if (!editTitle.trim()) { setError("Case name is required."); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/cases/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle, caseNumber: editCaseNumber, status: editStatus,
          court: editCourt, county: editCounty, judge: editJudge,
          description: editDescription,
          defendant: editDefendant, defenseFirm: editDefenseFirm, defenseAttorney: editDefenseAttorney,
        }),
      });
      if (!res.ok) throw new Error();
      await fetchCase();
      setEditing(false);
    } catch {
      setError("Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (!caseData) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">Case not found.</p>
        <Link href="/cases"><Button variant="outline" size="sm">Back to Cases</Button></Link>
      </div>
    );
  }

  const upcomingEvents = caseData.events.filter((e) => new Date(e.startTime) >= new Date());
  const pastEvents = caseData.events.filter((e) => new Date(e.startTime) < new Date());

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="px-8 py-5 border-b border-border flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <Link href="/cases" className="mt-0.5 p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0">
            {editing ? (
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="text-lg font-semibold h-auto py-1 mb-1" autoFocus />
            ) : (
              <h1 className="text-xl font-semibold">{caseData.title}</h1>
            )}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {caseData.caseNumber && (
                <span className="text-xs text-muted-foreground font-mono">#{caseData.caseNumber}</span>
              )}
              {editing ? (
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="text-xs rounded-full px-2 py-0.5 border border-input bg-background focus-visible:outline-none"
                >
                  {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
                </select>
              ) : (
                <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${STATUS_COLORS[caseData.status]}`}>
                  {caseData.status.charAt(0) + caseData.status.slice(1).toLowerCase()}
                </span>
              )}
              <span className="text-xs text-muted-foreground">{TYPE_LABELS[caseData.caseType]}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {editing ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setError(null); }}>
                <X className="w-3.5 h-3.5 mr-1" /> Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving} className="bg-teal-700 hover:bg-teal-800 text-white border-0">
                <Check className="w-3.5 h-3.5 mr-1" /> {saving ? "Saving…" : "Save"}
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={startEdit}>
              <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit
            </Button>
          )}
        </div>
      </div>

      <div className="px-8 py-6 grid grid-cols-3 gap-6 max-w-5xl">
        {/* Left: case info */}
        <div className="col-span-1 flex flex-col gap-5">
          <div className="rounded-xl border border-border p-4 flex flex-col gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Case Info</h2>

            <Field label="County" editing={editing}
              display={caseData.county}
              input={<Input value={editCounty} onChange={(e) => setEditCounty(e.target.value)} placeholder="e.g. Los Angeles" />}
            />
            <Field label="Court" editing={editing}
              display={caseData.court}
              input={<Input value={editCourt} onChange={(e) => setEditCourt(e.target.value)} placeholder="e.g. Superior Court" />}
            />
            <Field label="Judge" editing={editing}
              display={caseData.judge}
              input={<Input value={editJudge} onChange={(e) => setEditJudge(e.target.value)} placeholder="Judge name" />}
            />
            {editing && (
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Case Number</Label>
                <Input value={editCaseNumber} onChange={(e) => setEditCaseNumber(e.target.value)} placeholder="e.g. 24-CV-01234" />
              </div>
            )}
            {caseData.filingDate && (
              <Field label="Filed" editing={false}
                display={new Date(caseData.filingDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                input={<></>}
              />
            )}
          </div>

          {/* Defense */}
          {(editing || caseData.defendant || caseData.defenseFirm || caseData.defenseAttorney) && (
            <div className="rounded-xl border border-border p-4 flex flex-col gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Defense</h2>
              <Field label="Defendant" editing={editing}
                display={caseData.defendant}
                input={<Input value={editDefendant} onChange={(e) => setEditDefendant(e.target.value)} placeholder="e.g. John Doe" />}
              />
              <Field label="Defense Firm" editing={editing}
                display={caseData.defenseFirm}
                input={<Input value={editDefenseFirm} onChange={(e) => setEditDefenseFirm(e.target.value)} placeholder="e.g. Smith & Associates" />}
              />
              <Field label="Defense Attorney" editing={editing}
                display={caseData.defenseAttorney}
                input={<Input value={editDefenseAttorney} onChange={(e) => setEditDefenseAttorney(e.target.value)} placeholder="e.g. Jane Smith, Esq." />}
              />
            </div>
          )}

          {/* Description */}
          <div className="rounded-xl border border-border p-4 flex flex-col gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Notes</h2>
            {editing ? (
              <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="Case summary, key facts…" rows={4} />
            ) : caseData.description ? (
              <p className="text-sm text-foreground whitespace-pre-wrap">{caseData.description}</p>
            ) : (
              <p className="text-xs text-muted-foreground italic">No notes.</p>
            )}
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        {/* Right: events */}
        <div className="col-span-2 flex flex-col gap-5">
          <EventGroup label="Upcoming" events={upcomingEvents} />
          <EventGroup label="Past" events={pastEvents} muted />
        </div>
      </div>
    </div>
  );
}

function Field({ label, display, input, editing }: {
  label: string; display: string | null | undefined;
  input: React.ReactNode; editing: boolean;
}) {
  if (editing) return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {input}
    </div>
  );
  if (!display) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm">{display}</span>
    </div>
  );
}

function EventGroup({ label, events, muted }: { label: string; events: CaseEvent[]; muted?: boolean }) {
  if (events.length === 0) return null;
  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
        {label} · {events.length}
      </h2>
      <div className="flex flex-col gap-2">
        {events.map((ev) => {
          const colors = EVENT_TYPE_COLORS[ev.eventType ?? "OTHER"];
          const start = new Date(ev.startTime);
          return (
            <div key={ev.id} className={`rounded-xl border border-border p-3.5 flex items-start gap-3 ${muted ? "opacity-60" : ""}`}>
              <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${colors.dot}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{ev.title}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>
                    {EVENT_TYPE_LABELS[ev.eventType] ?? ev.eventType}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                    {!ev.allDay && ` · ${start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}
                  </span>
                  {ev.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {ev.location}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
