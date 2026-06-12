import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const user = await requireUser();
  if (!user?.isSuperAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const code  = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) return new NextResponse(`OAuth error: ${error}`, { status: 400 });

  const savedState = request.cookies.get("gmail_token_setup_state")?.value;
  if (!state || !savedState || state !== savedState)
    return new NextResponse("Invalid state", { status: 400 });

  if (!code) return new NextResponse("No code returned", { status: 400 });

  const redirectUri = `${baseUrl}/api/admin/gmail-token-setup/callback`;

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
    const detail = await tokenRes.text();
    return new NextResponse(`Token exchange failed: ${detail}`, { status: 500 });
  }

  const tokens = await tokenRes.json() as { refresh_token?: string; access_token?: string };

  const html = `<!doctype html>
<html>
<head><title>Gmail Token Setup</title></head>
<body style="font-family:monospace;padding:40px;max-width:700px;">
  <h2>Gmail Token Setup</h2>
  ${tokens.refresh_token ? `
  <p style="color:green;font-weight:bold;">✓ Got a new refresh token with send + read scopes.</p>
  <p>Copy the value below and set it as <code>GMAIL_REFRESH_TOKEN</code> in your Vercel environment variables, then redeploy.</p>
  <textarea rows="4" style="width:100%;font-family:monospace;font-size:13px;padding:10px;" onclick="this.select()">${tokens.refresh_token}</textarea>
  <p style="color:#666;font-size:13px;">After updating the env var in Vercel, the AI Inbox will show litcalai@gmail.com as connected.</p>
  ` : `
  <p style="color:red;font-weight:bold;">✗ No refresh token returned.</p>
  <p>This usually means the account already has an active token. Try revoking access at <a href="https://myaccount.google.com/permissions" target="_blank">myaccount.google.com/permissions</a> for the LitCal app, then run this setup again.</p>
  `}
</body>
</html>`;

  const response = new NextResponse(html, { headers: { "Content-Type": "text/html" } });
  response.cookies.delete("gmail_token_setup_state");
  return response;
}
