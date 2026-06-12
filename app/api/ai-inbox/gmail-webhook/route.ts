import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "@/lib/prisma";
import { makeOAuth2Client, getInboxRefreshToken, processGmailMessages } from "@/lib/ai/processGmailMessages";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PUBSUB_AUDIENCE = process.env.PUBSUB_WEBHOOK_AUDIENCE ?? "https://litcal.vercel.app/api/ai-inbox/gmail-webhook";

async function verifyPubSubJwt(authHeader: string | null): Promise<boolean> {
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7);
  try {
    const client = new OAuth2Client();
    const ticket = await client.verifyIdToken({ idToken: token, audience: PUBSUB_AUDIENCE });
    const payload = ticket.getPayload();
    // Google Pub/Sub pushes from service account accounts.google.com
    return !!payload;
  } catch (err) {
    console.error("Pub/Sub JWT verification failed:", err);
    return false;
  }
}

export async function POST(req: NextRequest) {
  // Verify the request is from Google Pub/Sub
  const valid = await verifyPubSubJwt(req.headers.get("authorization"));
  if (!valid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { message?: { data?: string; messageId?: string } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rawData = body?.message?.data;
  if (!rawData) {
    // Return 204 so Pub/Sub doesn't retry — message has no data
    return new NextResponse(null, { status: 204 });
  }

  let notification: { emailAddress?: string; historyId?: string | number };
  try {
    notification = JSON.parse(Buffer.from(rawData, "base64").toString("utf-8"));
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const { emailAddress, historyId: newHistoryId } = notification;
  if (!emailAddress || !newHistoryId) {
    return new NextResponse(null, { status: 204 });
  }

  const refreshToken = await getInboxRefreshToken();
  if (!refreshToken) {
    console.error("Gmail webhook: no refresh token found");
    return new NextResponse(null, { status: 204 });
  }

  // Find the GmailConnection record to get lastHistoryId and workspaceId
  const connection = await prisma.gmailConnection.findFirst({
    where: { email: emailAddress, isActive: true },
    orderBy: { createdAt: "desc" },
  });

  if (!connection) {
    console.warn(`Gmail webhook: no active GmailConnection for ${emailAddress}`);
    return new NextResponse(null, { status: 204 });
  }

  const auth = makeOAuth2Client(refreshToken);
  const gmail = google.gmail({ version: "v1", auth });

  const startHistoryId = connection.lastHistoryId ?? String(newHistoryId);

  // Fetch messages added since lastHistoryId
  let messageIds: string[] = [];
  try {
    const historyRes = await gmail.users.history.list({
      userId: "me",
      startHistoryId,
      historyTypes: ["messageAdded"],
      labelId: "INBOX",
    });

    const histories = historyRes.data.history ?? [];
    for (const h of histories) {
      for (const added of h.messagesAdded ?? []) {
        if (added.message?.id) messageIds.push(added.message.id);
      }
    }
  } catch (err: unknown) {
    // If historyId is too old, fall back to a fresh inbox scan with maxResults=5
    const code = typeof err === "object" && err !== null && "code" in err
      ? (err as { code: number }).code : 0;
    if (code === 404) {
      console.warn("Gmail history expired, falling back to inbox scan");
      const listRes = await gmail.users.messages.list({ userId: "me", maxResults: 5, q: "in:inbox" });
      messageIds = (listRes.data.messages ?? []).map((m) => m.id!).filter(Boolean);
    } else {
      console.error("Gmail history list failed:", err);
      return new NextResponse(null, { status: 204 });
    }
  }

  // Update lastHistoryId regardless of whether we processed anything
  await prisma.gmailConnection.update({
    where: { id: connection.id },
    data: { lastHistoryId: String(newHistoryId) },
  });

  if (messageIds.length === 0) {
    return new NextResponse(null, { status: 204 });
  }

  const results = await processGmailMessages(auth, messageIds, connection.workspaceId);

  console.log(`Gmail webhook processed ${messageIds.length} messages for ${emailAddress}:`, results);

  // Always return 204 so Pub/Sub marks the message as acknowledged
  return new NextResponse(null, { status: 204 });
}
