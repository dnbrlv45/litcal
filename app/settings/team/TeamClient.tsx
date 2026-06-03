"use client";

import { useState } from "react";
import { Building2, Mail, ShieldCheck, Trash2, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Role = "OWNER" | "ADMIN" | "MEMBER";

interface TeamMember {
  id: string;
  role: Role;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
}

interface Workspace {
  id: string;
  name: string;
}

interface TeamInvitation {
  id: string;
  email: string;
  role: Role;
  createdAt: string;
}

interface Props {
  initialWorkspace: Workspace;
  initialMembers: TeamMember[];
  initialInvitations: TeamInvitation[];
  currentRole: Role;
  currentUserId: string;
}

function displayName(member: TeamMember) {
  const name = [member.user.firstName, member.user.lastName].filter(Boolean).join(" ").trim();
  return name || member.user.email;
}

export default function TeamClient({ initialWorkspace, initialMembers, initialInvitations, currentRole, currentUserId }: Props) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [members, setMembers] = useState(initialMembers);
  const [invitations, setInvitations] = useState(initialInvitations);
  const [name, setName] = useState(initialWorkspace.name);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("MEMBER");
  const [savingName, setSavingName] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [deletingWorkspace, setDeletingWorkspace] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canManage = currentRole === "OWNER" || currentRole === "ADMIN";
  const isOwner = currentRole === "OWNER";

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
      setWorkspace(data.workspace);
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
        flash(data.emailDelivery?.ok ? "Member added and invite email sent." : "Member added. Connect Google again in Calendar settings to send invite emails from Gmail.");
      }
      if (data.invitation) {
        setInvitations((current) => {
          const without = current.filter((i) => i.id !== data.invitation.id);
          return [data.invitation, ...without];
        });
        flash(data.emailDelivery?.ok ? "Invitation created and email sent." : "Invitation created. Connect Google again in Calendar settings to send invite emails from Gmail.");
      }
      setEmail("");
      setRole("MEMBER");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Failed to add member.", true);
    } finally {
      setAddingMember(false);
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

  async function deleteWorkspace() {
    setDeletingWorkspace(true);
    try {
      const res = await fetch("/api/workspaces/current", { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      window.location.href = "/";
    } catch (err) {
      flash(err instanceof Error ? err.message : "Failed to delete workspace.", true);
      setDeletingWorkspace(false);
    }
  }

  const select = "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

  return (
    <div className="flex-1 overflow-y-auto px-8 py-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div>
          <h1 className="text-xl font-semibold">Team</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your team's workspace, members, and invitations.
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
              <Input id="workspace-name" value={name} onChange={(e) => setName(e.target.value)} disabled={!canManage} />
            </div>
            <Button type="submit" disabled={!canManage || savingName} className="bg-teal-700 text-white hover:bg-teal-800">
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
              <div key={member.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{displayName(member)}</p>
                  <p className="truncate text-xs text-muted-foreground">{member.user.email}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                    <ShieldCheck className="size-3.5" />
                    {member.role.toLowerCase()}
                  </span>
                  {canManage && member.role !== "OWNER" && member.user.id !== currentUserId && (
                    <button
                      onClick={() => removeMember(member.id)}
                      disabled={removingId === member.id}
                      className="p-1 rounded text-muted-foreground hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-40"
                      title="Remove member"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
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
                      {canManage && (
                        <button
                          onClick={() => cancelInvitation(invitation.id)}
                          disabled={cancellingId === invitation.id}
                          className="p-1 rounded text-muted-foreground hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-40"
                          title="Cancel invitation"
                        >
                          <X className="size-3.5" />
                        </button>
                      )}
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
              <Input id="member-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!canManage} placeholder="name@firm.com" />
            </div>
            <div>
              <Label htmlFor="member-role">Role</Label>
              <select
                id="member-role"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                disabled={!canManage}
                className={select}
              >
                <option value="MEMBER">Member</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
            <Button type="submit" disabled={!canManage || addingMember} className="bg-teal-700 text-white hover:bg-teal-800">
              {addingMember ? "Adding..." : "Add"}
            </Button>
          </form>
        </section>

        {/* Danger zone */}
        {isOwner && (
          <section className="rounded-xl border border-rose-200 bg-card p-5">
            <div className="mb-4 flex items-center gap-3">
              <Trash2 className="size-5 text-rose-600" />
              <div>
                <h2 className="font-semibold text-rose-700">Danger Zone</h2>
                <p className="text-sm text-muted-foreground">Permanently delete this workspace and all its data.</p>
              </div>
            </div>
            <div className="flex flex-col gap-3 max-w-xl">
              <p className="text-sm text-muted-foreground">
                Type <span className="font-mono font-semibold text-foreground">{workspace.name}</span> to confirm deletion.
              </p>
              <Input
                value={confirmDelete}
                onChange={(e) => setConfirmDelete(e.target.value)}
                placeholder={workspace.name}
              />
              <Button
                variant="destructive"
                disabled={confirmDelete !== workspace.name || deletingWorkspace}
                onClick={deleteWorkspace}
                className="w-fit"
              >
                {deletingWorkspace ? "Deleting…" : "Delete Workspace"}
              </Button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
