export interface GoogleCalEvent {
  id: string;
  summary?: string;
  description?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
}

export interface CalEvent {
  id: string;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  allDay: boolean;
}

export function mapGoogleEvent(e: GoogleCalEvent): CalEvent {
  const allDay = !e.start.dateTime;
  return {
    id: e.id,
    title: e.summary || "(No title)",
    description: e.description,
    start: new Date(e.start.dateTime ?? e.start.date ?? ""),
    end: new Date(e.end.dateTime ?? e.end.date ?? ""),
    allDay,
  };
}

export async function getAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token refresh failed: ${body}`);
  }
  const data = await res.json();
  return data.access_token as string;
}

export async function listGoogleEvents(
  accessToken: string,
  timeMin: string,
  timeMax: string
): Promise<GoogleCalEvent[]> {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error("Failed to list events");
  const data = await res.json();
  return (data.items ?? []) as GoogleCalEvent[];
}

export async function createGoogleEvent(
  accessToken: string,
  event: {
    summary: string;
    description?: string;
    start: string;
    end: string;
    timeZone: string;
  },
  calendarId = "primary"
): Promise<GoogleCalEvent> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: event.summary,
        description: event.description,
        start: { dateTime: event.start, timeZone: event.timeZone },
        end: { dateTime: event.end, timeZone: event.timeZone },
      }),
    }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to create event: ${body}`);
  }
  return res.json();
}

/** Deletes a single event from a Google Calendar.
 *  Silently succeeds if the event is already gone (410 Gone). */
export async function deleteGoogleEvent(
  accessToken: string,
  calendarId: string,
  googleEventId: string
): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  // 204 = deleted, 410 = already gone — both are fine
  if (!res.ok && res.status !== 410) {
    const body = await res.text();
    throw new Error(`Failed to delete Google event: ${body}`);
  }
}

/** Creates a dedicated "LitCal" calendar in the user's Google account.
 *  Returns the new calendar's ID. */
export async function createLitCalCalendar(accessToken: string): Promise<string> {
  const res = await fetch("https://www.googleapis.com/calendar/v3/calendars", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      summary: "LitCal",
      description: "Litigation deadlines and events from Litigation Calendar",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to create LitCal calendar: ${body}`);
  }
  const data = await res.json();
  return data.id as string;
}
