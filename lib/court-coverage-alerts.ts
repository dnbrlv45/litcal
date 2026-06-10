import { prisma } from "@/lib/prisma";

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

/**
 * After findCourtHearingRule returns null, determine alert type and upsert
 * a CourtCoverageAlert if one doesn't already exist (unresolved).
 */
export async function upsertCoverageAlert(opts: {
  countyName: string;
  courtName: string | null | undefined;
  department: string | null | undefined;
  workspaceId: string;
}): Promise<void> {
  const { countyName, courtName, department, workspaceId } = opts;

  const cn = norm(countyName);
  const ct = norm(courtName);
  const dp = norm(department);

  // Does this county have any active rules at all?
  const countyRuleCount = await prisma.courtHearingRule.count({
    where: { countyName: { equals: cn, mode: "insensitive" }, active: true },
  });

  const alertType = countyRuleCount === 0 ? "COUNTY" : "DEPARTMENT";

  // For COUNTY alerts, court and department are irrelevant — store as "".
  const alertCourt = alertType === "COUNTY" ? "" : ct;
  const alertDept  = alertType === "COUNTY" ? "" : dp;

  // Skip if an unresolved alert already exists for this combo.
  const existing = await prisma.courtCoverageAlert.findFirst({
    where: {
      county: cn,
      court: alertCourt,
      department: alertDept,
      alertType,
      resolved: false,
    },
    select: { id: true },
  });
  if (existing) return;

  await prisma.courtCoverageAlert.create({
    data: {
      alertType,
      county: cn,
      court: alertCourt,
      department: alertDept,
      createdByWorkspaceId: workspaceId,
    },
  });
}
