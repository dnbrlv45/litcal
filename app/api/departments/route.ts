import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/departments?courtId=xxx
export async function GET(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const courtId = searchParams.get("courtId");
  if (!courtId) return NextResponse.json({ departments: [] });

  const departments = await prisma.department.findMany({
    where: { courtId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return NextResponse.json({ departments });
}

// POST /api/departments  body: { courtId, name }
// Creates a new department (user-initiated from the event form dropdown).
export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { courtId, name } = await request.json() as { courtId: string; name: string };
  if (!courtId || !name?.trim())
    return NextResponse.json({ error: "courtId and name are required" }, { status: 400 });

  const dept = await prisma.department.upsert({
    where: { courtId_name: { courtId, name: name.trim() } },
    create: { courtId, name: name.trim() },
    update: {},
    select: { id: true, name: true },
  });

  return NextResponse.json({ department: dept });
}
