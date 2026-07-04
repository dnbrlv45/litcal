import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Counties are a global reference table shared by every workspace, so only a
// super admin may mutate them — not per-workspace admins.
async function requireAdmin() {
  const user = await requireUser();
  if (!user) return { user: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!user.isSuperAdmin)
    return { user: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { user, error: null };
}

// POST /api/counties/manage  body: { name }
export async function POST(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { name } = await request.json() as { name: string };
  if (!name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });

  try {
    const county = await prisma.county.upsert({
      where: { state_name: { state: "CA", name: name.trim() } },
      create: { state: "CA", name: name.trim() },
      update: {},
      select: { id: true, name: true, courts: { select: { id: true, name: true }, orderBy: { name: "asc" } } },
    });
    return NextResponse.json({ county }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create county" }, { status: 500 });
  }
}
