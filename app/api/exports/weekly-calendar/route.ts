import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace, canManageWorkspace } from "@/lib/workspaces";
import { getEventDisplayName, formatCsvDate, formatCsvTime, buildCsv } from "@/lib/event-display";

export const dynamic = "force-dynamic";

const HEADERS = ["Event", "Date", "Time", "Case Name", "Attorney"];

export async function GET(request: NextRequest) {
  const currentUser = await requireUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspace, membership } = await getCurrentWorkspace(currentUser.id);
  if (!workspace || !membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });

  const url = new URL(request.url);
  const start = url.searchParams.get("start");
  const end   = url.searchParams.get("end");
  if (!start || !end) return NextResponse.json({ error: "start and end are required" }, { status: 400 });

  const startDate = new Date(start);
  const endDate   = new Date(end);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  // Permission: non-admins can only export their own data
  let requestedAttorneyId = url.searchParams.get("attorneyId") ?? null;
  const isAdmin = canManageWorkspace(membership.role);
  if (!isAdmin) requestedAttorneyId = currentUser.id;

  const events = await prisma.event.findMany({
    where: {
      workspaceId: workspace.id,
      status: { not: "CANCELLED" },
      startTime: { gte: startDate, lte: endDate },
      ...(requestedAttorneyId ? { assignedAttorneyId: requestedAttorneyId } : {}),
    },
    include: {
      assignedAttorney: { select: { firstName: true, lastName: true } },
      caseRef:          { select: { title: true } },
      generatedDeadline: { select: { ruleKey: true } },
    },
    orderBy: { startTime: "asc" },
  });

  const rows = events.map((ev) => {
    const displayName = getEventDisplayName({
      title:                    ev.title,
      eventType:                ev.eventType,
      subtype:                  ev.subtype,
      subtypeReason:            ev.subtypeReason,
      generatedDeadlineRuleKey: ev.generatedDeadline?.ruleKey,
    });

    const attorney = ev.assignedAttorney
      ? [ev.assignedAttorney.firstName, ev.assignedAttorney.lastName].filter(Boolean).join(" ")
      : null;

    return {
      Event:     displayName,
      Date:      formatCsvDate(ev.startTime),
      Time:      formatCsvTime(ev.startTime, ev.allDay),
      "Case Name": ev.caseRef?.title ?? "",
      Attorney:  attorney ?? "",
    };
  });

  const csv = buildCsv(HEADERS, rows);

  // Build filename
  const s = startDate.toISOString().slice(0, 10);
  const e = endDate.toISOString().slice(0, 10);
  let filename: string;
  if (requestedAttorneyId && isAdmin) {
    const atty = events.find((ev) => ev.assignedAttorney)?.assignedAttorney;
    const attySlug = atty
      ? [atty.firstName, atty.lastName].filter(Boolean).join("-").toLowerCase().replace(/\s+/g, "-")
      : requestedAttorneyId;
    filename = `litcal-weekly-calendar-${attySlug}-${s}-to-${e}.csv`;
  } else if (!isAdmin) {
    const me = await prisma.user.findUnique({ where: { id: currentUser.id }, select: { firstName: true, lastName: true } });
    const slug = me ? [me.firstName, me.lastName].filter(Boolean).join("-").toLowerCase() : currentUser.id;
    filename = `litcal-weekly-calendar-${slug}-${s}-to-${e}.csv`;
  } else {
    filename = `litcal-weekly-calendar-${s}-to-${e}.csv`;
  }

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
