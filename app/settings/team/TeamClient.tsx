"use client";

import { useState } from "react";
import { ArrowLeftRight, Building2, Mail, ShieldCheck, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Role = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
type JobTitle = "ATTORNEY" | "PARALEGAL" | "ASSISTANT" | "STAFF" | null;

const JOB_TITLE_OPTIONS: { value: JobTitle; label: string }[] = [
  { value: null,        label: "— No title —" },
  { value: "ATTORNEY",  label: "Attorney" },
  { value: "PARALEGAL", label: "Paralegal" },
  { value: "ASSISTANT", label: "Assistant" },
  { value: "STAFF",     label: "Staff" },
];

interface TeamMember {
  id: string;
  role: Role;
  jobTitle: JobTitle;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
}

interface Workspace { id: string; name: string; }

interface TeamInvitation {
  id: string;
  email: string;
  role: Role;
  createdAt: string;
}

interface CoverageAssignment {
  id: string;
  startDate: string;
  endDate: string;
  note: string | null;
  coveredUser:  { id: string; firstName: string | null; lastName: string | null; email: string };
  coveringUser: { id: string; firstName: string | null; lastName: string | null; email: string };
}

interface Props {
  initialWorkspace: Workspace;
  initialMembers: TeamMember[];
  initialInvitations: TeamInvitation[];
  initialCoverage: CoverageAssignment[];
  currentRole: Role;
  currentUserId: string;
}

function displayName(member: TeamMember) {
  const name = [member.user.firstName, member.user.lastName].filter(Boolean).join(" ").trim();
  return name || member.user.email;
}

function memberName(u: { firstName: string | null; lastName: string | null; email: string }) {
  return [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email;
}

export default function TeamClient({ initialWorkspace, initialMembers, initialInvitations, initialCoverage, currentRole, currentUserId }: Props) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [members, setMembers] = useState(initialMembers);
  const [invitations, setInvitations] = useState(initialInvitations);
  const [coverage, setCoverage] = useState<CoverageAssignment[]>(initialCoverage);
  const [coverageForm, setCoverageForm] = useState({ coveredUserId: "", coveringUserId: "", startDate: "", endDate: "", note: "" });
  const [addingCoverage, setAddingCoverage] = useState(false);
  const [removingCoverageId, setRemovingCoverageId] = useState<string | null>(null);
  const [name, setName] = useState(initialWorkspace.name);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("MEMBER");
  const [savingName, setSavingName] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [savingTitleId, setSavingTitleId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canManage = currentRole === "OWNER" || currentRole === "ADMIN";

  function flash(msg: string, isError = false) {
    if (isError) { setError(msg); setMessage(null); }
    else { setMessage(msg); setError(null); }
  }

  async function saveWorkspaceName(e: React.FormEvent) {
    e.preventDefault();
    setSavingName(true);
    setError(null); setMessage(null);
    try {
      const res = await fetch("/api/workspaces/current", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update team.");
      setWorkspace((prev) => ({ ...prev, name: name.trim() }));
      flash("Team updated.");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Failed to update team.", true);
    } finally {
      setSavingName(false);
    }
  }

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    setAddingMember(true);
    setError(null); setMessage(null);
    try {
      const res = await fetch("/api/workspaces/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add member.");
      if (data.member) {
        setMembers((current) => {
          const without = current.filter((m) => m.id !== data.member.id);
          return [...without, data.member];
        });
        flash(data.emailDelivery?.ok ? "Member added and invite email sent." : "Member added but invite email failed to send.");
      }
      if (data.invitation) {
        setInvitations((current) => {
          const without = current.filter((i) => i.id !== data.invitation.id);
          return [data.invitation, ...without];
        });
        flash(data.emailDelivery?.ok ? "Invitation created and email sent." : "Invitation created but invite email failed to send.");
      }
      setEmail("");
      setRole("MEMBER");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Failed to add member.", true);
    } finally {
      setAddingMember(false);
    }
  }

  async function updateTitle(memberId: string, jobTitle: JobTitle) {
    setSavingTitleId(memberId);
    try {
      const res = await fetch(`/api/workspaces/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobTitle }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setMembers((current) => current.map((m) => m.id === memberId ? { ...m, jobTitle } : m));
    } catch (err) {
      flash(err instanceof Error ? err.message : "Failed to update title.", true);
    } finally {
      setSavingTitleId(null);
    }
  }

  async function updateRole(memberId: string, role: Role) {
    setSavingTitleId(memberId);
    try {
      const res = await fetch(`/api/workspaces/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setMembers((current) => current.map((m) => m.id === memberId ? { ...m, role } : m));
    } catch (err) {
      flash(err instanceof Error ? err.message : "Failed to update role.", true);
    } finally {
      setSavingTitleId(null);
    }
  }

  async function removeMember(memberId: string) {
    setRemovingId(memberId);
    try {
      const res = await fetch(`/api/workspaces/members/${memberId}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setMembers((current) => current.filter((m) => m.id !== memberId));
      flash("Member removed.");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Failed to remove member.", true);
    } finally {
      setRemovingId(null);
    }
  }

  async function cancelInvitation(invitationId: string) {
    setCancellingId(invitationId);
    try {
      const res = await fetch(`/api/workspaces/invitations/${invitationId}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setInvitations((current) => current.filter((i) => i.id !== invitationId));
      flash("Invitation cancelled.");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Failed to cancel invitation.", true);
    } finally {
      setCancellingId(null);
    }
  }

  async function addCoverage(e: React.FormEvent) {
    e.preventDefault();
    setAddingCoverage(true);
    try {
      const res = await fetch("/api/coverage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(coverageForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add coverage.");
      setCoverage((prev) => [data.assignment, ...prev]);
      setCoverageForm({ coveredUserId: "", coveringUserId: "", startDate: "", endDate: "", note: "" });
      flash("Coverage assignment added.");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Failed to add coverage.", true);
    } finally {
      setAddingCoverage(false);
    }
  }

  async function removeCoverage(id: string) {
    setRemovingCoverageId(id);
    try {
      const res = await fetch(`/api/coverage/${id}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setCoverage((prev) => prev.filter((a) => a.id !== id));
      flash("Coverage assignment removed.");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Failed to remove coverage.", true);
    } finally {
      setRemovingCoverageId(null);
    }
  }

  const select = "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

  // ── Non-admin view ──────────────────────────────────────────────────────────
  if (!canManage) {
    return (
      <div className="flex-1 overflow-y-auto px-8 py-8">
        <div className="mx-auto flex max-w-4xl flex-col gap-6">
          <div>
            <h1 className="text-xl font-semibold">Team</h1>
            <p className="mt-1 text-sm text-muted-foreground">{workspace.name}</p>
          </div>
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-3">
              <Users className="size-5 text-teal-700" />
              <h2 className="font-semibold">Members</h2>
            </div>
            <div className="divide-y divide-border rounded-lg border border-border">
              {members.map((member) => (
                <div key={member.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{displayName(member)}</p>
                    <p className="truncate text-xs text-muted-foreground">{member.user.email}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {member.jobTitle && (
                      <span className="text-xs text-muted-foreground">{member.jobTitle.charAt(0) + member.jobTitle.slice(1).toLowerCase()}</span>
                    )}
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                      <ShieldCheck className="size-3.5" />
                      {member.role.toLowerCase()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    );
  }

  // ── Admin / Owner view ──────────────────────────────────────────────────────
  return (
    <div className="flex-1 overflow-y-auto px-8 py-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div>
          <h1 className="text-xl font-semibold">Team</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your team&apos;s workspace, members, and invitations.
          </p>
        </div>

        {(message || error) && (
          <div className={`rounded-lg border px-4 py-3 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
            {error ?? message}
          </div>
        )}

        {/* Workspace name */}
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center gap-3">
            <Building2 className="size-5 text-teal-700" />
            <div>
              <h2 className="font-semibold">Workspace</h2>
              <p className="text-sm text-muted-foreground">Cases and calendar events are shared inside this team.</p>
            </div>
          </div>
          <form onSubmit={saveWorkspaceName} className="flex max-w-xl items-end gap-3">
            <div className="flex-1">
              <Label htmlFor="workspace-name">Team name</Label>
              <Input id="workspace-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <Button type="submit" disabled={savingName} className="bg-teal-700 text-white hover:bg-teal-800">
              {savingName ? "Saving..." : "Save"}
            </Button>
          </form>
        </section>

        {/* Members */}
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center gap-3">
            <Users className="size-5 text-teal-700" />
            <div>
              <h2 className="font-semibold">Members</h2>
              <p className="text-sm text-muted-foreground">
                {workspace.name} has {members.length} member{members.length === 1 ? "" : "s"}
                {invitations.length > 0 ? ` and ${invitations.length} pending invite${invitations.length === 1 ? "" : "s"}.` : "."}
              </p>
            </div>
          </div>

          <div className="divide-y divide-border rounded-lg border border-border">
            {members.map((member) => (
              <div key={member.id} className="flex items-center gap-4 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{displayName(member)}</p>
                  <p className="truncate text-xs text-muted-foreground">{member.user.email}</p>
                </div>
                {/* Title dropdown — inline save */}
                <select
                  value={member.jobTitle ?? ""}
                  onChange={(e) => updateTitle(member.id, (e.target.value || null) as JobTitle)}
                  disabled={savingTitleId === member.id}
                  className="h-8 rounded-md border border-input bg-background px-2 py-0 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 w-32"
                >
                  {JOB_TITLE_OPTIONS.map(({ value, label }) => (
                    <option key={value ?? ""} value={value ?? ""}>{label}</option>
                  ))}
                </select>
                {currentRole === "OWNER" && member.role !== "OWNER" ? (
                  <select
                    value={member.role}
                    onChange={(e) => updateRole(member.id, e.target.value as Role)}
                    disabled={savingTitleId === member.id}
                    className="h-8 rounded-md border border-input bg-background px-2 py-0 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 w-28"
                  >
                    <option value="VIEWER">Viewer</option>
                    <option value="MEMBER">Member</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 shrink-0">
                    <ShieldCheck className="size-3.5" />
                    {member.role.toLowerCase()}
                  </span>
                )}
                {member.role !== "OWNER" && member.user.id !== currentUserId && (
                  <button
                    onClick={() => removeMember(member.id)}
                    disabled={removingId === member.id}
                    className="p-1 rounded text-muted-foreground hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-40 shrink-0"
                    title="Remove member"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {invitations.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Pending invites</h3>
              <div className="divide-y divide-border rounded-lg border border-border">
                {invitations.map((invitation) => (
                  <div key={invitation.id} className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{invitation.email}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        Invited {new Date(invitation.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                        {invitation.role.toLowerCase()} pending
                      </span>
                      <button
                        onClick={() => cancelInvitation(invitation.id)}
                        disabled={cancellingId === invitation.id}
                        className="p-1 rounded text-muted-foreground hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-40"
                        title="Cancel invitation"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Invite */}
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center gap-3">
            <Mail className="size-5 text-teal-700" />
            <div>
              <h2 className="font-semibold">Invite Team Member</h2>
              <p className="text-sm text-muted-foreground">Add an existing user or create a pending invite for someone new.</p>
            </div>
          </div>
          <form onSubmit={addMember} className="grid max-w-2xl grid-cols-[1fr_140px_auto] items-end gap-3">
            <div>
              <Label htmlFor="member-email">Email</Label>
              <Input id="member-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@firm.com" />
            </div>
            <div>
              <Label htmlFor="member-role">Role</Label>
              <select id="member-role" value={role} onChange={(e) => setRole(e.target.value as Role)} className={select}>
                <option value="VIEWER">Viewer — view only</option>
                <option value="MEMBER">Member — can edit</option>
                <option value="ADMIN">Admin — edit &amp; delete</option>
              </select>
            </div>
            <Button type="submit" disabled={addingMember} className="bg-teal-700 text-white hover:bg-teal-800">
              {addingMember ? "Adding..." : "Add"}
            </Button>
          </form>
        </section>

        {/* Coverage */}
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center gap-3">
            <ArrowLeftRight className="size-5 text-teal-700" />
            <div>
              <h2 className="font-semibold">Attorney Coverage</h2>
              <p className="text-sm text-muted-foreground">
                When an attorney is out, assign someone to cover their cases. The covering attorney will receive all event and deadline notifications for that period.
              </p>
            </div>
          </div>

          {coverage.length > 0 && (
            <div className="mb-4 divide-y divide-border rounded-lg border border-border">
              {coverage.map((a) => {
                const start = new Date(a.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                const end   = new Date(a.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                const now = new Date();
                const isActive = new Date(a.startDate) <= now && new Date(a.endDate) >= now;
                return (
                  <div key={a.id} className="flex items-center gap-4 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        <span className="text-slate-500">Out:</span> {memberName(a.coveredUser)}
                        <span className="mx-2 text-slate-300">→</span>
                        <span className="text-slate-500">Covering:</span> {memberName(a.coveringUser)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {start} – {end}
                        {a.note ? ` · ${a.note}` : ""}
                      </p>
                    </div>
                    {isActive && (
                      <span className="shrink-0 rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-700 ring-1 ring-teal-200">Active</span>
                    )}
                    <button
                      onClick={() => removeCoverage(a.id)}
                      disabled={removingCoverageId === a.id}
                      className="p-1 rounded text-muted-foreground hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-40 shrink-0"
                      title="Remove coverage"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <form onSubmit={addCoverage} className="grid max-w-2xl gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="covered-user">Attorney out</Label>
                <select
                  id="covered-user"
                  value={coverageForm.coveredUserId}
                  onChange={(e) => setCoverageForm((f) => ({ ...f, coveredUserId: e.target.value }))}
                  required
                  className={select}
                >
                  <option value="">— Select attorney —</option>
                  {members.filter((m) => m.jobTitle === "ATTORNEY").map((m) => (
                    <option key={m.id} value={m.user.id}>{displayName(m)}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="covering-user">Covering attorney</Label>
                <select
                  id="covering-user"
                  value={coverageForm.coveringUserId}
                  onChange={(e) => setCoverageForm((f) => ({ ...f, coveringUserId: e.target.value }))}
                  required
                  className={select}
                >
                  <option value="">— Select attorney —</option>
                  {members.filter((m) => m.jobTitle === "ATTORNEY").map((m) => (
                    <option key={m.id} value={m.user.id}>{displayName(m)}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="coverage-start">From</Label>
                <Input id="coverage-start" type="date" value={coverageForm.startDate} onChange={(e) => setCoverageForm((f) => ({ ...f, startDate: e.target.value }))} required />
              </div>
              <div>
                <Label htmlFor="coverage-end">To</Label>
                <Input id="coverage-end" type="date" value={coverageForm.endDate} onChange={(e) => setCoverageForm((f) => ({ ...f, endDate: e.target.value }))} required />
              </div>
            </div>
            <div>
              <Label htmlFor="coverage-note">Note <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input id="coverage-note" value={coverageForm.note} onChange={(e) => setCoverageForm((f) => ({ ...f, note: e.target.value }))} placeholder="e.g. vacation, conference" />
            </div>
            <div>
              <Button type="submit" disabled={addingCoverage} className="bg-teal-700 text-white hover:bg-teal-800">
                {addingCoverage ? "Adding..." : "Add Coverage"}
              </Button>
            </div>
          </form>
        </section>

      </div>
    </div>
  );
}
