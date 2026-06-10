import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getCurrentWorkspace } from "@/lib/workspaces";
import { prisma } from "@/lib/prisma";
import { resolveStateForCounty } from "@/lib/court-hearing-rules";

// POST /api/court-rule-requests
export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspace } = await getCurrentWorkspace(user.id);
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 403 });

  const { county, court, department, notes } = (await request.json()) as {
    county: string;
    court?: string;
    department?: string;
    notes?: string;
  };

  if (!county?.trim()) return NextResponse.json({ error: "County is required" }, { status: 400 });

  const state = await resolveStateForCounty(county.trim());

  const req = await prisma.courtRuleRequest.create({
    data: {
      state,
      county: county.trim().toLowerCase(),
      court: court?.trim().toLowerCase() || null,
      department: department?.trim().toLowerCase() || null,
      notes: notes?.trim() || null,
      requestedById: user.id,
      workspaceId: workspace.id,
    },
  });

  return NextResponse.json({ ok: true, id: req.id });
}
