import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace, canManageWorkspace } from "@/lib/workspaces";
import { getEventDisplayName, formatCsvDate, formatCsvTime } from "@/lib/event-display";
import { buildXlsx } from "@/lib/excel";

export const dynamic = "force-dynamic";

const HEADERS = ["Event", "Date", "Time", "Case Name", "Attorney"];
const COL_WIDTHS = [36, 14, 12, 32, 24];

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

  const tz = url.searchParams.get("tz") ?? "UTC";
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
      assignedAttorney:  { select: { firstName: true, lastName: true } },
      caseRef:           { select: { title: true } },
      generatedDeadline: { select: { ruleKey: true } },
    },
    orderBy: { startTime: "asc" },
  });

  const rows = events.map((ev) => ({
    Event: getEventDisplayName({
      title:                    ev.title,
      eventType:                ev.eventType,
      subtype:                  ev.subtype,
      subtypeReason:            ev.subtypeReason,
      generatedDeadlineRuleKey: ev.generatedDeadline?.ruleKey,
    }),
    Date:        formatCsvDate(ev.startTime, tz),
    Time:        formatCsvTime(ev.startTime, ev.allDay, tz),
    "Case Name": ev.caseRef?.title ?? "",
    Attorney:    ev.assignedAttorney
      ? [ev.assignedAttorney.firstName, ev.assignedAttorney.lastName].filter(Boolean).join(" ")
      : "",
  }));

  const buffer = await buildXlsx("Weekly Calendar", HEADERS, rows, COL_WIDTHS);

  const s = startDate.toISOString().slice(0, 10);
  const e = endDate.toISOString().slice(0, 10);
  let filename: string;

  if (requestedAttorneyId) {
    const atty = events.find((ev) => ev.assignedAttorney)?.assignedAttorney;
    const slug = atty
      ? [atty.firstName, atty.lastName].filter(Boolean).join("-").toLowerCase()
      : requestedAttorneyId;
    filename = `litcal-weekly-calendar-${slug}-${s}-to-${e}.xlsx`;
  } else {
    filename = `litcal-weekly-calendar-${s}-to-${e}.xlsx`;
  }

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
