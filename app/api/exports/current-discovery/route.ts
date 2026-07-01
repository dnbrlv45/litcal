import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspaces";
import { buildXlsxWorkbook } from "@/lib/excel";
import { formatCsvDate } from "@/lib/event-display";
import {
  DISCOVERY_STATUS_LABELS,
} from "@/lib/discovery-constants";

export const dynamic = "force-dynamic";

const HEADERS = [
  "Due Date",
  "Case Name",
  "Case Number",
  "Assigned To",
  "Served/Received",
  "Status",
  "Progress",
  "Notes",
];

const COL_WIDTHS = [14, 52, 18, 22, 18, 20, 22, 46];

const PROGRESS_LABELS: Record<string, string> = {
  NOT_STARTED: "Not Started",
  QUESTIONNAIRE_SENT: "Questionnaire Sent",
  IN_PROGRESS: "In Progress",
};

const ROW_COLORS: Record<string, string> = {
  OVERDUE:  "FEE2E2",
  EXTENDED: "FEF3C7",
  CURRENT:  "ECFDF5",
};

export async function GET(request: NextRequest) {
  const currentUser = await requireUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspace, membership } = await getCurrentWorkspace(currentUser.id);
  if (!workspace || !membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });

  const url = new URL(request.url);
  const endParam = url.searchParams.get("end");
  const endDate = endParam ? new Date(`${endParam}T23:59:59.999Z`) : daysFromNow(90);
  if (isNaN(endDate.getTime())) return NextResponse.json({ error: "Invalid end date" }, { status: 400 });

  const requestedAttorneyId = url.searchParams.get("attorneyId") ?? null;

  const items = await prisma.discoveryItem.findMany({
    where: {
      workspaceId: workspace.id,
      status: { notIn: ["COMPLETED", "RESPONSES_RECEIVED"] },
      currentDueDate: { lte: endDate },
      caseRef: {
        status: { in: ["ACTIVE", "PENDING", "DISCOVERY", "SERVED", "ARBITRATION", "UIM_ARBITRATION", "UM_ARBITRATION", "PENDING_SERVICE", "SENT_FOR_SERVICE", "PARTIALLY_SERVED", "SERVICE_POSTPONED", "PENDING_RFD"] },
        ...(requestedAttorneyId
          ? { staff: { some: { userId: requestedAttorneyId, role: "ATTORNEY" } } }
          : {}),
      },
    },
    include: {
      caseRef: {
        select: { title: true, caseNumber: true },
      },
      assignedTo: {
        select: { firstName: true, lastName: true },
      },
    },
    orderBy: { currentDueDate: "asc" },
  });

  const now = new Date();
  const rows = items.map((item) => {
    const rowStatus = item.currentDueDate < startOfToday(now)
      ? "OVERDUE"
      : item.status === "EXTENSION_GRANTED"
        ? "EXTENDED"
        : "CURRENT";

    const assigneeName = item.assignedTo
      ? [item.assignedTo.firstName, item.assignedTo.lastName].filter(Boolean).join(" ")
      : "";

    return {
      "Due Date": formatCsvDate(item.currentDueDate),
      "Case Name": item.caseRef.title,
      "Case Number": item.caseRef.caseNumber ?? "",
      "Assigned To": assigneeName,
      "Served/Received": formatCsvDate(item.servedOrReceivedDate),
      Status: DISCOVERY_STATUS_LABELS[item.status] ?? item.status,
      Progress: PROGRESS_LABELS[item.progressStatus] ?? item.progressStatus,
      Notes: item.notes ?? "",
      _rowStatus: rowStatus,
      _direction: item.direction,
    };
  });

  const sheetConfig = {
    headers: HEADERS,
    colWidths: COL_WIDTHS,
    rowHeight: 22,
    wrapText: true,
    rowBgColor: (row: Record<string, string | null | undefined>) =>
      ROW_COLORS[row["_rowStatus"] ?? ""] ?? null,
  };

  const buffer = await buildXlsxWorkbook([
    {
      name: "Received - Our Due",
      rows: rows.filter((row) => row["_direction"] === "RECEIVED"),
      ...sheetConfig,
    },
    {
      name: "Sent - Opposing Due",
      rows: rows.filter((row) => row["_direction"] === "SERVED"),
      ...sheetConfig,
    },
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const through = endDate.toISOString().slice(0, 10);
  const filename = `litcal-current-discovery-${today}-through-${through}.xlsx`;

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function daysFromNow(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

function startOfToday(now: Date) {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
