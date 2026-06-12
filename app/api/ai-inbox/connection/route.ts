import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { google } from "googleapis";

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
  // First try: litcalai@gmail.com's UserCalendarConnection (preferred)
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

  // Fallback: env var
  return process.env.GMAIL_REFRESH_TOKEN ?? null;
}

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const refreshToken = await getInboxRefreshToken();
  if (!refreshToken) {
    return NextResponse.json({ connection: null, state: "not_connected" });
  }

  try {
    const auth = getOAuth2Client(refreshToken);
    const gmail = google.gmail({ version: "v1", auth });
    const profile = await gmail.users.getProfile({ userId: "me" });
    return NextResponse.json({
      connection: { email: profile.data.emailAddress },
      state: "connected",
    });
  } catch (err: unknown) {
    const code = typeof err === "object" && err !== null && "code" in err
      ? (err as { code: number }).code
      : 0;
    if (code === 403) {
      return NextResponse.json({ connection: null, state: "needs_read_scope" });
    }
    console.error("Gmail profile probe failed:", err);
    return NextResponse.json({ connection: null, state: "error" });
  }
}
