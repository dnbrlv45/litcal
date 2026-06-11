// ─── Hearing subtypes ─────────────────────────────────────────────────────────

export const HEARING_SUBTYPES: { value: string; label: string }[] = [
  { value: "CMC",                            label: "Case Management Conference (CMC)" },
  { value: "MSC",                            label: "Mandatory Settlement Conference (MSC)" },
  { value: "OSC",                            label: "Order to Show Cause (OSC)" },
  { value: "TSC",                            label: "Trial Setting Conference (TSC)" },
  { value: "FSC",                            label: "Final Status Conference (FSC)" },
  { value: "TRC",                            label: "Trial Readiness Conference (TRC)" },
  { value: "Status Conference",              label: "Status Conference" },
  { value: "Post Mediation Status Conference", label: "Post Mediation Status Conference" },
  { value: "Motion Hearing",                 label: "Motion Hearing" },
  { value: "Ex Parte",                       label: "Ex Parte Hearing" },
  { value: "Minor's Compromise",             label: "Minor's Compromise Hearing" },
  { value: "IDC",                            label: "Informal Discovery Conference (IDC)" },
  { value: "Discovery Conference",           label: "Discovery Conference" },
  { value: "Case Review Conference",         label: "Case Review Conference" },
  { value: "Pretrial Conference",            label: "Pretrial Conference" },
  { value: "Further CMC",                    label: "Further Case Management Conference" },
];

/** Event types that support hearing subtypes. */
export const HEARING_EVENT_TYPES = new Set([
  "CASE_MANAGEMENT_CONFERENCE",
  "CONFERENCE",
  "COURT_CALL",
]);

// ─── Category / color mapping ─────────────────────────────────────────────────

export type EventCategory = "hearing" | "trial" | "deadline" | "deposition" | "mediation" | "task" | "other";

export function getEventCategory(eventType: string): EventCategory {
  switch (eventType) {
    case "HEARING":
    case "CASE_MANAGEMENT_CONFERENCE":
    case "CONFERENCE":
    case "COURT_CALL":
      return "hearing";
    case "TRIAL":    return "trial";
    case "DEADLINE": return "deadline";
    case "DEPOSITION": return "deposition";
    case "MEDIATION": return "mediation";
    case "MEETING":
    case "REMINDER": return "task";
    default:         return "other";
  }
}

/** Maps an event type to a Google Calendar colorId. */
export function getGoogleColorId(eventType: string): number {
  switch (getEventCategory(eventType)) {
    case "hearing":    return 9;  // Blueberry
    case "trial":      return 11; // Tomato
    case "deadline":   return 5;  // Banana
    case "deposition": return 7;  // Peacock
    case "mediation":  return 10; // Basil
    case "task":       return 8;  // Graphite
    default:           return 8;
  }
}

// ─── Payload data shape ───────────────────────────────────────────────────────

export interface GooglePayloadData {
  // Event
  title: string;
  eventType: string;
  subtype?: string | null;
  subtypeReason?: string | null;
  description?: string | null;
  location?: string | null;
  department?: string | null;
  inPerson?: boolean | null;
  // Case
  caseName?: string | null;
  caseNumber?: string | null;
  // Court
  countyName?: string | null;
  courtName?: string | null;
  // Remote appearance
  appearanceType?: string | null;
  remoteLink?: string | null;
  phoneNumber?: string | null;
  bridge?: string | null;
  password?: string | null;
  requestRequired?: boolean | null;
  requestTaskCreated?: boolean;
  // Staff
  attorneyName?: string | null;
  paralegalName?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EVENT_TYPE_LABELS: Record<string, string> = {
  HEARING:                    "Hearing",
  DEPOSITION:                 "Deposition",
  TRIAL:                      "Trial",
  DEADLINE:                   "Deadline",
  CONFERENCE:                 "Conference",
  MEETING:                    "Meeting",
  MEDIATION:                  "Mediation",
  COURT_CALL:                 "Court Call",
  CASE_MANAGEMENT_CONFERENCE: "Case Management Conference",
  REMINDER:                   "Reminder",
  OTHER:                      "Other",
};

function subtypeDisplayLabel(subtype: string, subtypeReason?: string | null): string {
  if (subtype === "OSC" && subtypeReason?.trim()) {
    return `Order to Show Cause re: ${subtypeReason.trim()}`;
  }
  // Strip abbreviation suffix like "(CMC)" from stored label
  const found = HEARING_SUBTYPES.find((s) => s.value === subtype);
  if (found) return found.label.replace(/ \([A-Z/ ]+\)$/, "");
  return subtype;
}

export function buildGoogleSummary(
  data: Pick<GooglePayloadData, "title" | "eventType" | "subtype" | "subtypeReason" | "caseName">
): string {
  const { caseName, eventType, subtype, subtypeReason, title } = data;
  const eventLabel = subtype
    ? subtypeDisplayLabel(subtype, subtypeReason)
    : (EVENT_TYPE_LABELS[eventType] ?? eventType);

  return caseName?.trim() ? `${caseName.trim()} — ${eventLabel}` : title;
}

export function buildGoogleLocation(
  data: Pick<GooglePayloadData, "inPerson" | "remoteLink" | "phoneNumber" | "location">
): string | undefined {
  if (data.inPerson) return data.location ?? undefined;
  return data.remoteLink ?? data.phoneNumber ?? data.location ?? undefined;
}

export function buildGoogleDescription(data: GooglePayloadData): string {
  const sections: string[] = [];

  // Case
  if (data.caseName) {
    const caseLabel = data.caseNumber ? `${data.caseName} (#${data.caseNumber})` : data.caseName;
    sections.push(caseLabel);
  }

  // Remote appearance join info
  if (!data.inPerson) {
    if (data.remoteLink) sections.push(`Join: ${data.remoteLink}`);
    if (data.phoneNumber) {
      const phoneLines = [`Phone: ${data.phoneNumber}`];
      if (data.bridge)   phoneLines.push(`Bridge: ${data.bridge}`);
      if (data.password) phoneLines.push(`Password: ${data.password}`);
      sections.push(phoneLines.join("\n"));
    }
  }

  // Staff
  const staffLines: string[] = [];
  if (data.attorneyName)  staffLines.push(`Attorney: ${data.attorneyName}`);
  if (data.paralegalName) staffLines.push(`Paralegal: ${data.paralegalName}`);
  if (staffLines.length)  sections.push(staffLines.join("\n"));

  // Notes
  if (data.description?.trim()) sections.push(data.description.trim());

  return sections.join("\n\n");
}

export function buildGoogleEventPayload(data: GooglePayloadData): {
  summary: string;
  description: string;
  location: string | undefined;
  colorId: number;
} {
  return {
    summary:     buildGoogleSummary(data),
    description: buildGoogleDescription(data),
    location:    buildGoogleLocation(data),
    colorId:     getGoogleColorId(data.eventType),
  };
}
