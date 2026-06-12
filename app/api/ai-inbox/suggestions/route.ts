import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspaces";

export async function GET(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspace } = await getCurrentWorkspace(user.id);
  if (!workspace) return NextResponse.json({ suggestions: [] });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  const suggestions = await prisma.aISuggestion.findMany({
    where: {
      workspaceId: workspace.id,
      ...(status ? { status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({ suggestions });
}
