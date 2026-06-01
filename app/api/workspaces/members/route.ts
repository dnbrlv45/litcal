import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canManageWorkspace, getCurrentWorkspace } from "@/lib/workspaces";

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspace, membership } = await getCurrentWorkspace(userId);
  if (!canManageWorkspace(membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json() as { email?: string; role?: string };
  const email = body.email?.trim().toLowerCase();
  const role = body.role === "ADMIN" ? "ADMIN" : "MEMBER";

  if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json(
      { error: "That person needs to sign in to LitCal once before you can add them to a team." },
      { status: 404 }
    );
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

  return NextResponse.json({ member }, { status: 201 });
}
