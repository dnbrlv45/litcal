import { NextResponse } from "next/server";
import { google } from "googleapis";
import { requireUser } from "@/lib/auth";
import { makeOAuth2Client, getInboxRefreshToken } from "@/lib/ai/processGmailMessages";

export const dynamic = "force-dynamic";

function decodeBase64Url(data: string) {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

interface GmailPart {
  mimeType?: string;
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: GmailPart[];
  filename?: string;
}

function collectAllParts(part: GmailPart, acc: Array<{ filename: string; mimeType: string; attachmentId?: string; size?: number }> = []) {
  if (!part) return acc;
  if (part.filename) {
    acc.push({
      filename: part.filename,
      mimeType: part.mimeType ?? "unknown",
      attachmentId: part.body?.attachmentId,
      size: part.body?.size,
    });
  }
  if (part.parts) part.parts.forEach((p) => collectAllParts(p, acc));
  return acc;
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
  }
  return "";
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string; numpages: number }>;
    const result = await pdfParse(buffer);
    return result.text ?? "";
  } catch (err) {
    return `[pdf-parse error: ${String(err)}]`;
  }
}

export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const messageId = searchParams.get("messageId");
  if (!messageId) return NextResponse.json({ error: "messageId query param required" }, { status: 400 });

  const refreshToken = await getInboxRefreshToken();
  if (!refreshToken) return NextResponse.json({ error: "No Gmail token" }, { status: 400 });

  const auth = makeOAuth2Client(refreshToken);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gmail = google.gmail({ version: "v1", auth: auth as any });

  const msgRes = await gmail.users.messages.get({ userId: "me", id: messageId, format: "full" });
  const msg = msgRes.data;

  const bodyText = extractBodyText((msg.payload ?? {}) as GmailPart);
  const allParts = collectAllParts((msg.payload ?? {}) as GmailPart);

  const attachmentResults = [];
  for (const part of allParts) {
    if (!part.attachmentId) continue;
    try {
      const attRes = await gmail.users.messages.attachments.get({
        userId: "me", messageId, id: part.attachmentId,
      });
      const raw = attRes.data.data;
      if (!raw) {
        attachmentResults.push({ filename: part.filename, text: "[no data]" });
        continue;
      }
      const buf = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64");
      const text = await extractPdfText(buf);
      attachmentResults.push({
        filename: part.filename,
        mimeType: part.mimeType,
        byteSize: buf.length,
        extractedChars: text.length,
        textPreview: text.slice(0, 1000),
      });
    } catch (err) {
      attachmentResults.push({ filename: part.filename, error: String(err) });
    }
  }

  return NextResponse.json({
    subject: msg.payload?.headers?.find(h => h.name === "Subject")?.value,
    bodyPreview: bodyText.slice(0, 500),
    allParts: allParts.map(p => ({ filename: p.filename, mimeType: p.mimeType, size: p.size })),
    attachments: attachmentResults,
  });
}
