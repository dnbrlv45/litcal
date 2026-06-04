import { NextRequest, NextResponse } from "next/server";
import { attachSession, upsertGoogleUser, type GoogleIdentity } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const callbackUrl = new URL("/api/auth/google/sign-up/callback", baseUrl).toString();
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL("/sign-up?error=denied", baseUrl));
  }

  const savedState = request.cookies.get("litcal_google_signup_state")?.value;
  if (!state || !savedState || state !== savedState) {
    return NextResponse.redirect(new URL("/sign-up?error=invalid_state", baseUrl));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/sign-up?error=no_code", baseUrl));
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: callbackUrl,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(new URL("/sign-up?error=token_exchange", baseUrl));
  }

  const tokens = await tokenRes.json() as { access_token?: string };
  if (!tokens.access_token) {
    return NextResponse.redirect(new URL("/sign-up?error=token_exchange", baseUrl));
  }

  const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!userInfoRes.ok) {
    return NextResponse.redirect(new URL("/sign-up?error=userinfo", baseUrl));
  }

  const identity = await userInfoRes.json() as GoogleIdentity;
  if (!identity.sub || !identity.email) {
    return NextResponse.redirect(new URL("/sign-up?error=userinfo", baseUrl));
  }

  const user = await upsertGoogleUser(identity);
  const response = NextResponse.redirect(new URL("/", baseUrl));
  response.cookies.delete("litcal_google_signup_state");
  await attachSession(response, user.id);
  return response;
}
