import { NextResponse } from "next/server";
import { google } from "googleapis";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { makeOAuth2Client, getInboxRefreshToken } from "@/lib/ai/processGmailMessages";

export const dynamic = "force-dynamic";

interface Check {
  ok: boolean;
  label: string;
  detail: string;
}

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const checks: Check[] = [];

  // ── 1. Env vars ──────────────────────────────────────────────────────────────
  const missingEnv: string[] = [];
  for (const v of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GMAIL_PUBSUB_TOPIC", "PUBSUB_WEBHOOK_AUDIENCE"]) {
    if (!process.env[v]) missingEnv.push(v);
  }
  const hasGmailToken = !!(process.env.GMAIL_REFRESH_TOKEN);
  if (!hasGmailToken) missingEnv.push("GMAIL_REFRESH_TOKEN (or DB token)");

  checks.push({
    ok: missingEnv.length === 0,
    label: "Environment variables",
    detail: missingEnv.length === 0
      ? `All required env vars present. Topic: ${process.env.GMAIL_PUBSUB_TOPIC}`
      : `Missing: ${missingEnv.join(", ")}`,
  });

  // ── 2. GmailConnection DB record ─────────────────────────────────────────────
  const connection = await prisma.gmailConnection.findFirst({
    where: { email: "litcalai@gmail.com", isActive: true },
    orderBy: { createdAt: "desc" },
  });

  const now = new Date();
  const watchExpired = connection?.watchExpiration
    ? connection.watchExpiration < now
    : null;
  const watchExpiresIn = connection?.watchExpiration
    ? Math.round((connection.watchExpiration.getTime() - now.getTime()) / 1000 / 60 / 60)
    : null;

  checks.push({
    ok: !!connection,
    label: "GmailConnection record",
    detail: connection
      ? `Found. lastHistoryId=${connection.lastHistoryId ?? "none"}, watchExpiration=${connection.watchExpiration?.toISOString() ?? "none"}`
      : "No active GmailConnection found. POST /api/ai-inbox/setup-watch to create one.",
  });

  if (connection?.watchExpiration) {
    checks.push({
      ok: !watchExpired,
      label: "Watch expiration",
      detail: watchExpired
        ? `EXPIRED at ${connection.watchExpiration.toISOString()}. POST /api/ai-inbox/setup-watch to renew.`
        : `Valid for ~${watchExpiresIn}h (expires ${connection.watchExpiration.toISOString()})`,
    });
  }

  // ── 3. Gmail auth — can we get a token? ──────────────────────────────────────
  const refreshToken = await getInboxRefreshToken();
  let gmailAuthOk = false;
  let gmailAuthDetail = "No refresh token found";
  let gmailProfile: { emailAddress?: string | null; messagesTotal?: number | null } | null = null;

  if (refreshToken) {
    const auth = makeOAuth2Client(refreshToken);
    const gmail = google.gmail({ version: "v1", auth: auth as Parameters<typeof google.gmail>[0]["auth"] });
    try {
      const profileRes = await gmail.users.getProfile({ userId: "me" });
      gmailProfile = {
        emailAddress: profileRes.data.emailAddress,
        messagesTotal: profileRes.data.messagesTotal,
      };
      gmailAuthOk = true;
      gmailAuthDetail = `Authenticated as ${profileRes.data.emailAddress} (${profileRes.data.messagesTotal} messages)`;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      gmailAuthDetail = `Auth failed: ${msg}`;
    }
  }

  checks.push({ ok: gmailAuthOk, label: "Gmail API auth", detail: gmailAuthDetail });

  // ── 4. Recent AISuggestions ───────────────────────────────────────────────────
  const recentCount = await prisma.aISuggestion.count({
    where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  });
  const totalCount = await prisma.aISuggestion.count();

  checks.push({
    ok: true,
    label: "AISuggestion records",
    detail: `Total: ${totalCount}, last 24h: ${recentCount}`,
  });

  // ── 5. Webhook URL sanity ────────────────────────────────────────────────────
  const expectedAudience = process.env.PUBSUB_WEBHOOK_AUDIENCE;
  const expectedWebhook = "https://litcal.vercel.app/api/ai-inbox/gmail-webhook";
  const audienceOk = expectedAudience === expectedWebhook;

  checks.push({
    ok: audienceOk,
    label: "Webhook audience",
    detail: audienceOk
      ? `PUBSUB_WEBHOOK_AUDIENCE matches expected webhook URL`
      : `PUBSUB_WEBHOOK_AUDIENCE=${expectedAudience ?? "(not set)"}, expected ${expectedWebhook}`,
  });

  const allOk = checks.every((c) => c.ok);

  return NextResponse.json({
    healthy: allOk,
    checks,
    gmailProfile,
    watchExpiration: connection?.watchExpiration?.toISOString() ?? null,
    lastHistoryId: connection?.lastHistoryId ?? null,
    lastWebhookAt: connection?.lastWebhookAt?.toISOString() ?? null,
    lastWebhookLog: connection?.lastWebhookLog ?? null,
  });
}
