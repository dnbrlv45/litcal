// Minutes before event start for each event type.
export const REMINDER_MINUTES: Partial<Record<string, number[]>> = {
  HEARING:                    [10080, 1440, 60],         // 7d, 1d, 1h
  DEPOSITION:                 [10080, 1440],             // 7d, 1d
  TRIAL:                      [43200, 20160, 10080, 1440], // 30d, 14d, 7d, 1d
  MEDIATION:                  [10080, 1440],             // 7d, 1d
  DEADLINE:                   [10080, 1440],             // 7d, 1d
  COURT_CALL:                 [1440, 60],                // 1d, 1h
  CONFERENCE:                 [1440],                    // 1d
  CASE_MANAGEMENT_CONFERENCE: [21600],                   // 15d
};

// Google Calendar reminder overrides accept minutes ≤ 40320 (28 days).
// We cap at 40320 for the Google payload but keep the full value in DB.
export const GOOGLE_MAX_REMINDER_MINUTES = 40320;

/** Move Saturday or Sunday backward to the preceding Friday. Uses UTC to avoid timezone drift. */
export function adjustToBusinessDay(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0=Sun, 6=Sat
  if (day === 6) d.setUTCDate(d.getUTCDate() - 1);
  if (day === 0) d.setUTCDate(d.getUTCDate() - 2);
  return d;
}

/** Compute reminder send dates for an event start time and type. */
export function computeReminders(
  eventStart: Date,
  eventType: string
): Array<{ minutesBefore: number; sendAt: Date }> {
  const schedule = REMINDER_MINUTES[eventType];
  if (!schedule) return [];
  return schedule.map((minutes) => {
    const raw = new Date(eventStart.getTime() - minutes * 60 * 1000);
    return { minutesBefore: minutes, sendAt: adjustToBusinessDay(raw) };
  });
}

/** Build Google Calendar reminder overrides for a given event type. */
export function googleReminderOverrides(
  eventType: string
): Array<{ method: "popup"; minutes: number }> {
  const schedule = REMINDER_MINUTES[eventType];
  if (!schedule || schedule.length === 0) return [];
  return schedule
    .filter((m) => m <= GOOGLE_MAX_REMINDER_MINUTES)
    .map((minutes) => ({ method: "popup" as const, minutes }));
}
