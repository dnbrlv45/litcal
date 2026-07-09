import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  backfillEventsForCourtRule,
  buildCourtRuleEventWhere,
} from "@/lib/court-rule-event-backfill";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const user = await requireUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!user.isSuperAdmin) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { error: null };
}

// GET /api/court-hearing-rules/manage/[id]/backfill
// Returns how many future remote hearings would be updated by this rule.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const rule = await prisma.courtHearingRule.findUnique({ where: { id } });
  if (!rule) return NextResponse.json({ error: "Rule not found" }, { status: 404 });

  const eventCount = await prisma.event.count({
    where: buildCourtRuleEventWhere(rule),
  });

  return NextResponse.json({ eventCount });
}

// POST /api/court-hearing-rules/manage/[id]/backfill
// Reapplies this rule to matching future remote hearings and synced calendars.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const rule = await prisma.courtHearingRule.findUnique({ where: { id } });
  if (!rule) return NextResponse.json({ error: "Rule not found" }, { status: 404 });
  if (!rule.active) return NextResponse.json({ error: "Cannot backfill an inactive rule." }, { status: 409 });

  const result = await backfillEventsForCourtRule(rule);
  return NextResponse.json({ ok: true, ...result });
}
