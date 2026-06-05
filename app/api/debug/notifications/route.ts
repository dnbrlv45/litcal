import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspaces";

export async function GET() {
  const currentUser = await requireUser();
  if (!currentUser) return NextResponse.json({ error: "no session", userId: null });

  const { workspace } = await getCurrentWorkspace(currentUser.id);

  const count = await prisma.notification.count({
    where: { userId: currentUser.id, workspaceId: workspace?.id },
  });

  return NextResponse.json({
    userId: currentUser.id,
    workspaceId: workspace?.id,
    notificationCount: count,
  });
}
