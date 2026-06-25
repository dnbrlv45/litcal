import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace, canManageWorkspace } from "@/lib/workspaces";
import { getEventDisplayName, formatCsvDate, formatCsvTime } from "@/lib/event-display";
import { buildXlsx, type CalendarDay } from "@/lib/excel";

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

  const startDate = new Date(`${start}T00:00:00.000Z`);
  const endDate   = new Date(`${end}T23:59:59.999Z`);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const tz = url.searchParams.get("tz") ?? "UTC";
  let requestedAttorneyId = url.searchParams.get("attorneyId") ?? null;
  const isAdmin = canManageWorkspace(membership.role);
  if (!isAdmin) requestedAttorneyId = null;

  const [events, tasks] = await Promise.all([
    prisma.event.findMany({
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
    }),
    prisma.task.findMany({
      where: {
        workspaceId: workspace.id,
        status: { not: "DONE" },
        dueDate: { gte: startDate, lte: endDate },
        ...(requestedAttorneyId
          ? { assignees: { some: { member: { userId: requestedAttorneyId } } } }
          : {}),
      },
      include: {
        caseRef: { select: { title: true } },
        assignees: {
          include: {
            member: {
              select: {
                user: { select: { firstName: true, lastName: true } },
              },
            },
          },
        },
      },
      orderBy: { dueDate: "asc" },
    }),
  ]);

  type CalItem = { date: Date; event: string; time: string; caseName: string; attorney: string };

  const eventItems: CalItem[] = events.map((ev) => ({
    date: ev.startTime,
    event: getEventDisplayName({
      title:                    ev.title,
      eventType:                ev.eventType,
      subtype:                  ev.subtype,
      subtypeReason:            ev.subtypeReason,
      generatedDeadlineRuleKey: ev.generatedDeadline?.ruleKey,
    }),
    time: formatCsvTime(ev.startTime, ev.allDay, tz),
    caseName: ev.caseRef?.title ?? "",
    attorney: ev.assignedAttorney
      ? [ev.assignedAttorney.firstName, ev.assignedAttorney.lastName].filter(Boolean).join(" ")
      : "",
  }));

  const taskItems: CalItem[] = tasks.map((t) => ({
    date: t.dueDate!,
    event: `Task: ${t.title}`,
    time: "Due",
    caseName: t.caseRef?.title ?? "",
    attorney: t.assignees
      .map((a) => [a.member.user.firstName, a.member.user.lastName].filter(Boolean).join(" "))
      .join(", "),
  }));

  const allItems = [...eventItems, ...taskItems].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );

  const rows = allItems.map((item) => ({
    Event: item.event,
    Date: formatCsvDate(item.date, tz),
    Time: item.time,
    "Case Name": item.caseName,
    Attorney: item.attorney,
  }));

  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const dayMap = new Map<number, CalItem[]>();
  for (const item of allItems) {
    const dow = new Date(item.date.toLocaleString("en-US", { timeZone: tz })).getDay();
    if (!dayMap.has(dow)) dayMap.set(dow, []);
    dayMap.get(dow)!.push(item);
  }

  const calendarDays: CalendarDay[] = [1, 2, 3, 4, 5, 6, 0].map((dow, i) => {
    const dayDate = new Date(startDate);
    dayDate.setUTCDate(startDate.getUTCDate() + i);
    const dayItems = dayMap.get(dow) ?? [];
    return {
      label: `${DAY_NAMES[dow]} ${dayDate.getUTCDate()}`,
      isWeekend: dow === 0 || dow === 6,
      events: dayItems.map((item) => ({
        event: item.event,
        time: item.time,
        caseName: item.caseName,
        attorney: item.attorney,
      })),
    };
  });

  const buffer = await buildXlsx("Events", HEADERS, rows, COL_WIDTHS, undefined, calendarDays);

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
