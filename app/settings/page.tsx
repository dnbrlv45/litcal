import Link from "next/link";
import { redirect } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentWorkspace } from "@/lib/workspaces";
import DeleteWorkspaceSection from "@/components/settings/DeleteWorkspaceSection";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const { workspace, membership } = await getCurrentWorkspace(user.id);
  if (!workspace || !membership) redirect("/setup");
  const isOwner = membership.role === "OWNER";

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 p-8">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage integrations, preferences, and workspace safety.</p>
        <Separator className="my-6" />
        <div className="flex flex-col gap-3">
          <Link
            href="/settings/calendar"
            className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 shadow-sm transition-colors hover:border-teal-200 hover:bg-teal-50/30"
          >
            Integrations
          </Link>
          <Link
            href="/settings/notifications"
            className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 shadow-sm transition-colors hover:border-teal-200 hover:bg-teal-50/30"
          >
            Notifications
          </Link>
          <Link
            href="/settings/exports"
            className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 shadow-sm transition-colors hover:border-teal-200 hover:bg-teal-50/30"
          >
            Exports
          </Link>
          <Link
            href="/settings/court-rules"
            className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 shadow-sm transition-colors hover:border-teal-200 hover:bg-teal-50/30"
          >
            Request a Court Rule
          </Link>
          {isOwner && <DeleteWorkspaceSection workspaceName={workspace.name} />}
        </div>
      </div>
    </div>
  );
}
