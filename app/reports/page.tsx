import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentWorkspace } from "@/lib/workspaces";
import { prisma } from "@/lib/prisma";
import ReportsPanel from "@/components/reports/ReportsPanel";

export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const { workspace, membership } = await getCurrentWorkspace(user.id);
  if (!workspace || !membership) redirect("/setup");

  const attorneys = await prisma.workspaceMember.findMany({
    where: { workspaceId: workspace.id, jobTitle: "ATTORNEY" },
    include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    orderBy: { user: { lastName: "asc" } },
  });

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 p-8">
      <div className="max-w-6xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">Reports</h1>
        <p className="mt-1 text-sm text-slate-500">
          Download Excel reports for calendars, cases, discovery, and trial dates.
        </p>
        <div className="mt-6">
          <ReportsPanel
            attorneys={attorneys.map((m) => ({
              id: m.user.id,
              name: [m.user.firstName, m.user.lastName].filter(Boolean).join(" ") || m.user.email,
            }))}
          />
        </div>
      </div>
    </div>
  );
}
