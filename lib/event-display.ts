const DEADLINE_RULE_LABELS: Record<string, string> = {
  TRIAL_EXPERT_DESIGNATION: "Expert Designation Due",
  TRIAL_DISCOVERY_CUTOFF:   "Discovery Cutoff",
  TRIAL_998_DUE:            "CCP 998 Due",
  CMC_CMS_TASK:             "Case Management Statement Due",
};

/**
 * Returns the human-readable display name for a calendar event.
 * Conference/hearing subtypes use the subtype label.
 * Generated deadlines use the rule key label.
 * All other types use the event title.
 */
export function getEventDisplayName(event: {
  title: string;
  eventType: string;
  subtype: string | null;
  subtypeReason: string | null;
  generatedDeadlineRuleKey?: string | null;
}): string {
  const { eventType, subtype, subtypeReason, generatedDeadlineRuleKey } = event;

  // Conference-type events: prefer subtype label
  if (
    ["HEARING", "CONFERENCE", "COURT_CALL", "CASE_MANAGEMENT_CONFERENCE"].includes(eventType) &&
    subtype
  ) {
    return subtypeReason ? `${subtype} — ${subtypeReason}` : subtype;
  }

  // Generated deadlines: use rule key label if available
  if (eventType === "DEADLINE" && generatedDeadlineRuleKey) {
    return DEADLINE_RULE_LABELS[generatedDeadlineRuleKey] ?? event.title;
  }

  return event.title;
}

/** Format a Date as "M/D/YYYY" for CSV output. */
export function formatCsvDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Format a Date as "h:mm AM/PM" for CSV output, or "All Day". */
export function formatCsvTime(date: Date, allDay: boolean): string {
  if (allDay) return "All Day";
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

/**
 * Escape a value for CSV: wraps in quotes if it contains commas, quotes, or newlines.
 * Doubles any internal quote characters.
 */
export function escapeCsv(value: string | null | undefined): string {
  const str = value ?? "";
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Build a CSV string from an array of row objects and an ordered header list. */
export function buildCsv(headers: string[], rows: Record<string, string | null | undefined>[]): string {
  const headerLine = headers.map(escapeCsv).join(",");
  const dataLines = rows.map((row) =>
    headers.map((h) => escapeCsv(row[h])).join(",")
  );
  return [headerLine, ...dataLines].join("\r\n");
}
