import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/admin/court-rule-requests/accept
// Body: { requestId: string }
// Creates a CourtHearingRule from the request, marks it accepted + reviewed.
export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isSuperAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { requestId, overrides } = (await request.json()) as {
    requestId: string;
    overrides?: {
      appearanceType?: string | null;
      remoteLink?: string | null;
      phoneNumber?: string | null;
      bridge?: string | null;
      password?: string | null;
      requestRequired?: boolean;
      requestContactEmail?: string | null;
      notes?: string | null;
    };
  };
  if (!requestId) return NextResponse.json({ error: "Missing requestId" }, { status: 400 });

  const req = await prisma.courtRuleRequest.findUnique({ where: { id: requestId } });
  if (!req) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (req.accepted) return NextResponse.json({ error: "Already accepted" }, { status: 409 });

  const state = req.state.toLowerCase();
  const countyName = req.county.toLowerCase();
  const courtName = req.court?.toLowerCase() ?? null;
  const department = req.department?.toLowerCase() ?? null;

  // Resolve countyId / courtId / departmentId
  const countyRecord = await prisma.county.findFirst({
    where: { state: { equals: state, mode: "insensitive" }, name: { equals: countyName, mode: "insensitive" } },
  });

  let courtId: string | null = null;
  let departmentId: string | null = null;

  if (countyRecord && courtName) {
    const courtRecord = await prisma.court.findFirst({
      where: { countyId: countyRecord.id, name: { equals: courtName, mode: "insensitive" } },
    });
    courtId = courtRecord?.id ?? null;

    if (courtId && department) {
      const deptRecord = await prisma.department.upsert({
        where: { courtId_name: { courtId, name: department } },
        create: { courtId, name: department },
        update: {},
      });
      departmentId = deptRecord.id;
    }
  }

  // Upsert the rule (update if it already exists for this state/county/court/dept combo)
  const existing = await prisma.courtHearingRule.findUnique({
    where: {
      state_countyName_courtName_department: {
        state,
        countyName,
        courtName: courtName ?? "",
        department: department ?? "",
      },
    },
  });

  const o = overrides ?? {};
  const ruleData = {
    state,
    countyId: countyRecord?.id ?? null,
    courtId,
    departmentId,
    countyName,
    courtName,
    department,
    appearanceType:      "appearanceType"      in o ? (o.appearanceType      || null) : (req.appearanceType      || null),
    remoteLink:          "remoteLink"          in o ? (o.remoteLink          || null) : (req.remoteLink          || null),
    phoneNumber:         "phoneNumber"         in o ? (o.phoneNumber         || null) : (req.phoneNumber         || null),
    bridge:              "bridge"              in o ? (o.bridge              || null) : (req.bridge              || null),
    password:            "password"            in o ? (o.password            || null) : (req.password            || null),
    requestRequired:     "requestRequired"     in o ? (o.requestRequired     ?? false) : req.requestRequired,
    requestContactEmail: "requestContactEmail" in o ? (o.requestContactEmail || null) : (req.requestContactEmail || null),
    requestNotes:        "notes"               in o ? (o.notes               || null) : (req.notes               || null),
    active: true,
  };

  if (existing) {
    await prisma.courtHearingRule.update({ where: { id: existing.id }, data: ruleData });
  } else {
    await prisma.courtHearingRule.create({ data: ruleData });
  }

  await prisma.courtRuleRequest.update({
    where: { id: requestId },
    data: { reviewed: true, accepted: true, reviewedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
