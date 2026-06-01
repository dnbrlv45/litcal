import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.redirect(new URL("/sign-in", BASE_URL));
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL("/settings/calendar?error=denied", BASE_URL));
  }

  const savedState = request.cookies.get("google_oauth_state")?.value;
  if (!state || !savedState || state !== savedState) {
    return NextResponse.redirect(new URL("/settings/calendar?error=invalid_state", BASE_URL));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/settings/calendar?error=no_code", BASE_URL));
  }

  // Exchange authorization code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:3000/api/auth/google/callback",
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    console.error("Google token exchange failed:", await tokenRes.text());
    return NextResponse.redirect(new URL("/settings/calendar?error=token_exchange", BASE_URL));
  }

  const tokens = await tokenRes.json();

  if (!tokens.refresh_token) {
    console.error("No refresh_token in Google response:", tokens);
    return NextResponse.redirect(new URL("/settings/calendar?error=no_refresh_token", BASE_URL));
  }

  // Get user info from Clerk to ensure the User row exists in Supabase
  const clerk = await clerkClient();
  const clerkUser = await clerk.users.getUser(userId);
  const email = clerkUser.emailAddresses[0]?.emailAddress ?? "";

  // Upsert the User shadow record
  await prisma.user.upsert({
    where: { id: userId },
    create: {
      id: userId,
      email,
      firstName: clerkUser.firstName ?? null,
      lastName: clerkUser.lastName ?? null,
    },
    update: {
      email,
      firstName: clerkUser.firstName ?? null,
      lastName: clerkUser.lastName ?? null,
    },
  });

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

  const response = NextResponse.redirect(new URL("/settings/calendar?connected=google", BASE_URL));
  response.cookies.delete("google_oauth_state");
  return response;
}
