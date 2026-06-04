import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

const SCOPES = ["openid", "email", "profile"].join(" ");

function callbackUrl(request: NextRequest) {
  return process.env.GOOGLE_AUTH_REDIRECT_URI ?? new URL("/api/auth/google/sign-in/callback", request.url).toString();
}

export async function GET(request: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "Google OAuth not configured" }, { status: 500 });
  }

  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl(request),
    response_type: "code",
    scope: SCOPES,
    state,
  });

  const response = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  response.cookies.set("litcal_google_auth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  // tells the callback to upsert (create if new) rather than reject unknown users
  response.cookies.set("litcal_google_auth_mode", "sign-up", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}
