import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspaces";

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspace } = await getCurrentWorkspace(user.id);
  if (!workspace) return NextResponse.json({ connection: null });

  const connection = await prisma.gmailConnection.findFirst({
    where: { workspaceId: workspace.id, isActive: true },
    orderBy: { updatedAt: "desc" },
    select: { id: true, email: true, createdAt: true, updatedAt: true },
  });

  return NextResponse.json({ connection });
}

export async function DELETE() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspace } = await getCurrentWorkspace(user.id);
  if (!workspace) return NextResponse.json({ ok: true });

  await prisma.gmailConnection.updateMany({
    where: { workspaceId: workspace!.id, isActive: true },
    data: { isActive: false },
  });

  return NextResponse.json({ ok: true });
}
