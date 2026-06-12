import { NextResponse } from "next/server";
import { google } from "googleapis";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspaces";
import { extractEmailSuggestion, type EmailSuggestionResult } from "@/lib/ai/extractEmailSuggestion";
import { Prisma } from "@prisma/client";
import crypto from "crypto";

const MAX_EMAILS = 20;
const INBOX_EMAIL = "litcalai@gmail.com";

function getOAuth2Client(refreshToken: string) {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2.setCredentials({ refresh_token: refreshToken });
  return oauth2;
}

async function getInboxRefreshToken() {
  const inboxUser = await prisma.user.findUnique({
    where: { email: INBOX_EMAIL },
    select: { id: true },
  });
  if (inboxUser) {
    const conn = await prisma.userCalendarConnection.findFirst({
      where: { userId: inboxUser.id, provider: "GOOGLE", gmailRefreshToken: { not: null } },
      select: { gmailRefreshToken: true },
    });
    if (conn?.gmailRefreshToken) return conn.gmailRefreshToken;
  }
  return process.env.GMAIL_REFRESH_TOKEN ?? null;
}

function decodeBase64Url(data: string) {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

interface GmailPart {
  mimeType?: string;
  body?: { data?: string; attachmentId?: string };
  parts?: GmailPart[];
  filename?: string;
  headers?: { name: string; value: string }[];
}

function extractBodyText(part: GmailPart): string {
  if (!part) return "";
  if (part.body?.data) return decodeBase64Url(part.body.data);
  if (part.parts) {
    for (const p of part.parts) {
      if (p.mimeType === "text/plain" && p.body?.data) return decodeBase64Url(p.body.data);
    }
    for (const p of part.parts) {
      if (p.mimeType === "text/html" && p.body?.data) {
        return decodeBase64Url(p.body.data).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      }
    }
    for (const p of part.parts) {
      const nested = extractBodyText(p);
      if (nested) return nested;
    }
  }
  return "";
}

function collectPdfParts(part: GmailPart, acc: Array<{ filename: string; attachmentId: string }> = []) {
  if (!part) return acc;
  if (part.filename?.toLowerCase().endsWith(".pdf") && part.body?.attachmentId) {
    acc.push({ filename: part.filename, attachmentId: part.body.attachmentId });
  }
  if (part.parts) part.parts.forEach((p) => collectPdfParts(p, acc));
  return acc;
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
    const result = await pdfParse(buffer);
    return result.text ?? "";
  } catch (err) {
    console.warn("pdf-parse failed:", err);
    return "";
  }
}

export async function POST() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspace } = await getCurrentWorkspace(user.id);
  if (!workspace) return NextResponse.json({ error: "No workspace found" }, { status: 400 });

  const refreshToken = await getInboxRefreshToken();
  if (!refreshToken) {
    return NextResponse.json(
      { error: "No Gmail token found for litcalai@gmail.com. Connect Gmail in Settings → Calendar." },
      { status: 400 }
    );
  }

  const auth = getOAuth2Client(refreshToken);
  const gmail = google.gmail({ version: "v1", auth });

  let messageIds: string[];
  try {
    const listRes = await gmail.users.messages.list({
      userId: "me",
      maxResults: MAX_EMAILS,
      q: "in:inbox",
    });
    messageIds = (listRes.data.messages ?? []).map((m) => m.id!).filter(Boolean);
  } catch (err: unknown) {
    const code = typeof err === "object" && err !== null && "code" in err
      ? (err as { code: number }).code : 0;
    if (code === 403) {
      return NextResponse.json(
        { error: "Inbox reading is not enabled. Reconnect Gmail with inbox access in Settings → Calendar." },
        { status: 403 }
      );
    }
    console.error("Gmail list failed:", err);
    return NextResponse.json({ error: "Failed to fetch Gmail messages" }, { status: 500 });
  }

  const existing = await prisma.aISuggestion.findMany({
    where: { workspaceId: workspace.id, gmailMessageId: { in: messageIds } },
    select: { gmailMessageId: true },
  });
  const processedIds = new Set(existing.map((s) => s.gmailMessageId));
  const toProcess = messageIds.filter((id) => !processedIds.has(id));

  const results: Array<{ messageId: string; status: string; error?: string }> = [];

  for (const messageId of toProcess) {
    try {
      const msgRes = await gmail.users.messages.get({
        userId: "me",
        id: messageId,
        format: "full",
      });
      const msg = msgRes.data;

      const headers = msg.payload?.headers ?? [];
      const getHeader = (name: string) =>
        headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

      const subject  = getHeader("Subject") || "(no subject)";
      const sender   = getHeader("From") || "";
      const dateStr  = getHeader("Date") || "";
      const threadId = msg.threadId ?? null;
      const receivedAt = dateStr ? new Date(dateStr) : new Date();

      const bodyText = extractBodyText((msg.payload ?? {}) as GmailPart);
      const pdfParts = collectPdfParts((msg.payload ?? {}) as GmailPart);
      const attachmentTexts: string[] = [];

      for (const part of pdfParts) {
        try {
          const attRes = await gmail.users.messages.attachments.get({
            userId: "me",
            messageId,
            id: part.attachmentId,
          });
          const raw = attRes.data.data;
          if (raw) {
            const buf = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64");
            const text = await extractPdfText(buf);
            if (text) attachmentTexts.push(text);
          }
        } catch (err) {
          console.warn(`Attachment download failed for ${part.filename}:`, err);
        }
      }

      const sourceHash = crypto
        .createHash("sha256")
        .update(subject + sender + bodyText.slice(0, 2000))
        .digest("hex");

      let extracted: EmailSuggestionResult;
      try {
        extracted = await extractEmailSuggestion({ subject, sender, bodyText, attachmentTexts });
      } catch (err) {
        console.error(`Gemini extraction failed for ${messageId}:`, err);
        results.push({ messageId, status: "error", error: String(err) });
        continue;
      }

      let duplicateOfId: string | null = null;
      if (extracted.dedupeKey) {
        const logicalDup = await prisma.aISuggestion.findFirst({
          where: {
            workspaceId: workspace.id,
            classification: extracted.classification,
            status: { in: ["PENDING", "APPROVED"] },
            extractedData: { path: ["dedupeKey"], equals: extracted.dedupeKey },
          },
          orderBy: { createdAt: "asc" },
        });
        if (logicalDup) duplicateOfId = logicalDup.id;
      }

      const extractedWithWarning: EmailSuggestionResult & { existingEventWarning?: string } = { ...extracted };
      if (extracted.classification === "CALENDAR_EVENT" && !duplicateOfId) {
        const eventDate = extracted.event.date;
        const caseNum   = extracted.case.caseNumber;
        if (eventDate && caseNum) {
          const dayStart = new Date(`${eventDate}T00:00:00`);
          const dayEnd   = new Date(`${eventDate}T23:59:59`);
          const matchingEvent = await prisma.event.findFirst({
            where: { workspaceId: workspace.id, startTime: { gte: dayStart, lte: dayEnd }, caseRef: { caseNumber: caseNum } },
          });
          if (matchingEvent) {
            extractedWithWarning.existingEventWarning =
              `Matches existing event: "${matchingEvent.title}" on ${eventDate}`;
          }
        }
      }

      const status = duplicateOfId ? "DUPLICATE" : "PENDING";

      await prisma.aISuggestion.upsert({
        where: { workspaceId_gmailMessageId: { workspaceId: workspace.id, gmailMessageId: messageId } },
        create: {
          workspaceId:    workspace.id,
          gmailMessageId: messageId,
          gmailThreadId:  threadId,
          sourceHash,
          subject,
          sender,
          receivedAt,
          classification: extracted.classification,
          confidence:     extracted.confidence,
          extractedData:  extractedWithWarning as unknown as Prisma.InputJsonValue,
          missingFields:  extracted.missingFields as unknown as Prisma.InputJsonValue,
          duplicateOfId,
          status,
        },
        update: {},
      });

      results.push({ messageId, status: "created" });
    } catch (err) {
      console.error(`Failed to process message ${messageId}:`, err);
      results.push({ messageId, status: "error", error: String(err) });
    }
  }

  return NextResponse.json({
    scanned: messageIds.length,
    alreadyProcessed: processedIds.size,
    newlyProcessed: toProcess.length,
    results,
  });
}
