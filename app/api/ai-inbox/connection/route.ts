import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspaces";
import { google } from "googleapis";

function getOAuth2Client(refreshToken: string) {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2.setCredentials({ refresh_token: refreshToken });
  return oauth2;
}

// Resolve the Gmail refresh token for the workspace and whether it has read scope.
// Checks the current user first, then any other workspace member.
async function resolveWorkspaceGmailToken(workspaceId: string, currentUserId: string) {
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId },
    select: { userId: true },
    orderBy: { createdAt: "asc" },
  });

  const userIds = [
    currentUserId,
    ...members.map((m) => m.userId).filter((id) => id !== currentUserId),
  ];

  for (const userId of userIds) {
    const conn = await prisma.userCalendarConnection.findFirst({
      where: { userId, provider: "GOOGLE", gmailRefreshToken: { not: null } },
      select: { gmailRefreshToken: true, userId: true },
    });
    if (conn?.gmailRefreshToken) return { refreshToken: conn.gmailRefreshToken, userId: conn.userId };
  }
  return null;
}

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspace } = await getCurrentWorkspace(user.id);
  if (!workspace) return NextResponse.json({ connection: null, state: "no_workspace" });

  const token = await resolveWorkspaceGmailToken(workspace.id, user.id);
  if (!token) return NextResponse.json({ connection: null, state: "not_connected" });

  // Probe Gmail API to detect whether the stored token includes readonly scope
  try {
    const auth = getOAuth2Client(token.refreshToken);
    const gmail = google.gmail({ version: "v1", auth });
    const profile = await gmail.users.getProfile({ userId: "me" });
    return NextResponse.json({
      connection: { email: profile.data.emailAddress, state: "connected" },
      state: "connected",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const isScope =
      message.includes("insufficient") ||
      message.includes("403") ||
      (typeof err === "object" && err !== null && "code" in err && (err as { code: number }).code === 403);

    if (isScope) {
      return NextResponse.json({ connection: null, state: "needs_read_scope" });
    }
    console.error("Gmail profile probe failed:", err);
    return NextResponse.json({ connection: null, state: "error" });
  }
}
