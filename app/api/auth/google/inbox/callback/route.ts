import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspaces";

export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const user = await requireUser();
  if (!user) return NextResponse.redirect(new URL("/sign-in", baseUrl));

  const { searchParams } = new URL(request.url);
  const code  = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) return NextResponse.redirect(new URL("/ai-inbox?error=denied", baseUrl));

  const savedState = request.cookies.get("google_inbox_oauth_state")?.value;
  if (!state || !savedState || state !== savedState)
    return NextResponse.redirect(new URL("/ai-inbox?error=invalid_state", baseUrl));

  if (!code) return NextResponse.redirect(new URL("/ai-inbox?error=no_code", baseUrl));

  const redirectUri = `${baseUrl}/api/auth/google/inbox/callback`;

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
    console.error("Inbox token exchange failed:", await tokenRes.text());
    return NextResponse.redirect(new URL("/ai-inbox?error=token_exchange", baseUrl));
  }

  const tokens = await tokenRes.json() as { refresh_token?: string; access_token?: string };
  if (!tokens.refresh_token) {
    return NextResponse.redirect(new URL("/ai-inbox?error=no_refresh_token", baseUrl));
  }

  const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const userinfo = await userinfoRes.json() as { email?: string };
  const email = userinfo.email ?? "unknown";

  const { workspace } = await getCurrentWorkspace(user.id);
  if (!workspace) return NextResponse.redirect(new URL("/ai-inbox?error=no_workspace", baseUrl));

  const existing = await prisma.gmailConnection.findFirst({
    where: { workspaceId: workspace.id, email },
    select: { id: true },
  });

  await prisma.gmailConnection.upsert({
    where: { id: existing?.id ?? "new-connection" },
    create: {
      workspaceId:  workspace.id,
      userId:       user.id,
      email,
      accessToken:  tokens.access_token ?? "",
      refreshToken: tokens.refresh_token,
      isActive:     true,
    },
    update: {
      accessToken:  tokens.access_token ?? "",
      refreshToken: tokens.refresh_token,
      isActive:     true,
    },
  });

  const response = NextResponse.redirect(new URL("/ai-inbox?connected=gmail", baseUrl));
  response.cookies.delete("google_inbox_oauth_state");
  return response;
}
