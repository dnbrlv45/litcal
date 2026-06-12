import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace, canManageWorkspace } from "@/lib/workspaces";
import { buildXlsx } from "@/lib/excel";

export const dynamic = "force-dynamic";

const HEADERS = [
  "Plaintiff", "Defendant", "Case Type", "Case Number",
  "County", "Court", "Defense Firm", "Defense Attorney",
  "Date Filed", "Assigned Attorney", "Assigned Paralegal", "Assigned Assistant",
];
const COL_WIDTHS = [28, 28, 22, 16, 18, 28, 28, 24, 14, 24, 24, 24];

const CASE_TYPE_LABELS: Record<string, string> = {
  AUTO_ACCIDENT:       "Auto Accident",
  SLIP_AND_FALL:       "Slip and Fall",
  GOVERNMENT_CLAIM:    "Government Claim",
  DOG_BITE:            "Dog Bite",
  PREMISES_LIABILITY:  "Premises Liability",
  MEDICAL_MALPRACTICE: "Medical Malpractice",
  WRONGFUL_DEATH:      "Wrongful Death",
  PRODUCT_LIABILITY:   "Product Liability",
  OTHER:               "Other",
};

export async function GET(request: NextRequest) {
  const currentUser = await requireUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspace, membership } = await getCurrentWorkspace(currentUser.id);
  if (!workspace || !membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });

  const url = new URL(request.url);
  let requestedAttorneyId = url.searchParams.get("attorneyId") ?? null;
  const isAdmin = canManageWorkspace(membership.role);
  if (!isAdmin) requestedAttorneyId = currentUser.id;

  const cases = await prisma.case.findMany({
    where: {
      workspaceId: workspace.id,
      status: { in: ["ACTIVE", "PENDING"] },
      ...(requestedAttorneyId
        ? { staff: { some: { userId: requestedAttorneyId, role: "ATTORNEY" } } }
        : {}),
    },
    include: {
      parties: { select: { name: true, role: true } },
      staff:   { include: { user: { select: { firstName: true, lastName: true } } } },
    },
    orderBy: { title: "asc" },
  });

  const rows = cases.map((c) => {
    const plaintiffs = c.parties
      .filter((p) => p.role === "PLAINTIFF")
      .map((p) => p.name)
      .join("; ");

    const defendants = c.parties
      .filter((p) => p.role === "DEFENDANT")
      .map((p) => p.name)
      .join("; ") || c.defendant || "";

    const staffNames = (role: "ATTORNEY" | "PARALEGAL" | "ASSISTANT") =>
      c.staff
        .filter((s) => s.role === role)
        .map((s) => [s.user.firstName, s.user.lastName].filter(Boolean).join(" "))
        .join("; ");

    return {
      Plaintiff:            plaintiffs,
      Defendant:            defendants,
      "Case Type":          CASE_TYPE_LABELS[c.caseType] ?? c.caseType,
      "Case Number":        c.caseNumber ?? "",
      County:               c.county ?? "",
      Court:                c.court ?? "",
      "Defense Firm":       c.defenseFirm ?? "",
      "Defense Attorney":   c.defenseAttorney ?? "",
      "Date Filed":         c.filingDate
        ? c.filingDate.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric", timeZone: "UTC" })
        : "",
      "Assigned Attorney":  staffNames("ATTORNEY"),
      "Assigned Paralegal": staffNames("PARALEGAL"),
      "Assigned Assistant": staffNames("ASSISTANT"),
    };
  });

  const buffer = await buildXlsx("Open Cases", HEADERS, rows, COL_WIDTHS);

  const today = new Date().toISOString().slice(0, 10);
  let filename: string;

  if (requestedAttorneyId) {
    const attyStaff = cases[0]?.staff.find((s) => s.role === "ATTORNEY");
    const slug = attyStaff
      ? [attyStaff.user.firstName, attyStaff.user.lastName].filter(Boolean).join("-").toLowerCase()
      : requestedAttorneyId;
    filename = `litcal-open-cases-${slug}-${today}.xlsx`;
  } else {
    filename = `litcal-open-cases-${today}.xlsx`;
  }

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
