import crypto from "crypto";
import { getAccessToken } from "@/lib/google-calendar";
import { prisma } from "@/lib/prisma";

interface InviteEmailOptions {
  inviterName: string;
  inviterEmail: string;
  recipientEmail: string;
  workspaceName: string;
  inviteUrl: string;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function headerValue(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function base64Url(value: string) {
  return Buffer.from(value)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function buildInviteEmail({
  inviterName,
  inviterEmail,
  recipientEmail,
  workspaceName,
  inviteUrl,
}: InviteEmailOptions) {
  const safeInviterName = escapeHtml(inviterName);
  const safeInviterEmail = escapeHtml(inviterEmail);
  const safeRecipientEmail = escapeHtml(recipientEmail);
  const safeWorkspaceName = escapeHtml(workspaceName);
  const safeInviteUrl = escapeHtml(inviteUrl);
  const headerInviterName = headerValue(inviterName);
  const headerInviterEmail = headerValue(inviterEmail);
  const headerRecipientEmail = headerValue(recipientEmail);
  const subject = headerValue(`You're invited to ${workspaceName} on LitCal`);
  const boundary = `litcal-${crypto.randomUUID()}`;

  const text = [
    `${inviterName} invited you to ${workspaceName} on LitCal.`,
    "",
    "LitCal helps litigation teams manage hearings, deadlines, case events, and shared calendars.",
    "",
    `Accept the invite: ${inviteUrl}`,
    "",
    `This invitation was sent to ${recipientEmail}.`,
  ].join("\n");

  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#f8fafc;padding:32px 0;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
      <tr>
        <td align="center" style="padding:0 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;border-collapse:collapse;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="padding:28px 30px 18px;border-bottom:1px solid #e2e8f0;">
                <div style="font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#0f766e;">LitCal</div>
                <h1 style="margin:14px 0 0;font-size:24px;line-height:1.25;color:#0f172a;">You're invited to ${safeWorkspaceName}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 30px 8px;">
                <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#334155;">
                  ${safeInviterName} invited you to join <strong>${safeWorkspaceName}</strong> in LitCal, a calendar-first workspace for litigation deadlines, hearings, case events, and team coordination.
                </p>
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0;">
                  <tr>
                    <td>
                      <a href="${safeInviteUrl}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;border-radius:8px;padding:12px 18px;font-size:14px;font-weight:700;">Accept invite</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 18px;font-size:13px;line-height:1.6;color:#64748b;">
                  Sign in with Google using <strong>${safeRecipientEmail}</strong>. LitCal will add you to the team automatically.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 30px 28px;">
                <div style="border-top:1px solid #e2e8f0;padding-top:16px;">
                  <p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:#64748b;">Button not working? Open this link:</p>
                  <p style="margin:0;font-size:12px;line-height:1.5;color:#334155;word-break:break-all;">${safeInviteUrl}</p>
                </div>
                <p style="margin:18px 0 0;font-size:12px;line-height:1.5;color:#94a3b8;">
                  Sent by ${safeInviterName} &lt;${safeInviterEmail}&gt; through LitCal.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return [
    `To: ${headerRecipientEmail}`,
    `From: ${headerInviterName} <${headerInviterEmail}>`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    text,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "",
    html,
    "",
    `--${boundary}--`,
  ].join("\r\n");
}

export async function sendWorkspaceInviteEmail(userId: string, options: InviteEmailOptions) {
  const connection = await prisma.userCalendarConnection.findFirst({
    where: { userId, provider: "GOOGLE", isActive: true },
  });

  if (!connection) {
    return { ok: false, reason: "google_not_connected" as const };
  }

  const accessToken = await getAccessToken(connection.refreshToken);
  const raw = base64Url(buildInviteEmail(options));
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });

  if (!res.ok) {
    return { ok: false, reason: "send_failed" as const, detail: await res.text() };
  }

  return { ok: true, reason: "sent" as const };
}
