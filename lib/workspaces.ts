import { prisma } from "@/lib/prisma";

export async function ensureUser(userId: string) {
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (existing) return existing;

  throw new Error("Authenticated user record was not found.");
}

export async function getCurrentWorkspace(userId: string) {
  const user = await ensureUser(userId);

  const pendingInvite = await prisma.workspaceInvitation.findFirst({
    where: {
      email: user.email.toLowerCase(),
      acceptedAt: null,
    },
    orderBy: { createdAt: "asc" },
  });

  if (pendingInvite) {
    await prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: pendingInvite.workspaceId, userId } },
      create: {
        workspaceId: pendingInvite.workspaceId,
        userId,
        role: pendingInvite.role,
      },
      update: {},
    });
    await prisma.workspaceInvitation.update({
      where: { id: pendingInvite.id },
      data: { acceptedAt: new Date() },
    });
  }

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId },
    include: {
      workspace: true,
    },
    orderBy: { createdAt: "asc" },
  });

  if (membership) return { user, membership, workspace: membership.workspace };

  return { user, membership: null, workspace: null };
}

export async function createWorkspace(userId: string, name: string) {
  const user = await ensureUser(userId);
  const displayName = name.trim() || ([user.firstName, user.lastName].filter(Boolean).join(" ").trim()) || "My Workspace";
  const workspace = await prisma.workspace.create({
    data: {
      name: displayName,
      createdBy: userId,
      members: { create: { userId, role: "OWNER" } },
    },
  });
  const membership = await prisma.workspaceMember.findUniqueOrThrow({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId } },
    include: { workspace: true },
  });
  return { workspace, membership };
}

export function canManageWorkspace(role: string) {
  return role === "OWNER" || role === "ADMIN";
}
