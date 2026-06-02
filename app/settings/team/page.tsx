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
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: workspace.id },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      },
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });
  const invitations = await prisma.workspaceInvitation.findMany({
    where: { workspaceId: workspace.id, acceptedAt: null },
    orderBy: { createdAt: "desc" },
  });

  return (
    <TeamClient
      initialWorkspace={{ id: workspace.id, name: workspace.name }}
      initialMembers={members.map((member) => ({
        id: member.id,
        role: member.role,
        user: member.user,
      }))}
      initialInvitations={invitations.map((invitation) => ({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        createdAt: invitation.createdAt.toISOString(),
      }))}
      currentRole={membership.role}
    />
  );
}
