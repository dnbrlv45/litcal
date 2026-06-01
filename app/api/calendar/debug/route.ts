import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/google-calendar";

/** GET /api/calendar/debug
 *  Returns the full Google Calendar connection status and any errors.
 *  Remove or protect this route before going to production. */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clerk = await clerkClient();
  const user = await clerk.users.getUser(userId);

  const refreshToken = user.privateMetadata?.googleRefreshToken as string | undefined;
  const googleLitCalId = user.privateMetadata?.googleLitCalId as string | undefined;

  if (!refreshToken) {
    return NextResponse.json({ connected: false, message: "No refresh token stored — Google Calendar not connected." });
  }

  // Try to get an access token
  let accessToken: string;
  try {
    accessToken = await getAccessToken(refreshToken);
  } catch (err) {
    return NextResponse.json({
      connected: false,
      message: "Token refresh failed — the stored refresh token is invalid or expired.",
      error: String(err),
    });
  }

  // Try to list calendars (requires calendar scope)
  const calListRes = await fetch(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!calListRes.ok) {
    const body = await calListRes.text();
    return NextResponse.json({
      connected: true,
      tokenOk: true,
      calendarListOk: false,
      message: "Access token works but cannot list calendars — likely insufficient scope. Disconnect and reconnect Google Calendar.",
      calendarListError: body,
      googleLitCalId,
    });
  }

  const calList = await calListRes.json();
  const litCalEntry = googleLitCalId
    ? calList.items?.find((c: { id: string }) => c.id === googleLitCalId)
    : null;

  // Try to create a test event on primary to confirm events scope
  const testEventRes = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: "__litcal_test__",
        start: { dateTime: new Date().toISOString() },
        end: { dateTime: new Date(Date.now() + 3600000).toISOString() },
      }),
    }
  );

  let testEventStatus = "ok";
  let testEventId: string | null = null;
  if (testEventRes.ok) {
    const ev = await testEventRes.json();
    testEventId = ev.id;
    // Clean up the test event immediately
    await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${ev.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } else {
    testEventStatus = await testEventRes.text();
  }

  // Get the Google account email the token belongs to
  let connectedEmail: string | null = null;
  try {
    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (userInfoRes.ok) {
      const info = await userInfoRes.json();
      connectedEmail = info.email ?? null;
    }
  } catch { /* non-critical */ }

  return NextResponse.json({
    connected: true,
    tokenOk: true,
    connectedGoogleAccount: connectedEmail,
    calendarListOk: true,
    calendarCount: calList.items?.length ?? 0,
    calendarNames: calList.items?.map((c: { id: string; summary: string }) => ({ id: c.id, name: c.summary })) ?? [],
    googleLitCalId: googleLitCalId ?? null,
    litCalCalendarExists: !!litCalEntry,
    litCalCalendarName: litCalEntry?.summary ?? null,
    testEventStatus,
    testEventId,
    message: "All checks passed.",
  });
}
