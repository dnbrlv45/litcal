import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { sendWorkspaceInviteEmail } from "@/lib/google-mail";
import { prisma } from "@/lib/prisma";
import { canManageWorkspace, getCurrentWorkspace } from "@/lib/workspaces";

function appUrl(request: NextRequest) {
  return process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
}

function userDisplayName(user: { email: string; firstName: string | null; lastName: string | null }) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email;
}

export async function GET(request: NextRequest) {
  const currentUser = await requireUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspace } = await getCurrentWorkspace(currentUser.id);
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 403 });

  const title = new URL(request.url).searchParams.get("title");

  const members = await prisma.workspaceMember.findMany({
    where: {
      workspaceId: workspace.id,
      ...(title ? { jobTitle: title as never } : {}),
    },
    include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ members });
}

export async function POST(request: NextRequest) {
  const currentUser = await requireUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = currentUser.id;

  const { workspace, membership } = await getCurrentWorkspace(userId);
  if (!workspace || !membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  if (!canManageWorkspace(membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json() as { email?: string; role?: string };
  const email = body.email?.trim().toLowerCase();
  const role = (["ADMIN", "MEMBER", "VIEWER"] as const).includes(body.role as never)
    ? (body.role as "ADMIN" | "MEMBER" | "VIEWER")
    : "MEMBER";

  if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const invitation = await prisma.workspaceInvitation.upsert({
      where: { workspaceId_email: { workspaceId: workspace.id, email } },
      create: {
        workspaceId: workspace.id,
        email,
        role,
        invitedBy: userId,
      },
      update: {
        role,
        invitedBy: userId,
        acceptedAt: null,
      },
    });

    let emailDelivery: { ok: boolean; reason: string; detail?: string } = {
      ok: false,
      reason: "not_attempted",
    };
    try {
      emailDelivery = await sendWorkspaceInviteEmail(userId, {
        inviterName: userDisplayName(currentUser),
        inviterEmail: currentUser.email,
        recipientEmail: email,
        workspaceName: workspace.name,
        inviteUrl: new URL(`/sign-in?invite=${invitation.id}`, appUrl(request)).toString(),
      });
    } catch (err) {
      emailDelivery = { ok: false, reason: "send_failed", detail: String(err) };
    }

    return NextResponse.json({ invitation, emailDelivery }, { status: 202 });
  }

  const existingMember = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
  });

  const member = existingMember
    ? await prisma.workspaceMember.update({
        where: { id: existingMember.id },
        data: existingMember.role === "OWNER" ? {} : { role },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      })
    : await prisma.workspaceMember.create({
        data: { workspaceId: workspace.id, userId: user.id, role },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

  let emailDelivery: { ok: boolean; reason: string; detail?: string } = {
    ok: false,
    reason: "not_attempted",
  };
  try {
    emailDelivery = await sendWorkspaceInviteEmail(userId, {
      inviterName: userDisplayName(currentUser),
      inviterEmail: currentUser.email,
      recipientEmail: user.email,
      workspaceName: workspace.name,
      inviteUrl: new URL("/", appUrl(request)).toString(),
    });
  } catch (err) {
    emailDelivery = { ok: false, reason: "send_failed", detail: String(err) };
  }

  return NextResponse.json({ member, emailDelivery }, { status: 201 });
}
