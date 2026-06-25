import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace, canManageWorkspace } from "@/lib/workspaces";
import { buildXlsx } from "@/lib/excel";
import { formatCsvDate, formatCsvTime } from "@/lib/event-display";

export const dynamic = "force-dynamic";

const HEADERS = [
  "Trial Date",
  "Time",
  "Title",
  "Case Name",
  "Case Number",
  "County",
  "Court",
  "Department",
  "Assigned Attorney",
  "Location",
  "Related Deadlines",
  "Notes",
];

const COL_WIDTHS = [14, 12, 30, 32, 16, 18, 28, 18, 24, 30, 44, 36];

type StaffRole = "ATTORNEY" | "PARALEGAL" | "ASSISTANT";

export async function GET(request: NextRequest) {
  const currentUser = await requireUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspace, membership } = await getCurrentWorkspace(currentUser.id);
  if (!workspace || !membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });

  const url = new URL(request.url);
  const startParam = url.searchParams.get("start");
  const endParam = url.searchParams.get("end");
  const startDate = startParam ? new Date(`${startParam}T00:00:00.000Z`) : startOfToday();
  const endDate = endParam ? new Date(`${endParam}T23:59:59.999Z`) : daysFromNow(180);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  let requestedAttorneyId = url.searchParams.get("attorneyId") ?? null;
  const isAdmin = canManageWorkspace(membership.role);
  if (!isAdmin) requestedAttorneyId = null;

  const trials = await prisma.event.findMany({
    where: {
      workspaceId: workspace.id,
      eventType: "TRIAL",
      status: { not: "CANCELLED" },
      startTime: { gte: startDate, lte: endDate },
      caseRef: {
        status: { in: ["ACTIVE", "PENDING"] },
        ...(requestedAttorneyId
          ? { staff: { some: { userId: requestedAttorneyId, role: "ATTORNEY" } } }
          : {}),
      },
    },
    include: {
      assignedAttorney: { select: { firstName: true, lastName: true } },
      departmentRef: { select: { name: true } },
      caseRef: {
        include: {
          staff: { include: { user: { select: { firstName: true, lastName: true } } } },
        },
      },
      triggeredDeadlines: {
        include: {
          generatedEvent: { select: { title: true, startTime: true, status: true } },
          generatedTask: { select: { title: true, dueDate: true, status: true } },
        },
      },
    },
    orderBy: { startTime: "asc" },
  });

  const rows = trials.map((trial) => {
    const related = trial.triggeredDeadlines.flatMap((deadline) => {
      const parts: string[] = [];
      if (deadline.generatedEvent) {
        parts.push(`${deadline.generatedEvent.title} (${formatCsvDate(deadline.generatedEvent.startTime)} - ${deadline.generatedEvent.status})`);
      }
      if (deadline.generatedTask?.dueDate) {
        parts.push(`${deadline.generatedTask.title} (${formatCsvDate(deadline.generatedTask.dueDate)} - ${deadline.generatedTask.status})`);
      }
      return parts;
    });

    return {
      "Trial Date": formatCsvDate(trial.startTime),
      Time: formatCsvTime(trial.startTime, trial.allDay),
      Title: trial.title,
      "Case Name": trial.caseRef?.title ?? "",
      "Case Number": trial.caseRef?.caseNumber ?? "",
      County: trial.caseRef?.county ?? "",
      Court: trial.caseRef?.court ?? "",
      Department: trial.departmentRef?.name ?? trial.department ?? "",
      "Assigned Attorney": assignedAttorneyName(trial),
      Location: trial.location ?? "",
      "Related Deadlines": related.join("; "),
      Notes: trial.description ?? "",
    };
  });

  const buffer = await buildXlsx("Trial Dates", HEADERS, rows, COL_WIDTHS);

  const s = startDate.toISOString().slice(0, 10);
  const e = endDate.toISOString().slice(0, 10);
  const filename = `litcal-trial-dates-${s}-to-${e}.xlsx`;

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function assignedAttorneyName(trial: {
  assignedAttorney: { firstName: string | null; lastName: string | null } | null;
  caseRef: { staff: { role: StaffRole; user: { firstName: string | null; lastName: string | null } }[] } | null;
}) {
  const direct = trial.assignedAttorney
    ? [trial.assignedAttorney.firstName, trial.assignedAttorney.lastName].filter(Boolean).join(" ")
    : "";
  if (direct) return direct;

  return (trial.caseRef?.staff ?? [])
    .filter((s) => s.role === "ATTORNEY")
    .map((s) => [s.user.firstName, s.user.lastName].filter(Boolean).join(" "))
    .filter(Boolean)
    .join("; ");
}

function startOfToday() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function daysFromNow(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}
