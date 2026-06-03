import { NextRequest, NextResponse } from "next/server";
import { attachSession, upsertMicrosoftUser, type MicrosoftIdentity } from "@/lib/auth";

function callbackUrl(request: NextRequest) {
  return process.env.MICROSOFT_AUTH_REDIRECT_URI ?? new URL("/api/auth/microsoft/sign-in/callback", request.url).toString();
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

  const savedState = request.cookies.get("litcal_microsoft_auth_state")?.value;
  if (!state || !savedState || state !== savedState) {
    return NextResponse.redirect(new URL("/sign-in?error=invalid_state", baseUrl));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/sign-in?error=no_code", baseUrl));
  }

  const tokenRes = await fetch(
    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.MICROSOFT_CLIENT_ID!,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
        redirect_uri: callbackUrl(request),
        grant_type: "authorization_code",
        scope: "openid email profile",
      }),
    }
  );

  if (!tokenRes.ok) {
    console.error("Microsoft auth token exchange failed:", await tokenRes.text());
    return NextResponse.redirect(new URL("/sign-in?error=token_exchange", baseUrl));
  }

  const tokens = await tokenRes.json() as { access_token?: string };
  if (!tokens.access_token) {
    return NextResponse.redirect(new URL("/sign-in?error=token_exchange", baseUrl));
  }

  const userInfoRes = await fetch("https://graph.microsoft.com/oidc/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!userInfoRes.ok) {
    console.error("Microsoft userinfo failed:", await userInfoRes.text());
    return NextResponse.redirect(new URL("/sign-in?error=userinfo", baseUrl));
  }

  const identity = await userInfoRes.json() as MicrosoftIdentity;
  if (!identity.sub || !identity.email) {
    return NextResponse.redirect(new URL("/sign-in?error=userinfo", baseUrl));
  }

  const user = await upsertMicrosoftUser(identity);
  const response = NextResponse.redirect(new URL("/", baseUrl));
  response.cookies.delete("litcal_microsoft_auth_state");
  await attachSession(response, user.id);
  return response;
}
