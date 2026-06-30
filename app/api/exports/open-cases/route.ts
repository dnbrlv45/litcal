import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace, canManageWorkspace } from "@/lib/workspaces";
import { buildXlsxWorkbook } from "@/lib/excel";

export const dynamic = "force-dynamic";

const HEADERS = [
  "Case Name",
  "Case Number",
  "Case Type",
  "Status",
  "County",
  "Court",
  "Defendant",
  "Defense Firm",
  "Defense Attorney",
  "Date Filed",
  "Date of Loss",
  "Served Date",
  "Assigned Attorney",
  "Assigned Paralegal",
];

const COL_WIDTHS = [42, 18, 20, 22, 20, 30, 28, 28, 24, 14, 14, 14, 24, 24];

const CASE_TYPE_LABELS: Record<string, string> = {
  AUTO_ACCIDENT: "Auto Accident",
  SLIP_AND_FALL: "Slip and Fall",
  GOVERNMENT_CLAIM: "Government Claim",
  DOG_BITE: "Dog Bite",
  PREMISES_LIABILITY: "Premises Liability",
  MEDICAL_MALPRACTICE: "Medical Malpractice",
  WRONGFUL_DEATH: "Wrongful Death",
  PRODUCT_LIABILITY: "Product Liability",
  UIM_ARBITRATION: "UIM Arbitration",
  OTHER: "Other",
};

const STATUS_ROW_COLORS: Record<string, string> = {
  ACTIVE: "E2EFDA",
  DISCOVERY: "D9E2F3",
  SERVED: "E2F0D9",
  ARBITRATION: "DAEAF6",
  UIM_ARBITRATION: "DAEAF6",
  UM_ARBITRATION: "DAEAF6",
  PENDING: "FFF2CC",
  PENDING_SERVICE: "FCE4D6",
  SENT_FOR_SERVICE: "FCE4D6",
  PARTIALLY_SERVED: "FFF2CC",
  SERVICE_POSTPONED: "FFF2CC",
  PENDING_RFD: "FFF2CC",
  SETTLED: "EDEDED",
  CLOSED: "F2F2F2",
  DISBURSEMENT: "E8E0F0",
  LIEN_NEGOTIATIONS: "E8E0F0",
  DISMISSAL_FILED: "F2F2F2",
  ARCHIVED: "DCDCDC",
};

const OPEN_STATUSES = [
  "ACTIVE", "DISCOVERY", "SERVED",
  "ARBITRATION", "UIM_ARBITRATION", "UM_ARBITRATION",
  "PENDING", "PENDING_SERVICE", "SENT_FOR_SERVICE",
  "PARTIALLY_SERVED", "SERVICE_POSTPONED", "PENDING_RFD",
];

const CLOSED_STATUSES = [
  "SETTLED", "CLOSED", "DISBURSEMENT",
  "LIEN_NEGOTIATIONS", "DISMISSAL_FILED", "ARCHIVED",
];

function fmtDate(d: Date | null) {
  if (!d) return "";
  return d.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function statusLabel(s: string) {
  return s.replace(/_/g, " ");
}

export async function GET(request: NextRequest) {
  const currentUser = await requireUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspace, membership } = await getCurrentWorkspace(currentUser.id);
  if (!workspace || !membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });

  const url = new URL(request.url);
  let requestedAttorneyId = url.searchParams.get("attorneyId") ?? null;
  const isAdmin = canManageWorkspace(membership.role);
  if (!isAdmin) requestedAttorneyId = null;

  const cases = await prisma.case.findMany({
    where: {
      workspaceId: workspace.id,
      ...(requestedAttorneyId
        ? { staff: { some: { userId: requestedAttorneyId, role: "ATTORNEY" } } }
        : {}),
    },
    include: {
      parties: { select: { name: true, role: true } },
      staff: { include: { user: { select: { firstName: true, lastName: true } } } },
    },
    orderBy: { title: "asc" },
  });

  function buildRow(c: typeof cases[number]) {
    const staffNames = (role: "ATTORNEY" | "PARALEGAL" | "ASSISTANT") =>
      c.staff
        .filter((s) => s.role === role)
        .map((s) => [s.user.firstName, s.user.lastName].filter(Boolean).join(" "))
        .join("; ");

    return {
      "Case Name": c.title,
      "Case Number": c.caseNumber ?? "",
      "Case Type": CASE_TYPE_LABELS[c.caseType] ?? c.caseType,
      Status: statusLabel(c.status),
      County: c.county ?? "",
      Court: c.court ?? "",
      Defendant: c.defendant ?? "",
      "Defense Firm": c.defenseFirm ?? "",
      "Defense Attorney": c.defenseAttorney ?? "",
      "Date Filed": fmtDate(c.filingDate),
      "Date of Loss": fmtDate(c.dateOfLoss),
      "Served Date": fmtDate(c.servedDate),
      "Assigned Attorney": staffNames("ATTORNEY"),
      "Assigned Paralegal": staffNames("PARALEGAL"),
      _status: c.status,
    };
  }

  const openCases = cases.filter((c) => OPEN_STATUSES.includes(c.status));
  const closedCases = cases.filter((c) => CLOSED_STATUSES.includes(c.status));

  const sheetConfig = {
    headers: HEADERS,
    colWidths: COL_WIDTHS,
    rowHeight: 20,
    wrapText: true,
    rowBgColor: (row: Record<string, string | null | undefined>) =>
      STATUS_ROW_COLORS[row["_status"] ?? ""] ?? null,
  };

  const buffer = await buildXlsxWorkbook([
    {
      name: "Open Cases",
      rows: openCases.map(buildRow),
      ...sheetConfig,
    },
    {
      name: "Closed Cases",
      rows: closedCases.map(buildRow),
      ...sheetConfig,
    },
  ]);

  const today = new Date().toISOString().slice(0, 10);
  let filename: string;

  if (requestedAttorneyId) {
    const attyStaff = cases[0]?.staff.find((s) => s.role === "ATTORNEY");
    const slug = attyStaff
      ? [attyStaff.user.firstName, attyStaff.user.lastName].filter(Boolean).join("-").toLowerCase()
      : requestedAttorneyId;
    filename = `litcal-cases-${slug}-${today}.xlsx`;
  } else {
    filename = `litcal-cases-${today}.xlsx`;
  }

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
