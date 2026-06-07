"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface DeleteWorkspaceSectionProps {
  workspaceName: string;
}

export default function DeleteWorkspaceSection({ workspaceName }: DeleteWorkspaceSectionProps) {
  const [confirmDelete, setConfirmDelete] = useState("");
  const [deletingWorkspace, setDeletingWorkspace] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deleteWorkspace() {
    setDeletingWorkspace(true);
    setError(null);
    try {
      const res = await fetch("/api/workspaces/current", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to delete workspace.");
      }
      window.location.href = "/setup";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete workspace.");
      setDeletingWorkspace(false);
    }
  }

  return (
    <section className="rounded-lg border border-rose-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-lg bg-rose-50 text-rose-600">
          <Trash2 className="size-4" />
        </span>
        <div>
          <h2 className="font-semibold text-rose-700">Delete Workspace</h2>
          <p className="text-sm text-slate-500">Permanently delete this workspace and all its data.</p>
        </div>
      </div>

      <div className="flex max-w-xl flex-col gap-3">
        <p className="text-sm text-slate-500">
          Type <span className="font-mono font-semibold text-slate-950">{workspaceName}</span> to confirm deletion.
        </p>
        <Input value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} placeholder={workspaceName} />
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <Button
          variant="destructive"
          disabled={confirmDelete.trim() !== workspaceName.trim() || deletingWorkspace}
          onClick={deleteWorkspace}
          className="w-fit"
        >
          {deletingWorkspace ? "Deleting..." : "Delete Workspace"}
        </Button>
      </div>
    </section>
  );
}
