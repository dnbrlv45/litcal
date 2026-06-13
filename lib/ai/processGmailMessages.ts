import { google } from "googleapis";
import { prisma } from "@/lib/prisma";
import { extractEmailSuggestion } from "@/lib/ai/extractEmailSuggestion";
import { Prisma } from "@prisma/client";
import crypto from "crypto";

export interface ProcessResult {
  messageId: string;
  status: "created" | "duplicate" | "skipped" | "error";
  error?: string;
}

interface GmailPart {
  mimeType?: string;
  body?: { data?: string; attachmentId?: string };
  parts?: GmailPart[];
  filename?: string;
  headers?: { name: string; value: string }[];
}

function decodeBase64Url(data: string) {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
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

export async function processGmailMessages(
  auth: ReturnType<typeof makeOAuth2Client>,
  messageIds: string[],
  workspaceId: string,
): Promise<ProcessResult[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gmail = google.gmail({ version: "v1", auth: auth as any });

  const existing = await prisma.aISuggestion.findMany({
    where: { workspaceId, gmailMessageId: { in: messageIds } },
    select: { gmailMessageId: true },
  });
  const processedIds = new Set(existing.map((s) => s.gmailMessageId));
  const toProcess = messageIds.filter((id) => !processedIds.has(id));

  const results: ProcessResult[] = [
    ...messageIds
      .filter((id) => processedIds.has(id))
      .map((id) => ({ messageId: id, status: "skipped" as const })),
  ];

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

      const extractedItems = await extractEmailSuggestion({ subject, sender, bodyText, attachmentTexts });

      for (const extracted of extractedItems) {
        if (extracted.classification === "IGNORE") continue;

        let duplicateOfId: string | null = null;
        if (extracted.dedupeKey) {
          const logicalDup = await prisma.aISuggestion.findFirst({
            where: {
              workspaceId,
              classification: extracted.classification,
              status: { in: ["PENDING", "APPROVED"] },
              extractedData: { path: ["dedupeKey"], equals: extracted.dedupeKey },
            },
            orderBy: { createdAt: "asc" },
          });
          if (logicalDup) duplicateOfId = logicalDup.id;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const extractedWithWarning: any = { ...extracted };
        if (extracted.classification === "CALENDAR_EVENT" && !duplicateOfId) {
          const eventDate = extracted.event?.date;
          const caseNum   = extracted.case?.caseNumber;
          if (eventDate && caseNum) {
            const dayStart = new Date(`${eventDate}T00:00:00`);
            const dayEnd   = new Date(`${eventDate}T23:59:59`);
            const matchingEvent = await prisma.event.findFirst({
              where: { workspaceId, startTime: { gte: dayStart, lte: dayEnd }, caseRef: { caseNumber: caseNum } },
            });
            if (matchingEvent) {
              extractedWithWarning.existingEventWarning =
                `Matches existing event: "${matchingEvent.title}" on ${eventDate}`;
            }
          }
        }

        const status = duplicateOfId ? "DUPLICATE" : "PENDING";

        // Use findFirst + create to avoid conflict with the new compound unique key
        const existing = await prisma.aISuggestion.findFirst({
          where: { workspaceId, gmailMessageId: messageId, classification: extracted.classification },
        });

        if (!existing) {
          await prisma.aISuggestion.create({
            data: {
              workspaceId,
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
          });
        }
      }

      results.push({ messageId, status: "created" });
    } catch (err) {
      console.error(`Failed to process message ${messageId}:`, err);
      results.push({ messageId, status: "error", error: String(err) });
    }
  }

  return results;
}

export function makeOAuth2Client(refreshToken: string) {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  oauth2.setCredentials({ refresh_token: refreshToken });
  return oauth2;
}

export async function getInboxRefreshToken(): Promise<string | null> {
  // 1. Prefer the token connected to the dedicated inbox account
  const INBOX_EMAIL = "litcalai@gmail.com";
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

  // 2. Fall back to any Gmail token in the DB (e.g. connected via Settings by any admin)
  const anyConn = await prisma.userCalendarConnection.findFirst({
    where: { provider: "GOOGLE", gmailRefreshToken: { not: null }, isActive: true },
    select: { gmailRefreshToken: true },
    orderBy: { gmailConnectedAt: "desc" },
  });
  if (anyConn?.gmailRefreshToken) return anyConn.gmailRefreshToken;

  // 3. Fall back to env var
  return process.env.GMAIL_REFRESH_TOKEN ?? null;
}
