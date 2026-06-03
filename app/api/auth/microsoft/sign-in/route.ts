import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

const SCOPES = ["openid", "email", "profile"].join(" ");

function callbackUrl(request: NextRequest) {
  return process.env.MICROSOFT_AUTH_REDIRECT_URI ?? new URL("/api/auth/microsoft/sign-in/callback", request.url).toString();
}

export async function GET(request: NextRequest) {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "Microsoft OAuth not configured" }, { status: 500 });
  }

  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl(request),
    response_type: "code",
    scope: SCOPES,
    state,
    response_mode: "query",
  });

  const response = NextResponse.redirect(
    `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`
  );
  response.cookies.set("litcal_microsoft_auth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}
