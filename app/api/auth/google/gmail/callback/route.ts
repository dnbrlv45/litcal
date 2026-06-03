import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const user = await requireUser();
  if (!user) return NextResponse.redirect(new URL("/sign-in", baseUrl));

  const { searchParams } = new URL(request.url);
  const code  = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) return NextResponse.redirect(new URL("/settings/calendar?error=denied", baseUrl));

  const savedState = request.cookies.get("google_gmail_oauth_state")?.value;
  if (!state || !savedState || state !== savedState)
    return NextResponse.redirect(new URL("/settings/calendar?error=invalid_state", baseUrl));

  if (!code) return NextResponse.redirect(new URL("/settings/calendar?error=no_code", baseUrl));

  const redirectUri =
    process.env.GOOGLE_GMAIL_REDIRECT_URI ??
    new URL("/api/auth/google/gmail/callback", baseUrl).toString();

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri:  redirectUri,
      grant_type:    "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    console.error("Gmail token exchange failed:", await tokenRes.text());
    return NextResponse.redirect(new URL("/settings/calendar?error=token_exchange", baseUrl));
  }

  const tokens = await tokenRes.json();
  if (!tokens.refresh_token)
    return NextResponse.redirect(new URL("/settings/calendar?error=no_refresh_token", baseUrl));

  // Store Gmail token on the existing Google connection (create calendar row if missing)
  await prisma.userCalendarConnection.upsert({
    where: { userId_provider: { userId: user.id, provider: "GOOGLE" } },
    create: {
      userId:           user.id,
      provider:         "GOOGLE",
      refreshToken:     "",          // calendar not yet connected
      isActive:         false,
      gmailRefreshToken: tokens.refresh_token,
      gmailConnectedAt:  new Date(),
    },
    update: {
      gmailRefreshToken: tokens.refresh_token,
      gmailConnectedAt:  new Date(),
    },
  });

  const response = NextResponse.redirect(new URL("/settings/calendar?connected=gmail", baseUrl));
  response.cookies.delete("google_gmail_oauth_state");
  return response;
}
