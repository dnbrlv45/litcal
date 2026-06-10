"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Briefcase,
  Building2,
  Calendar,
  CalendarDays,
  Check,
  FileText,
  Gavel,
  MapPin,
  Pencil,
  Plus,
  Shield,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EVENT_TYPE_COLORS } from "@/lib/google-calendar";
import type { EventType } from "@/lib/google-calendar";
import { COUNTIES_AND_COURTS } from "@/lib/counties-courts";
import CaseTasksSection from "./CaseTasksSection";
import CaseTimeline from "./CaseTimeline";

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
  MEDIATION: "Mediation", COURT_CALL: "Court Call",
  CASE_MANAGEMENT_CONFERENCE: "Case Management Conference",
  REMINDER: "Reminder", OTHER: "Other",
};

type StaffRole = "ATTORNEY" | "PARALEGAL" | "ASSISTANT";

interface AssignedUser { id: string; firstName: string | null; lastName: string | null; email: string; }
interface WorkspaceMember { id: string; jobTitle: string | null; user: AssignedUser; }
interface CaseStaffRow { role: StaffRole; user: AssignedUser; }

interface CaseEvent {
  id: string; title: string; startTime: string; endTime: string;
  allDay: boolean; eventType: EventType; location: string | null;
  department: string | null;
}

interface CaseData {
  id: string; title: string; caseNumber: string | null;
  status: keyof typeof STATUS_COLORS; caseType: string;
  court: string | null; county: string | null; judge: string | null;
  countyId: string | null; courtId: string | null;
  countyRef: { id: string; name: string } | null;
  courtRef: { id: string; name: string } | null;
  description: string | null; filingDate: string | null;
  defendant: string | null; defenseFirm: string | null; defenseAttorney: string | null;
  staff: CaseStaffRow[];
  events: CaseEvent[];
}

function userName(u: AssignedUser | null) {
  if (!u) return null;
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return name || u.email;
}

function memberLabel(m: WorkspaceMember) {
  return userName(m.user) ?? m.user.email;
}

export default function CaseDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const [caseData, setCaseData] = useState<CaseData | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const membersFetched = useRef(false);

  // Edit state
  const [editTitle, setEditTitle] = useState("");
  const [editCaseNumber, setEditCaseNumber] = useState("");
  const [editStatus, setEditStatus] = useState<string>("ACTIVE");
  const [editCountyName, setEditCountyName] = useState("");
  const [editCourtName, setEditCourtName] = useState("");
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

  useEffect(() => {
    void Promise.resolve().then(fetchCase);
  }, [fetchCase]);

  useEffect(() => {
    if (!membersFetched.current) {
      membersFetched.current = true;
      fetch("/api/workspaces/members").then((r) => r.json()).then((d) => setMembers(d.members ?? [])).catch(() => {});
    }
  }, []);

  async function addStaff(userId: string, role: StaffRole) {
    setSavingAssignment(true);
    try {
      const res = await fetch(`/api/cases/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffAdd: [{ userId, role }] }),
      });
      if (!res.ok) throw new Error();
      await fetchCase();
    } catch {
      setError("Failed to update assignment.");
    } finally {
      setSavingAssignment(false);
    }
  }

  async function removeStaff(userId: string, role: StaffRole) {
    setSavingAssignment(true);
    try {
      const res = await fetch(`/api/cases/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffRemove: [{ userId, role }] }),
      });
      if (!res.ok) throw new Error();
      await fetchCase();
    } catch {
      setError("Failed to remove assignment.");
    } finally {
      setSavingAssignment(false);
    }
  }

  async function deleteCase() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/cases/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      router.push("/cases");
    } catch {
      setError("Failed to delete case.");
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  function startEdit() {
    if (!caseData) return;
    setEditTitle(caseData.title);
    setEditCaseNumber(caseData.caseNumber ?? "");
    setEditStatus(caseData.status);
    setEditCountyName(caseData.countyRef?.name ?? caseData.county ?? "");
    setEditCourtName(caseData.courtRef?.name ?? caseData.court ?? "");
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
          countyName: editCountyName || null, courtName: editCourtName || null, judge: editJudge,
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

  const editCourts = useMemo(
    () => COUNTIES_AND_COURTS.find((c) => c.name === editCountyName)?.courts ?? [],
    [editCountyName],
  );

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

  const canAssign = caseData.status === "ACTIVE";
  const staffByRole = (role: StaffRole) => caseData.staff.filter((s) => s.role === role);
  const attorneyNames = staffByRole("ATTORNEY").map((s) => userName(s.user)).filter(Boolean);
  const assignedIds = new Set(caseData.staff.map((s) => `${s.user.id}:${s.role}`));

  const attorneys  = members.filter((m) => m.jobTitle === "ATTORNEY");
  const paralegals = members.filter((m) => m.jobTitle === "PARALEGAL");
  const assistants = members.filter((m) => m.jobTitle === "ASSISTANT");

  const select = "flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-100 focus-visible:border-teal-400 disabled:opacity-50 disabled:cursor-not-allowed";
  const displayCourt = caseData.courtRef?.name ?? caseData.court;
  const displayCounty = caseData.countyRef?.name ?? caseData.county;

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-8 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <Link href="/cases" className="mt-1 grid size-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-950 shrink-0">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="min-w-0">
              {editing ? (
                <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="mb-2 h-11 text-2xl font-bold tracking-tight" autoFocus />
              ) : (
                <h1 className="truncate text-2xl font-bold tracking-tight text-slate-950">{caseData.title}</h1>
              )}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {caseData.caseNumber && (
                  <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-xs font-medium text-slate-600">#{caseData.caseNumber}</span>
                )}
                {editing ? (
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium focus-visible:outline-none"
                  >
                    {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
                  </select>
                ) : (
                  <span className={`rounded-md px-2 py-1 text-xs font-semibold ${STATUS_COLORS[caseData.status]}`}>
                    {caseData.status.charAt(0) + caseData.status.slice(1).toLowerCase()}
                  </span>
                )}
                <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600">{TYPE_LABELS[caseData.caseType]}</span>
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
            ) : confirmingDelete ? (
              <>
                <span className="text-xs text-muted-foreground">Delete this case?</span>
                <Button size="sm" variant="ghost" onClick={() => setConfirmingDelete(false)}>Cancel</Button>
                <Button size="sm" variant="destructive" onClick={deleteCase} disabled={deleting}>
                  {deleting ? "Deleting…" : "Yes, delete"}
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="ghost" onClick={() => setConfirmingDelete(true)} className="text-muted-foreground hover:text-rose-600">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
                <Button size="sm" variant="outline" onClick={startEdit}>
                  <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="px-8 py-6">
        <div className="grid max-w-[1500px] grid-cols-2 gap-3 lg:grid-cols-4">
          <SummaryTile icon={Users} label="Attorney" value={attorneyNames.join(", ") || "Unassigned"} />
          <SummaryTile icon={Briefcase} label="Case Type" value={TYPE_LABELS[caseData.caseType]} />
          <SummaryTile icon={Gavel} label="Court" value={displayCourt || "No court"} />
          <SummaryTile icon={CalendarDays} label="Events" value={`${upcomingEvents.length} upcoming`} />
        </div>

        <div className="mt-6 grid max-w-[1500px] grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Left: case info */}
        <div className="flex flex-col gap-5 xl:col-span-4">

          {/* Assignments */}
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-950">Assignments</h2>
                <p className="mt-0.5 text-xs text-slate-500">{caseData.staff.length} assigned team member{caseData.staff.length !== 1 ? "s" : ""}</p>
              </div>
              {savingAssignment && <span className="text-xs text-muted-foreground">Saving…</span>}
              {!canAssign && <span className="text-xs text-muted-foreground italic">Case must be active to assign</span>}
            </div>

            {(["ATTORNEY", "PARALEGAL", "ASSISTANT"] as StaffRole[]).map((role) => {
              const roleLabel = role.charAt(0) + role.slice(1).toLowerCase();
              const pool = role === "ATTORNEY" ? attorneys : role === "PARALEGAL" ? paralegals : assistants;
              const assigned = staffByRole(role);
              const unassigned = pool.filter((m) => !assignedIds.has(`${m.user.id}:${role}`));

              return (
                <div key={role} className="flex flex-col gap-2">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{roleLabel}</Label>

                  {/* Assigned chips */}
                  {assigned.map((s) => (
                    <div key={s.user.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                      <span className="font-medium text-slate-900">{userName(s.user)}</span>
                      {canAssign && (
                        <button
                          onClick={() => removeStaff(s.user.id, role)}
                          disabled={savingAssignment}
                          className="ml-2 text-slate-400 hover:text-rose-500 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}

                  {/* Add dropdown */}
                  {canAssign && unassigned.length > 0 && (
                    <select
                      value=""
                      onChange={(e) => { if (e.target.value) addStaff(e.target.value, role); }}
                      disabled={savingAssignment}
                      className={select}
                    >
                      <option value="">
                        <Plus className="w-3 h-3" />
                        {assigned.length > 0 ? `+ Add another ${roleLabel.toLowerCase()}` : `+ Assign ${roleLabel.toLowerCase()}`}
                      </option>
                      {unassigned.map((m) => (
                        <option key={m.user.id} value={m.user.id}>{memberLabel(m)}</option>
                      ))}
                    </select>
                  )}

                  {canAssign && unassigned.length === 0 && assigned.length === 0 && (
                    <p className="text-xs text-muted-foreground italic">No {roleLabel.toLowerCase()}s in workspace</p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Case Info */}
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm flex flex-col gap-4">
            <CardTitle icon={Building2} title="Case Info" />
            <Field label="County" editing={editing}
              display={displayCounty}
              input={
                <select
                  value={editCountyName}
                  onChange={(e) => { setEditCountyName(e.target.value); setEditCourtName(""); }}
                  className={select}
                >
                  <option value="">— Select county —</option>
                  {COUNTIES_AND_COURTS.map(({ name }) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              }
            />
            <Field label="Court" editing={editing}
              display={displayCourt}
              input={
                <select
                  value={editCourtName}
                  onChange={(e) => setEditCourtName(e.target.value)}
                  disabled={!editCountyName}
                  className={select}
                >
                  <option value="">{editCountyName ? "— Select court —" : "— Select county first —"}</option>
                  {editCourts.map(({ name }) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              }
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
                input={null}
              />
            )}
          </div>

          {/* Defense */}
          {(editing || caseData.defendant || caseData.defenseFirm || caseData.defenseAttorney) && (
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm flex flex-col gap-4">
              <CardTitle icon={Shield} title="Defense" />
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

          {/* Notes */}
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm flex flex-col gap-3">
            <CardTitle icon={FileText} title="Notes" />
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

        {/* Right: events + tasks */}
        <div className="flex flex-col gap-5 xl:col-span-8">
          <EventGroup label="Upcoming" events={upcomingEvents} />
          <EventGroup label="Past" events={pastEvents} muted />
          <CaseTasksSection
            caseId={caseData.id}
            caseTitle={caseData.title}
            caseNumber={caseData.caseNumber}
          />
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <CaseTimeline caseId={caseData.id} />
          </div>
        </div>
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
      <Label className="text-xs font-medium text-slate-500">{label}</Label>
      {input}
    </div>
  );
  if (!display) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-950">{display}</span>
    </div>
  );
}

function CardTitle({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="grid size-7 place-items-center rounded-lg bg-slate-100 text-slate-600">
        <Icon className="size-3.5" />
      </span>
      <h2 className="text-sm font-bold text-slate-950">{title}</h2>
    </div>
  );
}

function SummaryTile({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-700">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
          <div className="mt-1 truncate text-sm font-bold text-slate-950">{value}</div>
        </div>
      </div>
    </div>
  );
}

function EventGroup({ label, events, muted }: { label: string; events: CaseEvent[]; muted?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <CardTitle icon={Calendar} title={label} />
        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{events.length}</span>
      </div>
      {events.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
          <p className="text-sm font-semibold text-slate-700">No {label.toLowerCase()} events</p>
          <p className="mt-1 text-xs text-slate-500">Events linked to this case will appear here.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {events.map((ev) => {
            const colors = EVENT_TYPE_COLORS[ev.eventType ?? "OTHER"];
            const start = new Date(ev.startTime);
            return (
              <div key={ev.id} className={`rounded-lg border border-slate-200 bg-white p-3.5 flex items-start gap-3 transition-colors hover:border-teal-200 hover:bg-teal-50/20 ${muted ? "opacity-70" : ""}`}>
                <div className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${colors.dot}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-slate-950">{ev.title}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-md font-semibold ${colors.bg} ${colors.text}`}>
                      {EVENT_TYPE_LABELS[ev.eventType] ?? ev.eventType}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-xs font-medium text-slate-500 flex-wrap">
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
                    {ev.department && (
                      <span className="flex items-center gap-1">
                        <Building2 className="w-3 h-3" />
                        {ev.department}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
