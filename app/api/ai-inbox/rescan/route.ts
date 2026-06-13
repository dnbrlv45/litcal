import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspaces";
import { getInboxRefreshToken, makeOAuth2Client, processGmailMessages } from "@/lib/ai/processGmailMessages";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspace } = await getCurrentWorkspace(user.id);
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const { messageId } = await request.json() as { messageId?: string };
  if (!messageId) return NextResponse.json({ error: "messageId required" }, { status: 400 });

  // Delete all existing suggestions for this message
  await prisma.aISuggestion.deleteMany({
    where: { workspaceId: workspace.id, gmailMessageId: messageId },
  });

  const refreshToken = await getInboxRefreshToken();
  if (!refreshToken) return NextResponse.json({ error: "No Gmail token" }, { status: 400 });

  const auth = makeOAuth2Client(refreshToken);
  const results = await processGmailMessages(auth, [messageId], workspace.id);

  const created = await prisma.aISuggestion.findMany({
    where: { workspaceId: workspace.id, gmailMessageId: messageId },
    select: { classification: true, status: true },
  });

  return NextResponse.json({ ok: true, results, created });
}
