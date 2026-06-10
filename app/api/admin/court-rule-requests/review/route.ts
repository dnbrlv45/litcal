import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/admin/court-rule-requests/review
// Body: { requestId: string }  — marks the request as reviewed
export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isSuperAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { requestId } = (await request.json()) as { requestId: string };
  if (!requestId) return NextResponse.json({ error: "Missing requestId" }, { status: 400 });

  await prisma.courtRuleRequest.update({
    where: { id: requestId },
    data: { reviewed: true, reviewedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
