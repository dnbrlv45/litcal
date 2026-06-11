import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getCurrentWorkspace } from "@/lib/workspaces";
import DeadlineDashboard from "@/components/deadlines/DeadlineDashboard";

export default async function DeadlinesPage() {
  const user = await requireUser();
  if (!user) redirect("/sign-in");

  const { workspace, membership } = await getCurrentWorkspace(user.id);
  if (!workspace || !membership) redirect("/onboarding");

  return (
    <DeadlineDashboard
      currentUserId={user.id}
      currentUserJobTitle={membership.jobTitle ?? null}
      currentUserRole={membership.role}
    />
  );
}
