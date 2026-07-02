import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/admin/court-coverage/alerts
// Returns all CourtCoverageAlerts with future event counts.
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isSuperAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const alerts = await prisma.courtCoverageAlert.findMany({
    orderBy: [{ resolved: "asc" }, { firstSeenAt: "desc" }],
    select: {
      id: true,
      alertType: true,
      state: true,
      county: true,
      court: true,
      department: true,
      firstSeenAt: true,
      resolved: true,
      resolvedAt: true,
      createdByWorkspaceId: true,
    },
  });

  const now = new Date();

  // Count future unmatched events per alert
  const withCounts = await Promise.all(
    alerts.map(async (a) => {
      const where =
        a.alertType === "COUNTY"
          ? {
              courtRuleUnmatched: true,
              startTime: { gte: now },
              caseRef: { county: { equals: a.county, mode: "insensitive" as const } },
            }
          : {
              courtRuleUnmatched: true,
              startTime: { gte: now },
              department: { equals: a.department, mode: "insensitive" as const },
            };

      const futureEventCount = await prisma.event.count({ where });
      return { ...a, futureEventCount };
    })
  );

  return NextResponse.json({ alerts: withCounts });
}
