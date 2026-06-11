import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspaces";
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

  const { workspace } = await getCurrentWorkspace(user.id);
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 403 });

  const { discoveryId } = await params;

  const item = await prisma.discoveryItem.findFirst({
    where: { id: discoveryId, workspaceId: workspace.id },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json() as { action?: string; notes?: string };

  if (body.action === "responses_received") {
    await markDiscoveryResponsesReceived(discoveryId, user.id);
  } else if (body.notes !== undefined) {
    await prisma.discoveryItem.update({
      where: { id: discoveryId },
      data: { notes: body.notes },
    });
  }

  const updated = await prisma.discoveryItem.findUnique({
    where: { id: discoveryId },
    include: { extensions: { orderBy: { extensionNumber: "asc" } } },
  });

  return NextResponse.json({ item: updated });
}

// DELETE /api/cases/[id]/discovery/[discoveryId]
export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspace } = await getCurrentWorkspace(user.id);
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 403 });

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
