import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace, canEdit, canDelete } from "@/lib/workspaces";
import { markDiscoveryResponsesReceived } from "@/lib/discovery";
import { getAccessToken, deleteGoogleEvent } from "@/lib/google-calendar";

type Params = { params: Promise<{ id: string; discoveryId: string }> };

// GET /api/cases/[id]/discovery/[discoveryId]
export async function GET(_req: NextRequest, { params }: Params) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspace } = await getCurrentWorkspace(user.id);
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 403 });

  const { discoveryId } = await params;

  const item = await prisma.discoveryItem.findFirst({
    where: { id: discoveryId, workspace: { id: workspace.id } },
    include: { extensions: { orderBy: { extensionNumber: "asc" } } },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ item });
}

// PATCH /api/cases/[id]/discovery/[discoveryId]
// Supports: mark as responses_received, update notes
export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspace, membership } = await getCurrentWorkspace(user.id);
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  if (!canEdit(membership?.role ?? "")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { discoveryId } = await params;

  const item = await prisma.discoveryItem.findFirst({
    where: { id: discoveryId, workspaceId: workspace.id },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json() as {
    action?: string;
    notes?: string;
    assignedToId?: string | null;
    externalAssignee?: string | null;
    progressStatus?: string;
  };

  if (body.action === "responses_received") {
    await markDiscoveryResponsesReceived(discoveryId, user.id);
  } else {
    const data: Record<string, unknown> = {};
    if (body.notes !== undefined) data.notes = body.notes;
    // assignedToId (a LitCal user) and externalAssignee (off-system name) are
    // mutually exclusive — setting either clears the other.
    if (body.assignedToId !== undefined) {
      data.assignedToId = body.assignedToId || null;
      if (body.assignedToId) data.externalAssignee = null;
    }
    if (body.externalAssignee !== undefined) {
      data.externalAssignee = body.externalAssignee || null;
      if (body.externalAssignee) data.assignedToId = null;
    }
    if (body.progressStatus !== undefined) data.progressStatus = body.progressStatus;
    if (Object.keys(data).length > 0) {
      await prisma.discoveryItem.update({ where: { id: discoveryId }, data });
    }
  }

  const updated = await prisma.discoveryItem.findUnique({
    where: { id: discoveryId },
    include: {
      extensions: { orderBy: { extensionNumber: "asc" } },
      assignedTo: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  return NextResponse.json({ item: updated });
}

// DELETE /api/cases/[id]/discovery/[discoveryId]
export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspace, membership } = await getCurrentWorkspace(user.id);
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  if (!canDelete(membership?.role ?? "")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { discoveryId } = await params;

  const item = await prisma.discoveryItem.findFirst({
    where: { id: discoveryId, workspaceId: workspace.id },
    include: { linkedEvent: { include: { googleSync: true } } },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Delete Google Calendar event best-effort
  if (item.linkedEvent?.googleSync) {
    const connection = await prisma.userCalendarConnection.findFirst({
      where: { userId: user.id, provider: "GOOGLE", isActive: true },
    });
    if (connection) {
      try {
        const accessToken = await getAccessToken(connection.refreshToken);
        await deleteGoogleEvent(
          accessToken,
          item.linkedEvent.googleSync.googleCalendarId,
          item.linkedEvent.googleSync.googleEventId,
        );
      } catch { /* best-effort */ }
    }
  }

  await prisma.discoveryItem.delete({ where: { id: discoveryId } });

  return NextResponse.json({ ok: true });
}
