import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspaces";
import TeamClient from "./TeamClient";

export default async function TeamPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const userId = user.id;

  const { workspace, membership } = await getCurrentWorkspace(userId);
  if (!workspace || !membership) redirect("/setup");
  const [members, invitations, coverage] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { workspaceId: workspace.id },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    }),
    prisma.workspaceInvitation.findMany({
      where: { workspaceId: workspace.id, acceptedAt: null },
      orderBy: { createdAt: "desc" },
    }),
    prisma.coverageAssignment.findMany({
      where: { workspaceId: workspace.id },
      include: {
        coveredUser:  { select: { id: true, firstName: true, lastName: true, email: true } },
        coveringUser: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { startDate: "desc" },
    }),
  ]);

  return (
    <TeamClient
      initialWorkspace={{ id: workspace.id, name: workspace.name }}
      initialMembers={members.map((member) => ({
        id: member.id,
        role: member.role,
        jobTitle: member.jobTitle,
        user: member.user,
      }))}
      initialInvitations={invitations.map((invitation) => ({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        createdAt: invitation.createdAt.toISOString(),
      }))}
      initialCoverage={coverage.map((a) => ({
        id: a.id,
        startDate: a.startDate.toISOString(),
        endDate: a.endDate.toISOString(),
        note: a.note,
        coveredUser: a.coveredUser,
        coveringUser: a.coveringUser,
      }))}
      currentRole={membership.role}
      currentUserId={userId}
    />
  );
}
