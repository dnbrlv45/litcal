import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace, canManageWorkspace } from "@/lib/workspaces";
import { buildXlsx } from "@/lib/excel";
import { formatCsvDate } from "@/lib/event-display";
import {
  DISCOVERY_DIRECTION_LABELS,
  DISCOVERY_STATUS_LABELS,
  DISCOVERY_TYPE_LABELS,
} from "@/lib/discovery-constants";

export const dynamic = "force-dynamic";

const HEADERS = [
  "Due Date",
  "Status",
  "Discovery Type",
  "Direction",
  "Case Name",
  "Case Number",
  "Plaintiff",
  "Defendant",
  "County",
  "Court",
  "Assigned Attorney",
  "Assigned Paralegal",
  "Served/Received",
  "Original Due",
  "Extensions",
  "Notes",
];

const COL_WIDTHS = [14, 20, 30, 26, 32, 16, 24, 24, 18, 28, 24, 24, 16, 16, 12, 36];

const ROW_COLORS: Record<string, string> = {
  OVERDUE:  "FEE2E2",
  EXTENDED: "FEF3C7",
  CURRENT:  "ECFDF5",
};

type StaffRole = "ATTORNEY" | "PARALEGAL" | "ASSISTANT";

export async function GET(request: NextRequest) {
  const currentUser = await requireUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspace, membership } = await getCurrentWorkspace(currentUser.id);
  if (!workspace || !membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });

  const url = new URL(request.url);
  const endParam = url.searchParams.get("end");
  const endDate = endParam ? new Date(`${endParam}T23:59:59.999Z`) : daysFromNow(90);
  if (isNaN(endDate.getTime())) return NextResponse.json({ error: "Invalid end date" }, { status: 400 });

  let requestedAttorneyId = url.searchParams.get("attorneyId") ?? null;
  const isAdmin = canManageWorkspace(membership.role);
  if (!isAdmin) requestedAttorneyId = null;

  const items = await prisma.discoveryItem.findMany({
    where: {
      workspaceId: workspace.id,
      status: { notIn: ["COMPLETED", "RESPONSES_RECEIVED"] },
      currentDueDate: { lte: endDate },
      caseRef: {
        status: { in: ["ACTIVE", "PENDING"] },
        ...(requestedAttorneyId
          ? { staff: { some: { userId: requestedAttorneyId, role: "ATTORNEY" } } }
          : !isAdmin
            ? { staff: { some: { userId: currentUser.id } } }
            : {}),
      },
    },
    include: {
      extensions: { select: { id: true } },
      caseRef: {
        include: {
          parties: { select: { name: true, role: true } },
          staff: { include: { user: { select: { firstName: true, lastName: true } } } },
        },
      },
    },
    orderBy: { currentDueDate: "asc" },
  });

  const now = new Date();
  const rows = items.map((item) => {
    const c = item.caseRef;
    const plaintiffs = c.parties.filter((p) => p.role === "PLAINTIFF").map((p) => p.name).join("; ");
    const defendants = c.parties.filter((p) => p.role === "DEFENDANT").map((p) => p.name).join("; ") || c.defendant || "";
    const rowStatus = item.currentDueDate < startOfToday(now)
      ? "OVERDUE"
      : item.status === "EXTENSION_GRANTED"
        ? "EXTENDED"
        : "CURRENT";

    return {
      "Due Date": formatCsvDate(item.currentDueDate),
      Status: DISCOVERY_STATUS_LABELS[item.status] ?? item.status,
      "Discovery Type": DISCOVERY_TYPE_LABELS[item.discoveryType] ?? item.discoveryType,
      Direction: DISCOVERY_DIRECTION_LABELS[item.direction] ?? item.direction,
      "Case Name": c.title,
      "Case Number": c.caseNumber ?? "",
      Plaintiff: plaintiffs,
      Defendant: defendants,
      County: c.county ?? "",
      Court: c.court ?? "",
      "Assigned Attorney": staffNames(c.staff, "ATTORNEY"),
      "Assigned Paralegal": staffNames(c.staff, "PARALEGAL"),
      "Served/Received": formatCsvDate(item.servedOrReceivedDate),
      "Original Due": formatCsvDate(item.originalDueDate),
      Extensions: String(item.extensions.length),
      Notes: item.notes ?? "",
      _rowStatus: rowStatus,
    };
  });

  const buffer = await buildXlsx(
    "Current Discovery Due",
    HEADERS,
    rows,
    COL_WIDTHS,
    (row) => ROW_COLORS[row["_rowStatus"] ?? ""] ?? null
  );

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

function staffNames(staff: { role: StaffRole; user: { firstName: string | null; lastName: string | null } }[], role: StaffRole) {
  return staff
    .filter((s) => s.role === role)
    .map((s) => [s.user.firstName, s.user.lastName].filter(Boolean).join(" "))
    .filter(Boolean)
    .join("; ");
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
