import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspaces";
import { getInboxRefreshToken, makeOAuth2Client, processGmailMessages } from "@/lib/ai/processGmailMessages";
import { rateLimit } from "@/lib/rate-limit";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Cap AI/Gmail cost: 10 scans/minute per user across rescan + test-scan.
  if (!rateLimit(`inbox-scan:${user.id}`, 10, 60_000)) {
    return NextResponse.json({ error: "Too many scans. Please wait a moment." }, { status: 429 });
  }

  const { workspace } = await getCurrentWorkspace(user.id);
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const { messageId } = await request.json() as { messageId?: string; suggestionId?: string };
  if (!messageId) return NextResponse.json({ error: "messageId required" }, { status: 400 });

  await prisma.aISuggestion.updateMany({
    where: {
      workspaceId: workspace.id,
      gmailMessageId: messageId,
    },
    data: {
      status: "RESCANNED",
      gmailMessageId: null,
      sourceHash: null,
      userAction: "RESCANNED",
      reviewedBy: user.id,
      reviewedAt: new Date(),
    } as Prisma.AISuggestionUncheckedUpdateManyInput,
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
