import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getCurrentWorkspace, canManageWorkspace } from "@/lib/workspaces";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const user = await requireUser();
  if (!user) return { user: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { membership } = await getCurrentWorkspace(user.id);
  if (!membership || !canManageWorkspace(membership.role))
    return { user: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { user, error: null };
}

// PATCH /api/court-hearing-rules/manage/[id]
// Edit a rule or toggle active status.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const body = await request.json() as {
    appearanceType?: string;
    phoneNumber?: string;
    bridge?: string;
    password?: string;
    remoteLink?: string;
    requestRequired?: boolean;
    active?: boolean;
  };

  const existing = await prisma.courtHearingRule.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rule = await prisma.courtHearingRule.update({
    where: { id },
    data: {
      appearanceType: "appearanceType" in body ? (body.appearanceType?.trim() || null) : undefined,
      phoneNumber:    "phoneNumber"    in body ? (body.phoneNumber?.trim()    || null) : undefined,
      bridge:         "bridge"         in body ? (body.bridge?.trim()         || null) : undefined,
      password:       "password"       in body ? (body.password?.trim()       || null) : undefined,
      remoteLink:     "remoteLink"     in body ? (body.remoteLink?.trim()     || null) : undefined,
      requestRequired: "requestRequired" in body ? body.requestRequired : undefined,
      active:          "active"          in body ? body.active          : undefined,
    },
  });

  return NextResponse.json({ rule });
}
