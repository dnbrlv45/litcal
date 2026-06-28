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
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return text ?? "";
  } catch (err) {
    console.warn("pdf text extraction failed:", err);
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

  // Check across all workspaces — a message routes to its sender's workspace,
  // so we shouldn't reprocess it just because it isn't in the default one.
  const existing = await prisma.aISuggestion.findMany({
    where: { gmailMessageId: { in: messageIds } },
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

      // Route to the sender's workspace when the forwarder is a known LitCal user
      // (e.g. forwarding from dnbrlv45@ vs sa@lginjuryattorneys.com lands in the
      // matching workspace). Falls back to the connection's workspace otherwise.
      let targetWorkspaceId = workspaceId;
      const senderEmail =
        sender.match(/<([^>]+)>/)?.[1]?.trim().toLowerCase() ??
        (sender.includes("@") ? sender.trim().toLowerCase() : null);
      if (senderEmail) {
        const senderUser = await prisma.user.findFirst({
          where: { email: { equals: senderEmail, mode: "insensitive" } },
          select: { id: true },
        });
        if (senderUser) {
          const membership = await prisma.workspaceMember.findFirst({
            where: { userId: senderUser.id },
            orderBy: { createdAt: "asc" },
            select: { workspaceId: true },
          });
          if (membership) targetWorkspaceId = membership.workspaceId;
        }
      }

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

        // 1) Content dedup: the same email (re-)forwarded as a different Gmail message
        // produces an identical sourceHash. This is more reliable than Gemini's free-form
        // dedupeKey, which varies between runs even for the same matter.
        const contentDup = await prisma.aISuggestion.findFirst({
          where: {
            workspaceId: targetWorkspaceId,
            classification: extracted.classification,
            status: { in: ["PENDING", "APPROVED"] },
            sourceHash,
            gmailMessageId: { not: messageId },
          },
          orderBy: { createdAt: "asc" },
        });
        if (contentDup) duplicateOfId = contentDup.id;

        // 2) Logical dedup via Gemini's dedupeKey (catches same matter, different text)
        if (!duplicateOfId && extracted.dedupeKey) {
          const logicalDup = await prisma.aISuggestion.findFirst({
            where: {
              workspaceId: targetWorkspaceId,
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
        if ((extracted.classification === "CALENDAR_EVENT" || extracted.classification === "EVENT_CANCELLATION") && !duplicateOfId) {
          const cancellationData = (extracted as unknown as Record<string, unknown>).cancellation as Record<string, string | null> | undefined;
          const eventDate = extracted.event?.date ?? cancellationData?.originalDate ?? null;
          const caseNum = extracted.case?.caseNumber;
          const casePlaintiff = extracted.case?.plaintiff;
          const caseDefendant = extracted.case?.defendant;

          if (eventDate) {
            const dayStart = new Date(`${eventDate}T00:00:00`);
            const dayEnd   = new Date(`${eventDate}T23:59:59`);

            // Build query: match by case number, or by case name if no number
            const eventWhere: Record<string, unknown> = {
              workspaceId: targetWorkspaceId,
              startTime: { gte: dayStart, lte: dayEnd },
              status: { notIn: ["CANCELLED", "COMPLETED"] },
            };
            if (caseNum) {
              eventWhere.caseRef = { caseNumber: caseNum };
            }

            const matchingEvent = await prisma.event.findFirst({
              where: eventWhere as never,
              include: { caseRef: { select: { id: true, title: true, caseNumber: true } } },
            });

            // If no match by case number, try matching by plaintiff/defendant name in case title
            let finalMatch = matchingEvent;
            if (!finalMatch && !caseNum && (casePlaintiff || caseDefendant)) {
              const allDayEvents = await prisma.event.findMany({
                where: {
                  workspaceId: targetWorkspaceId,
                  startTime: { gte: dayStart, lte: dayEnd },
                  status: { notIn: ["CANCELLED", "COMPLETED"] },
                  caseId: { not: null },
                } as never,
                include: { caseRef: { select: { id: true, title: true, caseNumber: true } } },
              });
              finalMatch = allDayEvents.find((ev) => {
                const title = ev.caseRef?.title?.toLowerCase() ?? "";
                if (casePlaintiff && title.includes(casePlaintiff.toLowerCase())) return true;
                if (caseDefendant && title.includes(caseDefendant.toLowerCase())) return true;
                return false;
              }) ?? null;
            }

            if (finalMatch) {
              extractedWithWarning.existingEventWarning =
                `Matches existing event: "${finalMatch.title}" on ${eventDate}`;
              extractedWithWarning.matchedEventId = finalMatch.id;
              extractedWithWarning.matchedEventDetails = {
                id: finalMatch.id,
                title: finalMatch.title,
                date: eventDate,
                eventType: finalMatch.eventType,
                caseTitle: finalMatch.caseRef?.title ?? null,
                caseNumber: finalMatch.caseRef?.caseNumber ?? null,
              };
            }
          }
        }

        const status = duplicateOfId ? "DUPLICATE" : "PENDING";

        // Use findFirst + create to avoid conflict — include dedupeKey to allow
        // multiple suggestions of the same classification from one email
        const existing = extracted.dedupeKey
          ? await prisma.aISuggestion.findFirst({
              where: {
                workspaceId: targetWorkspaceId,
                gmailMessageId: messageId,
                classification: extracted.classification,
                extractedData: { path: ["dedupeKey"], equals: extracted.dedupeKey },
              },
            })
          : await prisma.aISuggestion.findFirst({
              where: { workspaceId: targetWorkspaceId, gmailMessageId: messageId, classification: extracted.classification },
            });

        if (!existing) {
          await prisma.aISuggestion.create({
            data: {
              workspaceId: targetWorkspaceId,
              gmailMessageId: messageId,
              gmailThreadId:  threadId,
              sourceHash,
              subject,
              sender,
              receivedAt,
              classification: extracted.classification,
              confidence:     extracted.confidence,
              extractedData:  extractedWithWarning as unknown as Prisma.InputJsonValue,
              originalExtractedJson: extractedWithWarning as unknown as Prisma.InputJsonValue,
              missingFields:  extracted.missingFields as unknown as Prisma.InputJsonValue,
              duplicateOfId,
              matchedEventId: extractedWithWarning.matchedEventId ?? null,
              status,
              userAction: duplicateOfId ? "DUPLICATE" : undefined,
            } as Prisma.AISuggestionUncheckedCreateInput,
          });
        }
      }

      // Note: the Gmail message is marked read only when the user APPROVES a
      // suggestion (see app/api/ai-inbox/suggestions/[id]/route.ts), so emails
      // we don't act on stay unread for manual review.

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
