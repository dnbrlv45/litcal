import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function norm(s: string | null | undefined): string {
  return (s ?? "").trim();
}

function normKey(s: string | null | undefined): string {
  return norm(s).toLowerCase();
}

// GET /api/court-hearing-rules?county=Los+Angeles&court=...
// Used by the event form to look up a rule for a given county/court/department.
export async function GET(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const county = searchParams.get("county");
  const court = searchParams.get("court");
  const department = searchParams.get("department");

  if (!county) return NextResponse.json({ rule: null });

  const { findCourtHearingRule } = await import("@/lib/court-hearing-rules");
  const rule = await findCourtHearingRule({ countyName: county, courtName: court, department });

  return NextResponse.json({ rule });
}

// POST /api/court-hearing-rules/import  body: { rows: CsvRow[] }
// Import (upsert) rows from the CSV.
export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as { rows: Record<string, string>[] };
  const { rows } = body;
  if (!Array.isArray(rows) || rows.length === 0)
    return NextResponse.json({ error: "No rows provided" }, { status: 400 });

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const raw of rows) {
    const countyName = norm(raw["county"]);
    if (!countyName) { skipped++; continue; }

    const state = normKey(raw["state"]) || "ca";
    const courtName   = norm(raw["court_name"])   || null;
    const department  = norm(raw["department"])   || null;
    const appearanceType = norm(raw["appearance_type"]) || null;
    const phoneNumber = norm(raw["phone_number"]) || null;
    const bridge      = norm(raw["bridge"])        || null;
    const password    = norm(raw["password"])      || null;
    const remoteLink          = norm(raw["remote_link"])           || null;
    const requestRequired     = normKey(raw["request_required_bool"]) === "yes";
    const requestContactEmail = norm(raw["request_contact_email"]) || null;
    const requestNotes        = norm(raw["request_notes"])          || null;
    const requestDaysRaw      = parseInt(norm(raw["reqest_task_days_before"]), 10);
    const requestDaysBefore   = isNaN(requestDaysRaw) ? null : requestDaysRaw;

    // Try to resolve countyId / courtId
    let countyId: string | null = null;
    let courtId: string | null = null;
    let departmentId: string | null = null;

    const countyRecord = await prisma.county.findFirst({
      where: { state: { equals: state, mode: "insensitive" }, name: { equals: countyName, mode: "insensitive" } },
    });
    countyId = countyRecord?.id ?? null;

    if (countyId && courtName) {
      const courtRecord = await prisma.court.findFirst({
        where: { countyId, name: { equals: courtName, mode: "insensitive" } },
      });
      courtId = courtRecord?.id ?? null;

      if (courtId && department) {
        // Upsert the Department row
        const deptRecord = await prisma.department.upsert({
          where: { courtId_name: { courtId, name: department } },
          create: { courtId, name: department },
          update: {},
        });
        departmentId = deptRecord.id;
      }
    }

    try {
      const existing = await prisma.courtHearingRule.findUnique({
        where: {
          state_countyName_courtName_department: {
            state: state.toLowerCase(),
            countyName: countyName.toLowerCase(),
            courtName: courtName?.toLowerCase() ?? "",
            department: department?.toLowerCase() ?? "",
          },
        },
      });

      // Normalize keys for the unique constraint (store lowercase for consistent matching)
      const data = {
        state: state.toLowerCase(),
        countyId,
        courtId,
        departmentId,
        countyName: countyName.toLowerCase(),
        courtName: courtName?.toLowerCase() ?? null,
        department: department?.toLowerCase() ?? null,
        appearanceType,
        phoneNumber,
        bridge,
        password,
        remoteLink,
        requestRequired,
        requestContactEmail,
        requestNotes,
        requestDaysBefore,
        active: true,
      };

      if (existing) {
        await prisma.courtHearingRule.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await prisma.courtHearingRule.create({ data });
        created++;
      }
    } catch {
      skipped++;
    }
  }

  return NextResponse.json({ created, updated, skipped });
}
