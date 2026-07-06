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
  const countsOnly = searchParams.get("countsOnly") === "1";

  const baseWhere = { workspaceId: workspace.id };
  const [suggestions, counts] = await Promise.all([
    countsOnly
      ? Promise.resolve([])
      : prisma.aISuggestion.findMany({
          where: {
            ...baseWhere,
            ...(status ? { status } : {}),
          },
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
    prisma.aISuggestion.groupBy({
      by: ["status"],
      where: baseWhere,
      _count: { _all: true },
    }),
  ]);

  return NextResponse.json({
    suggestions,
    counts: counts.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = row._count._all;
      return acc;
    }, {}),
  });
}
