import { NextResponse } from "next/server";
import crypto from "crypto";
import { requireUser } from "@/lib/auth";

export async function GET(request: Request) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.redirect(
      new URL("/sign-in", process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin)
    );
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return NextResponse.json({ error: "Google OAuth not configured" }, { status: 500 });

  const redirectUri =
    process.env.GOOGLE_GMAIL_REDIRECT_URI ??
    new URL("/api/auth/google/gmail/callback", process.env.NEXT_PUBLIC_APP_URL ?? request.url).toString();

  const state = crypto.randomUUID();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    // send + modify so the same token powers email sending, AI Inbox scanning, and
    // marking processed messages as read (modify includes read access).
    scope: "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.modify",
    access_type: "offline",
    prompt: "consent",
    state,
  });

  const response = NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params}`
  );

  response.cookies.set("google_gmail_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}
