import { NextResponse } from "next/server";
import { google } from "googleapis";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { makeOAuth2Client, getInboxRefreshToken } from "@/lib/ai/processGmailMessages";

export const dynamic = "force-dynamic";

const TOPIC_NAME = process.env.GMAIL_PUBSUB_TOPIC ?? "projects/litcal-ai/topics/gmail-inbox";
const INBOX_EMAIL = "litcalai@gmail.com";

export async function POST() {
  const user = await requireUser();
  if (!user?.isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const refreshToken = await getInboxRefreshToken();
  if (!refreshToken) {
    return NextResponse.json({ error: "No Gmail refresh token found" }, { status: 400 });
  }

  const auth = makeOAuth2Client(refreshToken);
  const gmail = google.gmail({ version: "v1", auth });

  let watchRes;
  try {
    watchRes = await gmail.users.watch({
      userId: "me",
      requestBody: {
        topicName: TOPIC_NAME,
        labelIds: ["INBOX"],
        labelFilterBehavior: "INCLUDE",
      },
    });
  } catch (err) {
    console.error("Gmail watch setup failed:", err);
    return NextResponse.json({ error: "Gmail watch failed", detail: String(err) }, { status: 500 });
  }

  const historyId    = watchRes.data.historyId ?? null;
  const expiration   = watchRes.data.expiration
    ? new Date(Number(watchRes.data.expiration))
    : null;

  // Upsert GmailConnection record for the inbox account
  const inboxUser = await prisma.user.findUnique({
    where: { email: INBOX_EMAIL },
    select: { id: true },
  });

  // Find the workspace to associate the connection with (use first active workspace)
  const firstMember = inboxUser
    ? await prisma.workspaceMember.findFirst({
        where: { userId: inboxUser.id },
        select: { workspaceId: true },
      })
    : null;

  const workspaceId = firstMember?.workspaceId;
  if (!workspaceId) {
    return NextResponse.json({
      error: "No workspace found for litcalai@gmail.com — create one first",
    }, { status: 400 });
  }

  const userId = inboxUser!.id;

  const existing = await prisma.gmailConnection.findFirst({
    where: { email: INBOX_EMAIL, isActive: true },
  });

  if (existing) {
    await prisma.gmailConnection.update({
      where: { id: existing.id },
      data: {
        lastHistoryId:   historyId ?? undefined,
        watchExpiration: expiration ?? undefined,
        updatedAt:       new Date(),
      },
    });
  } else {
    await prisma.gmailConnection.create({
      data: {
        workspaceId,
        userId,
        email:           INBOX_EMAIL,
        accessToken:     "",
        refreshToken,
        lastHistoryId:   historyId ?? undefined,
        watchExpiration: expiration ?? undefined,
        isActive:        true,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    historyId,
    watchExpiration: expiration?.toISOString(),
    topic: TOPIC_NAME,
  });
}
