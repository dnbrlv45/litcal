import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findCourtHearingRule } from "@/lib/court-hearing-rules";

// GET /api/admin/court-coverage/preview-updates?alertId=...
// Returns the count of future events that can now be updated for this alert.
export async function GET(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isSuperAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const alertId = request.nextUrl.searchParams.get("alertId");
  if (!alertId) return NextResponse.json({ error: "Missing alertId" }, { status: 400 });

  const alert = await prisma.courtCoverageAlert.findUnique({ where: { id: alertId } });
  if (!alert) return NextResponse.json({ error: "Alert not found" }, { status: 404 });

  // Check if a rule now exists for this alert
  const rule = await findCourtHearingRule({
    state: alert.state,
    countyName: alert.county,
    courtName: alert.court || null,
    department: alert.department || null,
  });

  if (!rule) return NextResponse.json({ updatableCount: 0, hasRule: false });

  const now = new Date();
  const where =
    alert.alertType === "COUNTY"
      ? {
          courtRuleUnmatched: true,
          startTime: { gte: now },
          OR: [
            { countyName: { equals: alert.county, mode: "insensitive" as const } },
            { caseRef: { county: { equals: alert.county, mode: "insensitive" as const } } },
          ],
        }
      : {
          courtRuleUnmatched: true,
          startTime: { gte: now },
          department: { equals: alert.department, mode: "insensitive" as const },
        };

  const updatableCount = await prisma.event.count({ where });
  return NextResponse.json({ updatableCount, hasRule: true });
}
