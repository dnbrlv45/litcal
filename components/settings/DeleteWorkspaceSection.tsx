"use client";

import { useState } from "react";
import { ChevronDown, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface DeleteWorkspaceSectionProps {
  workspaceName: string;
}

export default function DeleteWorkspaceSection({ workspaceName }: DeleteWorkspaceSectionProps) {
  const [confirmDelete, setConfirmDelete] = useState("");
  const [deletingWorkspace, setDeletingWorkspace] = useState(false);
  const [open, setOpen] = useState(false);
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
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-rose-50 text-rose-600">
            <Trash2 className="size-4" />
          </span>
          <div>
            <h2 className="font-semibold text-slate-950">Danger Zone</h2>
            <p className="text-sm text-slate-500">Destructive workspace actions.</p>
          </div>
        </div>
        <ChevronDown className={`size-4 shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-slate-200 px-5 py-4">
          <div className="flex max-w-xl flex-col gap-3 rounded-lg border border-rose-200 bg-rose-50/40 p-4">
            <div>
              <h3 className="text-sm font-semibold text-rose-700">Delete Workspace</h3>
              <p className="mt-1 text-sm text-slate-600">Permanently delete this workspace and all its data.</p>
            </div>
            <p className="text-sm text-slate-600">
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
        </div>
      )}
    </section>
  );
}
