import { NextResponse } from "next/server";
import crypto from "crypto";
import { requireUser } from "@/lib/auth";

const SCOPES = ["https://www.googleapis.com/auth/calendar"].join(" ");

export async function GET(request: Request) {
  const user = await requireUser();

  if (!user) {
    return NextResponse.redirect(
      new URL("/sign-in", process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin)
    );
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "Google OAuth not configured" }, { status: 500 });
  }

  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ?? new URL("/api/auth/google/callback", request.url).toString();

  const state = crypto.randomUUID();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent", // force consent so we always get a refresh_token
    state,
  });

  const response = NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params}`
  );

  // Store state in httpOnly cookie for CSRF validation in callback
  response.cookies.set("google_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });

  return response;
}
