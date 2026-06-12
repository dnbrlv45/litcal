import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentWorkspace, canManageWorkspace } from "@/lib/workspaces";
import { prisma } from "@/lib/prisma";
import ExportsPanel from "@/components/settings/ExportsPanel";

export default async function ExportsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const { workspace, membership } = await getCurrentWorkspace(user.id);
  if (!workspace || !membership) redirect("/setup");

  const isAdmin = canManageWorkspace(membership.role);

  // Fetch attorneys in the workspace for the filter dropdown
  const attorneys = isAdmin
    ? await prisma.workspaceMember.findMany({
        where: { workspaceId: workspace.id, jobTitle: "ATTORNEY" },
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { user: { lastName: "asc" } },
      })
    : [];

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 p-8">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">Exports</h1>
        <p className="mt-1 text-sm text-slate-500">Download CSV reports for your calendar and cases.</p>
        <div className="mt-6 flex flex-col gap-6">
          <ExportsPanel
            isAdmin={isAdmin}
            attorneys={attorneys.map((m) => ({
              id: m.user.id,
              name: [m.user.firstName, m.user.lastName].filter(Boolean).join(" "),
            }))}
          />
        </div>
      </div>
    </div>
  );
}
