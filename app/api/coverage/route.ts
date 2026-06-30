import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getCurrentWorkspace, canEdit } from "@/lib/workspaces";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspace } = await getCurrentWorkspace(user.id);
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 403 });

  const assignments = await prisma.coverageAssignment.findMany({
    where: { workspaceId: workspace.id },
    include: {
      coveredUser:  { select: { id: true, firstName: true, lastName: true, email: true } },
      coveringUser: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
    orderBy: { startDate: "desc" },
  });

  return NextResponse.json({ assignments });
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspace, membership } = await getCurrentWorkspace(user.id);
  if (!workspace || !membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  if (!canEdit(membership.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json() as { coveredUserId: string; coveringUserId: string; startDate: string; endDate: string; note?: string };
  const { coveredUserId, coveringUserId, startDate, endDate, note } = body;

  if (!coveredUserId || !coveringUserId || !startDate || !endDate)
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  if (coveredUserId === coveringUserId)
    return NextResponse.json({ error: "Covered and covering attorney must be different" }, { status: 400 });

  const assignment = await prisma.coverageAssignment.create({
    data: {
      workspaceId: workspace.id,
      coveredUserId,
      coveringUserId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      note: note?.trim() || null,
    },
    include: {
      coveredUser:  { select: { id: true, firstName: true, lastName: true, email: true } },
      coveringUser: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });

  return NextResponse.json({ assignment });
}
