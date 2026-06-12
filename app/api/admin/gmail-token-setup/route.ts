import { NextResponse } from "next/server";
import crypto from "crypto";
import { requireUser } from "@/lib/auth";

// One-time utility: initiates OAuth for litcalai@gmail.com with both send + read scopes.
// After consent, the callback displays the new refresh token to paste into GMAIL_REFRESH_TOKEN.
// Only accessible to super admins.

export async function GET(request: Request) {
  const user = await requireUser();
  if (!user?.isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return NextResponse.json({ error: "GOOGLE_CLIENT_ID not set" }, { status: 500 });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const redirectUri = `${baseUrl}/api/admin/gmail-token-setup/callback`;
  const state = crypto.randomUUID();

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: "code",
    scope:         "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly",
    access_type:   "offline",
    prompt:        "consent",
    state,
    login_hint:    "litcalai@gmail.com",
  });

  const response = NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params}`
  );
  response.cookies.set("gmail_token_setup_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}
