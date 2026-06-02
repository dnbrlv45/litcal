import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const user = await requireUser();
  if (!user) {
    return NextResponse.redirect(new URL("/sign-in", baseUrl));
  }
  const userId = user.id;

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL("/settings/calendar?error=denied", baseUrl));
  }

  const savedState = request.cookies.get("google_oauth_state")?.value;
  if (!state || !savedState || state !== savedState) {
    return NextResponse.redirect(new URL("/settings/calendar?error=invalid_state", baseUrl));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/settings/calendar?error=no_code", baseUrl));
  }

  // Exchange authorization code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI ?? new URL("/api/auth/google/callback", request.url).toString(),
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    console.error("Google token exchange failed:", await tokenRes.text());
    return NextResponse.redirect(new URL("/settings/calendar?error=token_exchange", baseUrl));
  }

  const tokens = await tokenRes.json();

  if (!tokens.refresh_token) {
    console.error("No refresh_token in Google response:", tokens);
    return NextResponse.redirect(new URL("/settings/calendar?error=no_refresh_token", baseUrl));
  }

  // Upsert the Google Calendar connection
  // If they're reconnecting, update the existing row and clear the cached calendar ID
  // (a new token may belong to a different Google account)
  await prisma.userCalendarConnection.upsert({
    where: { userId_provider: { userId, provider: "GOOGLE" } },
    create: {
      userId,
      provider: "GOOGLE",
      refreshToken: tokens.refresh_token,
      isActive: true,
      connectedAt: new Date(),
    },
    update: {
      refreshToken: tokens.refresh_token,
      providerCalendarId: null, // cleared so the LitCal calendar is re-resolved on next push
      isActive: true,
      disconnectedAt: null,
      connectedAt: new Date(),
    },
  });

  const response = NextResponse.redirect(new URL("/settings/calendar?connected=google", baseUrl));
  response.cookies.delete("google_oauth_state");
  return response;
}
