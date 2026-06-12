import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { prisma } from "@/lib/prisma";
import { makeOAuth2Client, getInboxRefreshToken } from "@/lib/ai/processGmailMessages";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const TOPIC_NAME = process.env.GMAIL_PUBSUB_TOPIC ?? "projects/litcal-ai/topics/gmail-inbox";

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const refreshToken = await getInboxRefreshToken();
  if (!refreshToken) {
    return NextResponse.json({ error: "No Gmail refresh token" }, { status: 400 });
  }

  const oauth2 = makeOAuth2Client(refreshToken);
  const gmail = google.gmail({ version: "v1", auth: oauth2 });

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
    console.error("Gmail watch renewal failed:", err);
    return NextResponse.json({ error: "Watch renewal failed", detail: String(err) }, { status: 500 });
  }

  const historyId  = watchRes.data.historyId ?? null;
  const expiration = watchRes.data.expiration
    ? new Date(Number(watchRes.data.expiration))
    : null;

  // Update the GmailConnection record with the new expiration
  const updated = await prisma.gmailConnection.updateMany({
    where: { email: "litcalai@gmail.com", isActive: true },
    data: {
      watchExpiration: expiration ?? undefined,
      updatedAt:       new Date(),
    },
  });

  console.log(`Gmail watch renewed. Expires: ${expiration?.toISOString()}, historyId: ${historyId}, rows updated: ${updated.count}`);

  return NextResponse.json({
    ok: true,
    historyId,
    watchExpiration: expiration?.toISOString(),
    rowsUpdated: updated.count,
  });
}
