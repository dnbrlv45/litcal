export interface GoogleCalEvent {
  id: string;
  summary?: string;
  description?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
}

export type EventType =
  | "DEADLINE"
  | "HEARING"
  | "DEPOSITION"
  | "TRIAL"
  | "CONFERENCE"
  | "MEETING"
  | "MEDIATION"
  | "COURT_CALL"
  | "CASE_MANAGEMENT_CONFERENCE"
  | "REMINDER"
  | "OTHER";

export interface ConflictDetail {
  eventId: string;
  title: string;
  startTime: string;
  endTime: string;
  attorneyName: string;
}

export interface CalEvent {
  id: string;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  allDay: boolean;
  eventType: EventType;
  location?: string;
  department?: string;
  caseId?: string;
  caseTitle?: string;
  caseStatus?: string;
  assignedAttorneyId?: string;
  assignedAttorneyName?: string;
  hasConflict?: boolean;
  conflicts?: ConflictDetail[];
  // Remote appearance
  inPerson?: boolean;
  appearanceType?: string | null;
  remoteLink?: string | null;
  phoneNumber?: string | null;
  bridge?: string | null;
  remotePassword?: string | null;
  requestRequired?: boolean | null;
  requestContactEmail?: string | null;
  requestNotes?: string | null;
}

export const EVENT_TYPE_COLORS: Record<EventType, { bg: string; text: string; dot: string; border: string; ring: string }> = {
  HEARING:                    { bg: "bg-orange-50",  text: "text-orange-800",  dot: "bg-orange-500",  border: "border-orange-300",  ring: "ring-orange-100" },
  DEPOSITION:                 { bg: "bg-cyan-50",    text: "text-cyan-800",    dot: "bg-cyan-500",    border: "border-cyan-300",    ring: "ring-cyan-100" },
  TRIAL:                      { bg: "bg-emerald-50", text: "text-emerald-800", dot: "bg-emerald-500", border: "border-emerald-300", ring: "ring-emerald-100" },
  CONFERENCE:                 { bg: "bg-blue-50",    text: "text-blue-800",    dot: "bg-blue-500",    border: "border-blue-300",    ring: "ring-blue-100" },
  MEETING:                    { bg: "bg-cyan-50",    text: "text-cyan-800",    dot: "bg-cyan-500",    border: "border-cyan-300",    ring: "ring-cyan-100" },
  MEDIATION:                  { bg: "bg-violet-50",  text: "text-violet-800",  dot: "bg-violet-500",  border: "border-violet-300",  ring: "ring-violet-100" },
  COURT_CALL:                 { bg: "bg-sky-50",     text: "text-sky-800",     dot: "bg-sky-500",     border: "border-sky-300",     ring: "ring-sky-100" },
  CASE_MANAGEMENT_CONFERENCE: { bg: "bg-indigo-50",  text: "text-indigo-800",  dot: "bg-indigo-500",  border: "border-indigo-300",  ring: "ring-indigo-100" },
  DEADLINE:                   { bg: "bg-rose-50",    text: "text-rose-800",    dot: "bg-rose-500",    border: "border-rose-300",    ring: "ring-rose-100" },
  REMINDER:                   { bg: "bg-amber-50",   text: "text-amber-800",   dot: "bg-amber-500",   border: "border-amber-300",   ring: "ring-amber-100" },
  OTHER:                      { bg: "bg-slate-50",   text: "text-slate-700",   dot: "bg-slate-400",   border: "border-slate-300",   ring: "ring-slate-100" },
};

export function mapGoogleEvent(e: GoogleCalEvent): CalEvent {
  const allDay = !e.start.dateTime;
  return {
    id: e.id,
    title: e.summary || "(No title)",
    description: e.description,
    start: new Date(e.start.dateTime ?? e.start.date ?? ""),
    end: new Date(e.end.dateTime ?? e.end.date ?? ""),
    allDay,
    eventType: "OTHER",
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
    reminderOverrides?: Array<{ method: "popup"; minutes: number }>;
  },
  calendarId = "primary"
): Promise<GoogleCalEvent> {
  const reminders =
    event.reminderOverrides && event.reminderOverrides.length > 0
      ? { useDefault: false, overrides: event.reminderOverrides }
      : { useDefault: true };

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
        reminders,
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
      description: "Litigation deadlines and events from LitCal",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to create LitCal calendar: ${body}`);
  }
  const data = await res.json();
  return data.id as string;
}
