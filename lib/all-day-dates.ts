function parseDateInput(dateStr: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) throw new Error("Invalid date input");
  return {
    year: Number(match[1]),
    month: Number(match[2]) - 1,
    day: Number(match[3]),
  };
}

/** Store all-day calendar dates at noon UTC to avoid local timezone date drift. */
export function allDayDateToNoonUTCISOString(dateStr: string): string {
  const { year, month, day } = parseDateInput(dateStr);
  return new Date(Date.UTC(year, month, day, 12, 0, 0, 0)).toISOString();
}

/** Google Calendar all-day event end dates are exclusive. */
export function googleAllDayExclusiveEndDate(inclusiveEnd: Date): string {
  const end = new Date(Date.UTC(
    inclusiveEnd.getUTCFullYear(),
    inclusiveEnd.getUTCMonth(),
    inclusiveEnd.getUTCDate(),
  ));
  end.setUTCDate(end.getUTCDate() + 1);
  return end.toISOString().slice(0, 10);
}
