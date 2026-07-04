import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Courts are a global reference table shared by every workspace, so only a
// super admin may mutate them — not per-workspace admins.
async function requireAdmin() {
  const user = await requireUser();
  if (!user) return { user: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!user.isSuperAdmin)
    return { user: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { user, error: null };
}

// POST /api/courts/manage  body: { countyId, name }
export async function POST(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { countyId, name } = await request.json() as { countyId: string; name: string };
  if (!countyId || !name?.trim())
    return NextResponse.json({ error: "countyId and name are required" }, { status: 400 });

  try {
    const court = await prisma.court.upsert({
      where: { countyId_name: { countyId, name: name.trim() } },
      create: { countyId, name: name.trim() },
      update: {},
      select: { id: true, name: true },
    });
    return NextResponse.json({ court }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create court" }, { status: 500 });
  }
}
