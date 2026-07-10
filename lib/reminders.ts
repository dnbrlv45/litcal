// Sentinel stored in EventReminder.minutesBefore for "day-of at 9:00 AM" reminders.
// Negative so it never collides with a real offset.
export const DAY_OF_9AM = -1;

// Google Calendar reminder overrides accept minutes ≤ 40320 (28 days).
// We cap at 40320 for the Google payload but keep the full value in DB.
export const GOOGLE_MAX_REMINDER_MINUTES = 40320;
const DEFAULT_REMINDER_TIME_ZONE = "America/Los_Angeles";

function localDateTimeToUTC(dateStr: string, timeStr: string, timeZone: string): Date {
  const candidate = new Date(`${dateStr}T${timeStr}:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(candidate).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});

  const localForCandidate = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
  const diffMs = new Date(`${dateStr}T${timeStr}:00`).getTime() - new Date(localForCandidate).getTime();
  return new Date(candidate.getTime() + diffMs);
}

export function dayOf9AMReminderSendAt(
  calendarDate: Date,
  timeZone = DEFAULT_REMINDER_TIME_ZONE,
): Date {
  const dateStr = [
    calendarDate.getUTCFullYear(),
    String(calendarDate.getUTCMonth() + 1).padStart(2, "0"),
    String(calendarDate.getUTCDate()).padStart(2, "0"),
  ].join("-");
  return localDateTimeToUTC(dateStr, "09:00", timeZone);
}

/** Move Saturday or Sunday backward to the preceding Friday. Uses UTC to avoid timezone drift. */
export function adjustToBusinessDay(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0=Sun, 6=Sat
  if (day === 6) d.setUTCDate(d.getUTCDate() - 1);
  if (day === 0) d.setUTCDate(d.getUTCDate() - 2);
  return d;
}

/**
 * Returns the reminder schedule for an event type.
 * Values are minutes before event start, except DAY_OF_9AM (-1) which means
 * "send at 9:00 AM on the event's calendar date."
 */
export function getEventReminderSchedule(eventType: string): number[] {
  switch (eventType) {
    // Conference group and time-specific hearings: 7d, 1d, 30min
    case "HEARING":
    case "CONFERENCE":
    case "COURT_CALL":
    case "CASE_MANAGEMENT_CONFERENCE":
    // Depositions and mediations share the same schedule
    case "DEPOSITION":
    case "MEDIATION":
      return [10080, 1440, 30]; // 7d, 1d, 30min

    // Trials: 30d, 14d, 7d, 1d
    case "TRIAL":
      return [43200, 20160, 10080, 1440];

    // Deadlines: 7d before + day-of 9am
    case "DEADLINE":
      return [10080, DAY_OF_9AM];

    // Meetings: 1d, 30min
    case "MEETING":
      return [1440, 30];

    // No default reminders — user must set manually
    case "REMINDER":
    case "OTHER":
    default:
      return [];
  }
}

/**
 * Returns the reminder schedule for a task type.
 * All task types use day-of 9am only.
 */
export function getTaskReminderSchedule(): number[] {
  return [DAY_OF_9AM];
}

/** Compute reminder send dates for an event start time and type. */
export function computeReminders(
  eventStart: Date,
  eventType: string
): Array<{ minutesBefore: number; sendAt: Date }> {
  const schedule = getEventReminderSchedule(eventType);
  return schedule.map((minutes) => {
    if (minutes === DAY_OF_9AM) {
      // 9:00 AM Pacific on the event's calendar date; no weekend adjustment.
      return { minutesBefore: DAY_OF_9AM, sendAt: dayOf9AMReminderSendAt(eventStart) };
    }
    const raw = new Date(eventStart.getTime() - minutes * 60 * 1000);
    // Apply business-day adjustment only for day-level (≥1440 min) reminders.
    // Sub-day reminders (30 min) fire at the exact computed time.
    const sendAt = minutes >= 1440 ? adjustToBusinessDay(raw) : raw;
    return { minutesBefore: minutes, sendAt };
  });
}

export async function replaceEventReminders(
  tx: {
    eventReminder: {
      deleteMany(args: { where: { eventId: string } }): Promise<unknown>;
      createMany(args: { data: Array<{ eventId: string; minutesBefore: number; sendAt: Date }> }): Promise<unknown>;
    };
  },
  eventId: string,
  eventStart: Date,
  eventType: string
) {
  const reminderRows = computeReminders(eventStart, eventType);
  await tx.eventReminder.deleteMany({ where: { eventId } });
  if (reminderRows.length > 0) {
    await tx.eventReminder.createMany({
      data: reminderRows.map((r) => ({
        eventId,
        minutesBefore: r.minutesBefore,
        sendAt: r.sendAt,
      })),
    });
  }
}

/** Build Google Calendar reminder overrides for a given event type. */
export function googleReminderOverrides(
  eventType: string
): Array<{ method: "popup"; minutes: number }> {
  const schedule = getEventReminderSchedule(eventType);
  return schedule
    .filter((m) => m > 0 && m <= GOOGLE_MAX_REMINDER_MINUTES)
    .map((minutes) => ({ method: "popup" as const, minutes }));
}
