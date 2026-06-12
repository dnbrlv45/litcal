import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { google } from "googleapis";

function getOAuth2Client(refreshToken: string) {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2.setCredentials({ refresh_token: refreshToken });
  return oauth2;
}

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
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
