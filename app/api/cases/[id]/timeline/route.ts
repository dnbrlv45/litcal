import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspaces";
import { FILTER_TYPES } from "@/lib/case-timeline-constants";
import type { TimelineFilter } from "@/lib/case-timeline-constants";

const PAGE_SIZE = 25;

// GET /api/cases/[id]/timeline?order=desc&filter=all&importance=normal&cursor=<id>
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await requireUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspace } = await getCurrentWorkspace(currentUser.id);
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 403 });

  const { id: caseId } = await params;

  const c = await prisma.case.findFirst({
    where: {
      id: caseId,
      OR: [
        { workspaceId: workspace.id },
        { userId: currentUser.id, workspaceId: null },
      ],
    },
    select: { id: true },
  });
  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const order      = searchParams.get("order") === "asc" ? "asc" : "desc";
  const filterKey  = (searchParams.get("filter") ?? "all") as TimelineFilter;
  const importanceMode = searchParams.get("importance") ?? "normal"; // "all" | "normal" (HIGH+NORMAL) | "high"
  const cursor     = searchParams.get("cursor"); // last seen entry id

  const typeFilter = FILTER_TYPES[filterKey] ?? null;

  const importanceFilter =
    importanceMode === "high"   ? ["HIGH"] :
    importanceMode === "normal" ? ["HIGH", "NORMAL"] :
    null; // "all" = no filter

  const where = {
    caseId,
    ...(typeFilter       ? { type:       { in: typeFilter } }       : {}),
    ...(importanceFilter ? { importance: { in: importanceFilter } } : {}),
  };

  // Total matching (for "X remaining" display)
  const total = await prisma.caseTimeline.count({ where });

  const entries = await prisma.caseTimeline.findMany({
    where,
    orderBy: [{ createdAt: order }, { id: order }],
    take: PAGE_SIZE,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      type: true,
      title: true,
      description: true,
      metadata: true,
      importance: true,
      createdAt: true,
      actor: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });

  const nextCursor = entries.length === PAGE_SIZE ? entries[entries.length - 1].id : null;

  return NextResponse.json({ entries, nextCursor, total });
}
