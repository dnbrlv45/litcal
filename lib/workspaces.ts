import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function ensureUser(userId: string) {
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (existing) return existing;

  const clerk = await clerkClient();
  const clerkUser = await clerk.users.getUser(userId);
  const email = clerkUser.emailAddresses[0]?.emailAddress ?? "";

  return prisma.user.upsert({
    where: { id: userId },
    create: {
      id: userId,
      email,
      firstName: clerkUser.firstName ?? null,
      lastName: clerkUser.lastName ?? null,
    },
    update: {
      email,
      firstName: clerkUser.firstName ?? null,
      lastName: clerkUser.lastName ?? null,
    },
  });
}

export async function getCurrentWorkspace(userId: string) {
  const user = await ensureUser(userId);

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId },
    include: {
      workspace: true,
    },
    orderBy: { createdAt: "asc" },
  });

  if (membership) return { user, membership, workspace: membership.workspace };

  const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  const workspace = await prisma.workspace.create({
    data: {
      name: displayName ? `${displayName}'s Workspace` : "My Workspace",
      createdBy: userId,
      members: {
        create: {
          userId,
          role: "OWNER",
        },
      },
    },
  });

  const createdMembership = await prisma.workspaceMember.findUniqueOrThrow({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId } },
    include: { workspace: true },
  });

  return { user, membership: createdMembership, workspace };
}

export function canManageWorkspace(role: string) {
  return role === "OWNER" || role === "ADMIN";
}
