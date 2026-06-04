import { NextRequest, NextResponse } from "next/server";
import { attachSession, upsertGoogleUser, type GoogleIdentity } from "@/lib/auth";

function callbackUrl(request: NextRequest) {
  return process.env.GOOGLE_AUTH_REDIRECT_URI ?? new URL("/api/auth/google/sign-in/callback", request.url).toString();
}

export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL("/sign-in?error=denied", baseUrl));
  }

  const savedState = request.cookies.get("litcal_google_auth_state")?.value;
  if (!state || !savedState || state !== savedState) {
    return NextResponse.redirect(new URL("/sign-in?error=invalid_state", baseUrl));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/sign-in?error=no_code", baseUrl));
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: callbackUrl(request),
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    console.error("Google auth token exchange failed:", await tokenRes.text());
    return NextResponse.redirect(new URL("/sign-in?error=token_exchange", baseUrl));
  }

  const tokens = await tokenRes.json() as { access_token?: string };
  if (!tokens.access_token) {
    return NextResponse.redirect(new URL("/sign-in?error=token_exchange", baseUrl));
  }

  const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!userInfoRes.ok) {
    console.error("Google userinfo failed:", await userInfoRes.text());
    return NextResponse.redirect(new URL("/sign-in?error=userinfo", baseUrl));
  }

  const identity = await userInfoRes.json() as GoogleIdentity;
  if (!identity.sub || !identity.email) {
    return NextResponse.redirect(new URL("/sign-in?error=userinfo", baseUrl));
  }

  const authMode = request.cookies.get("litcal_google_auth_mode")?.value;

  let user;
  if (authMode === "sign-up") {
    user = await upsertGoogleUser(identity);
  } else {
    const { prisma } = await import("@/lib/prisma");
    const email = identity.email.trim().toLowerCase();
    user = await prisma.user.findFirst({
      where: { OR: [{ googleSub: identity.sub }, { email }] },
    });

    if (!user) {
      return NextResponse.redirect(new URL("/sign-up?error=no_account", baseUrl));
    }

    if (user.googleSub !== identity.sub) {
      await prisma.user.update({
        where: { id: user.id },
        data: { googleSub: identity.sub },
      });
    }
  }

  const response = NextResponse.redirect(new URL("/", baseUrl));
  response.cookies.delete("litcal_google_auth_state");
  response.cookies.delete("litcal_google_auth_mode");
  await attachSession(response, user.id);
  return response;
}
