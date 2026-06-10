import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/admin/court-rule-requests
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isSuperAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const requests = await prisma.courtRuleRequest.findMany({
    orderBy: [{ reviewed: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      state: true,
      county: true,
      court: true,
      department: true,
      notes: true,
      reviewed: true,
      reviewedAt: true,
      createdAt: true,
      requestedBy: { select: { firstName: true, lastName: true, email: true } },
      workspace: { select: { name: true } },
    },
  });

  return NextResponse.json({ requests });
}
