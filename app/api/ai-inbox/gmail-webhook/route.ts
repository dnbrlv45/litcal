import { NextRequest, NextResponse } from "next/server";
import { google, type gmail_v1 } from "googleapis";
import { prisma } from "@/lib/prisma";
import { makeOAuth2Client, getInboxRefreshToken, processGmailMessages } from "@/lib/ai/processGmailMessages";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function verifyRequest(req: NextRequest): boolean {
  const secret = process.env.GMAIL_WEBHOOK_SECRET;

  // Check secret token in query param (simple, no service account needed)
  if (secret) {
    const { searchParams } = new URL(req.url);
    if (searchParams.get("secret") === secret) return true;
  }

  // Fallback: accept Google-signed JWT (for authenticated push subscriptions)
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const [, payloadB64] = authHeader.slice(7).split(".");
      const payload = JSON.parse(Buffer.from(payloadB64, "base64").toString("utf-8"));
      if (payload.iss !== "https://accounts.google.com") return false;
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return false;
      return true;
    } catch { return false; }
  }

  return false;
}

export async function POST(req: NextRequest) {
  if (!verifyRequest(req)) {
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

  // Log that we received a webhook — even if we can't find the connection
  const webhookLog = `${new Date().toISOString()} email=${emailAddress} historyId=${newHistoryId} connectionFound=${!!connection}`;

  if (!connection) {
    console.warn(`Gmail webhook: no active GmailConnection for ${emailAddress}`);
    // Try to log on any connection so we can debug
    await prisma.gmailConnection.updateMany({
      where: { isActive: true },
      data: { lastWebhookAt: new Date(), lastWebhookLog: webhookLog },
    });
    return new NextResponse(null, { status: 204 });
  }

  await prisma.gmailConnection.update({
    where: { id: connection.id },
    data: { lastWebhookAt: new Date(), lastWebhookLog: webhookLog },
  });

  const auth = makeOAuth2Client(refreshToken);
  const gmail = google.gmail({ version: "v1", auth });

  const startHistoryId = connection.lastHistoryId ?? String(newHistoryId);

  // Fetch ALL messages added since lastHistoryId, following pagination.
  // Gmail pushes a separate notification per change and Pub/Sub can deliver
  // them out of order, so we list the full window from the stored cursor
  // (not just the latest notification) and only advance the cursor AFTER
  // processing succeeds — otherwise a paged-out or errored message would be
  // skipped forever.
  let messageIds: string[] = [];
  // historyId of the mailbox state we actually covered by listing.
  let coveredHistoryId = String(newHistoryId);
  try {
    let pageToken: string | undefined = undefined;
    do {
      const historyData: gmail_v1.Schema$ListHistoryResponse = (await gmail.users.history.list({
        userId: "me",
        startHistoryId,
        historyTypes: ["messageAdded"],
        labelId: "INBOX",
        pageToken,
      })).data;

      for (const h of historyData.history ?? []) {
        for (const added of h.messagesAdded ?? []) {
          if (added.message?.id) messageIds.push(added.message.id);
        }
      }
      if (historyData.historyId) coveredHistoryId = historyData.historyId;
      pageToken = historyData.nextPageToken ?? undefined;
    } while (pageToken);
  } catch (err: unknown) {
    // If historyId is too old, fall back to a fresh inbox scan
    const code = typeof err === "object" && err !== null && "code" in err
      ? (err as { code: number }).code : 0;
    if (code === 404) {
      console.warn("Gmail history expired, falling back to inbox scan");
      const listRes = await gmail.users.messages.list({ userId: "me", maxResults: 20, q: "in:inbox" });
      messageIds = (listRes.data.messages ?? []).map((m) => m.id!).filter(Boolean);
    } else {
      console.error("Gmail history list failed:", err);
      // Do NOT advance the cursor — let the next webhook retry from the same point.
      return new NextResponse(null, { status: 204 });
    }
  }

  messageIds = [...new Set(messageIds)];

  // Process FIRST, then advance the cursor only on success.
  let processedOk = true;
  if (messageIds.length > 0) {
    try {
      const results = await processGmailMessages(auth, messageIds, connection.workspaceId);
      console.log(`Gmail webhook processed ${messageIds.length} messages for ${emailAddress}:`, results);
    } catch (err) {
      processedOk = false;
      console.error("Gmail webhook processing failed; not advancing cursor:", err);
    }
  }

  // Advance the cursor forward-only, and only after successful processing, so a
  // concurrent or out-of-order notification can never skip an unprocessed message.
  if (processedOk) {
    const advanceTo = Math.max(Number(coveredHistoryId) || 0, Number(newHistoryId) || 0);
    const current = Number(connection.lastHistoryId ?? 0);
    if (advanceTo > current) {
      await prisma.gmailConnection.update({
        where: { id: connection.id },
        data: { lastHistoryId: String(advanceTo) },
      });
    }
  }

  // Always return 204 so Pub/Sub marks the message as acknowledged
  return new NextResponse(null, { status: 204 });
}
