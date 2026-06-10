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

  const body = (await request.json()) as {
    state?: string;
    county: string;
    court?: string;
    department?: string;
    appearanceType?: string;
    remoteLink?: string;
    phoneNumber?: string;
    bridge?: string;
    password?: string;
    requestRequired?: boolean;
    requestContactEmail?: string;
    notes?: string;
  };

  if (!body.county?.trim()) return NextResponse.json({ error: "County is required" }, { status: 400 });

  const resolvedState = body.state?.trim().toUpperCase() || await resolveStateForCounty(body.county.trim()).then(s => s.toUpperCase());

  const req = await prisma.courtRuleRequest.create({
    data: {
      state: resolvedState,
      county: body.county.trim().toLowerCase(),
      court: body.court?.trim().toLowerCase() || null,
      department: body.department?.trim().toLowerCase() || null,
      appearanceType: body.appearanceType?.trim() || null,
      remoteLink: body.remoteLink?.trim() || null,
      phoneNumber: body.phoneNumber?.trim() || null,
      bridge: body.bridge?.trim() || null,
      password: body.password?.trim() || null,
      requestRequired: body.requestRequired ?? false,
      requestContactEmail: body.requestContactEmail?.trim() || null,
      notes: body.notes?.trim() || null,
      requestedById: user.id,
      workspaceId: workspace.id,
    },
  });

  return NextResponse.json({ ok: true, id: req.id });
}
