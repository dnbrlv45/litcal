"use client";

import { useState } from "react";
import { Building2, Mail, ShieldCheck, Users } from "lucide-react";
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
}

function displayName(member: TeamMember) {
  const name = [member.user.firstName, member.user.lastName].filter(Boolean).join(" ").trim();
  return name || member.user.email;
}

export default function TeamClient({ initialWorkspace, initialMembers, initialInvitations, currentRole }: Props) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [members, setMembers] = useState(initialMembers);
  const [invitations, setInvitations] = useState(initialInvitations);
  const [name, setName] = useState(initialWorkspace.name);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("MEMBER");
  const [savingName, setSavingName] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canManage = currentRole === "OWNER" || currentRole === "ADMIN";

  async function saveWorkspaceName(e: React.FormEvent) {
    e.preventDefault();
    setSavingName(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/workspaces/current", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update team.");
      setWorkspace(data.workspace);
      setMessage("Team updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update team.");
    } finally {
      setSavingName(false);
    }
  }

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    setAddingMember(true);
    setError(null);
    setMessage(null);
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
          const withoutExisting = current.filter((member) => member.id !== data.member.id);
          return [...withoutExisting, data.member];
        });
        setMessage("Member added.");
      }
      if (data.invitation) {
        setInvitations((current) => {
          const withoutExisting = current.filter((invitation) => invitation.id !== data.invitation.id);
          return [data.invitation, ...withoutExisting];
        });
        setMessage("Invitation created. They will join this team automatically after signing in with that email.");
      }
      setEmail("");
      setRole("MEMBER");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add member.");
    } finally {
      setAddingMember(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-8 py-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div>
          <h1 className="text-xl font-semibold">Team</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage LitCal-owned teams without Clerk organization seat limits.
          </p>
        </div>

        {(message || error) && (
          <div className={`rounded-lg border px-4 py-3 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
            {error ?? message}
          </div>
        )}

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
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                  <ShieldCheck className="size-3.5" />
                  {member.role.toLowerCase()}
                </span>
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
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                      {invitation.role.toLowerCase()} pending
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

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
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
      </div>
    </div>
  );
}
