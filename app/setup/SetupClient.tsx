"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SetupClient() {
  const router = useRouter();
  const [workspaceName, setWorkspaceName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: workspaceName.trim() }),
      });
      if (!res.ok) throw new Error();
      router.push("/");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col flex-1 items-center justify-center gap-8 text-center px-4 bg-slate-50">
      <div className="flex flex-col items-center gap-3">
        <Image src="/litcal-logo.svg" alt="LitCal" width={48} height={48} className="size-12 rounded-xl shadow-sm" priority />
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">No workspace found</h1>
          <p className="text-sm text-slate-500 max-w-sm">
            Your account isn&apos;t associated with a workspace. You can create one below, or ask your administrator to invite you.
          </p>
        </div>
      </div>

      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm text-left">
        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="workspace-name">Workspace name</Label>
            <Input
              id="workspace-name"
              placeholder="e.g. Smith & Associates"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              autoFocus
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <Button type="submit" disabled={saving} className="w-full bg-slate-950 hover:bg-slate-800">
            {saving ? "Creating…" : "Create Workspace"}
          </Button>
        </form>
      </div>

      <form action="/api/auth/sign-out" method="post">
        <button className="text-xs text-slate-400 hover:text-slate-600 underline">
          Sign out
        </button>
      </form>
    </div>
  );
}
