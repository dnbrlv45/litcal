import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findCourtHearingRule } from "@/lib/court-hearing-rules";
import { backfillEventsForCourtRule } from "@/lib/court-rule-event-backfill";

// POST /api/admin/court-coverage/resolve
// Body: { alertId: string; updateEvents: boolean }
// Marks the alert resolved and optionally updates matching future events.
export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isSuperAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { alertId, updateEvents } = (await request.json()) as {
    alertId: string;
    updateEvents: boolean;
  };

  const alert = await prisma.courtCoverageAlert.findUnique({ where: { id: alertId } });
  if (!alert) return NextResponse.json({ error: "Alert not found" }, { status: 404 });
  if (alert.resolved) return NextResponse.json({ error: "Already resolved" }, { status: 409 });

  let eventsUpdated = 0;
  let googleEventsPatched = 0;
  let googlePatchFailures = 0;

  if (updateEvents) {
    const rule = await findCourtHearingRule({
      state: alert.state,
      countyName: alert.county,
      courtName: alert.court || null,
      department: alert.department || null,
    });

    if (rule) {
      const fullRule = await prisma.courtHearingRule.findUnique({ where: { id: rule.id } });
      if (!fullRule) return NextResponse.json({ error: "Rule not found" }, { status: 404 });

      const result = await backfillEventsForCourtRule(fullRule, { unmatchedOnly: true });
      eventsUpdated = result.eventsUpdated;
      googleEventsPatched = result.googleEventsPatched;
      googlePatchFailures = result.googlePatchFailures;
    }
  }

  await prisma.courtCoverageAlert.update({
    where: { id: alertId },
    data: { resolved: true, resolvedAt: new Date() },
  });

  return NextResponse.json({ ok: true, eventsUpdated, googleEventsPatched, googlePatchFailures });
}
