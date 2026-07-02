import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { canEdit, getCurrentWorkspace } from "@/lib/workspaces";
import { prisma } from "@/lib/prisma";
import { resolveStateForCounty } from "@/lib/court-hearing-rules";
import { sendLitCalEmail } from "@/lib/google-mail";

// POST /api/court-rule-requests
export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspace, membership } = await getCurrentWorkspace(user.id);
  if (!workspace || !membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  if (!canEdit(membership.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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

  await notifySuperAdmins(req.id, req.county, req.court, req.department, user);

  return NextResponse.json({ ok: true, id: req.id });
}

async function notifySuperAdmins(
  requestId: string,
  county: string,
  court: string | null,
  department: string | null,
  requestedBy: { firstName: string | null; lastName: string | null; email: string },
) {
  try {
    const superAdmins = await prisma.user.findMany({
      where: { isSuperAdmin: true },
      select: { email: true },
    });
    if (superAdmins.length === 0) return;

    const requesterName = [requestedBy.firstName, requestedBy.lastName].filter(Boolean).join(" ") || requestedBy.email;
    const scope = [county, court, department].filter(Boolean).join(" / ");
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://litcal.vercel.app";
    const reviewUrl = new URL("/admin/court-coverage", baseUrl).toString();

    const subject = `New court rule request: ${scope}`;
    const text = `${requesterName} submitted a new court remote appearance rule request for ${scope}.\n\nReview it at: ${reviewUrl}\n\nRequest ID: ${requestId}`;
    const html = `<p>${requesterName} submitted a new court remote appearance rule request for <strong>${scope}</strong>.</p><p><a href="${reviewUrl}">Review the request</a></p>`;

    await Promise.all(
      superAdmins.map((admin) =>
        sendLitCalEmail({ recipientEmail: admin.email, subject, text, html }).catch(() => null)
      )
    );
  } catch (err) {
    console.error("Failed to notify super admins of new court rule request:", err);
  }
}
