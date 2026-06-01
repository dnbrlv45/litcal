import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspaces";
import TeamClient from "./TeamClient";

export default async function TeamPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

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

  return (
    <TeamClient
      initialWorkspace={{ id: workspace.id, name: workspace.name }}
      initialMembers={members.map((member) => ({
        id: member.id,
        role: member.role,
        user: member.user,
      }))}
      currentRole={membership.role}
    />
  );
}
