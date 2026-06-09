import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getCurrentWorkspace, canManageWorkspace } from "@/lib/workspaces";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const user = await requireUser();
  if (!user) return { user: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { membership } = await getCurrentWorkspace(user.id);
  if (!membership || !canManageWorkspace(membership.role))
    return { user: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { user, error: null };
}

// GET /api/court-hearing-rules/manage
// Returns all rules (active + inactive) for the admin page.
export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const rules = await prisma.courtHearingRule.findMany({
    orderBy: [{ countyName: "asc" }, { courtName: "asc" }, { department: "asc" }],
  });

  return NextResponse.json({ rules });
}

// POST /api/court-hearing-rules/manage
// Create a new rule manually.
export async function POST(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await request.json() as {
    countyName: string;
    courtName?: string;
    department?: string;
    appearanceType?: string;
    phoneNumber?: string;
    bridge?: string;
    password?: string;
    remoteLink?: string;
    requestRequired?: boolean;
    requestContactEmail?: string;
    requestNotes?: string;
    requestDaysBefore?: number;
  };

  if (!body.countyName?.trim())
    return NextResponse.json({ error: "countyName is required" }, { status: 400 });

  const countyName = body.countyName.trim().toLowerCase();
  const courtName  = body.courtName?.trim().toLowerCase() || null;
  const department = body.department?.trim().toLowerCase() || null;

  // Resolve or auto-create County
  let countyRecord = await prisma.county.findFirst({
    where: { name: { equals: countyName, mode: "insensitive" } },
  });
  if (!countyRecord) {
    countyRecord = await prisma.county.create({ data: { name: body.countyName.trim() } });
  }

  // Resolve or auto-create Court
  let courtRecord = null;
  if (courtName) {
    courtRecord = await prisma.court.findFirst({
      where: { countyId: countyRecord.id, name: { equals: courtName, mode: "insensitive" } },
    });
    if (!courtRecord) {
      courtRecord = await prisma.court.create({
        data: { countyId: countyRecord.id, name: body.courtName!.trim() },
      });
    }
  }

  // Resolve or auto-create Department
  let departmentRecord = null;
  if (courtRecord && department) {
    departmentRecord = await prisma.department.upsert({
      where: { courtId_name: { courtId: courtRecord.id, name: body.department!.trim() } },
      create: { courtId: courtRecord.id, name: body.department!.trim() },
      update: {},
    });
  }

  try {
    const rule = await prisma.courtHearingRule.create({
      data: {
        countyId: countyRecord.id,
        courtId: courtRecord?.id ?? null,
        departmentId: departmentRecord?.id ?? null,
        countyName,
        courtName,
        department,
        appearanceType: body.appearanceType?.trim() || null,
        phoneNumber: body.phoneNumber?.trim() || null,
        bridge: body.bridge?.trim() || null,
        password: body.password?.trim() || null,
        remoteLink: body.remoteLink?.trim() || null,
        requestRequired: body.requestRequired ?? false,
        requestContactEmail: body.requestContactEmail?.trim() || null,
        requestNotes: body.requestNotes?.trim() || null,
        requestDaysBefore: body.requestDaysBefore ?? null,
        active: true,
      },
    });
    return NextResponse.json({ rule }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "A rule for this county/court/department already exists." }, { status: 409 });
  }
}
