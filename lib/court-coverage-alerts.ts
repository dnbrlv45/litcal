import { prisma } from "@/lib/prisma";

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

export async function upsertCoverageAlert(opts: {
  state: string;
  countyName: string;
  courtName: string | null | undefined;
  department: string | null | undefined;
  workspaceId: string;
}): Promise<void> {
  const { state, countyName, courtName, department, workspaceId } = opts;

  const st = norm(state);
  const cn = norm(countyName);
  const ct = norm(courtName);
  const dp = norm(department);

  const countyRuleCount = await prisma.courtHearingRule.count({
    where: {
      state: { equals: st, mode: "insensitive" },
      countyName: { equals: cn, mode: "insensitive" },
      active: true,
    },
  });

  const alertType = countyRuleCount === 0 ? "COUNTY" : "DEPARTMENT";
  const alertCourt = alertType === "COUNTY" ? "" : ct;
  const alertDept  = alertType === "COUNTY" ? "" : dp;

  const existing = await prisma.courtCoverageAlert.findFirst({
    where: { state: st, county: cn, court: alertCourt, department: alertDept, alertType, resolved: false },
    select: { id: true },
  });
  if (existing) return;

  await prisma.courtCoverageAlert.create({
    data: { alertType, state: st, county: cn, court: alertCourt, department: alertDept, createdByWorkspaceId: workspaceId },
  });
}
