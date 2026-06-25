import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getCurrentWorkspace } from "@/lib/workspaces";

export const runtime = "nodejs";

type ParsedEvent = {
  uid: string;
  title: string;
  description: string | null;
  startTime: string; // ISO
  endTime: string;   // ISO
  allDay: boolean;
  eventType: string;
  subtype: string | null;
  department: string | null;
  location: string | null;
  caseId: string | null;
  caseTitle: string | null;
  caseNumber: string | null;
  matchMethod: string | null; // "caseNumber" | "titleFuzzy" | null
  warnings: string[];
};

// ── ICS Parsing ─────────────────────────────────────────────

function unfoldIcs(raw: string): string {
  // RFC 5545: lines starting with space/tab are continuations
  return raw.replace(/\r\n[ \t]/g, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

type IcsComponent = { type: string; props: Map<string, string>; children: IcsComponent[] };

function parseIcsComponents(text: string): IcsComponent[] {
  const lines = unfoldIcs(text).split("\n");
  const stack: IcsComponent[] = [{ type: "ROOT", props: new Map(), children: [] }];

  for (const line of lines) {
    if (line.startsWith("BEGIN:")) {
      const comp: IcsComponent = { type: line.slice(6).trim(), props: new Map(), children: [] };
      stack[stack.length - 1].children.push(comp);
      stack.push(comp);
    } else if (line.startsWith("END:")) {
      stack.pop();
    } else {
      const colonIdx = line.indexOf(":");
      if (colonIdx < 0) continue;
      const keyPart = line.slice(0, colonIdx);
      const value = line.slice(colonIdx + 1);
      // Strip parameters (e.g. DTSTART;VALUE=DATE → DTSTART)
      const propName = keyPart.split(";")[0];
      stack[stack.length - 1].props.set(propName, value);
    }
  }
  return stack[0].children;
}

function extractVEvents(text: string): { props: Map<string, string>; hasValarm: boolean }[] {
  const roots = parseIcsComponents(text);
  const events: { props: Map<string, string>; hasValarm: boolean }[] = [];
  function walk(comp: IcsComponent) {
    if (comp.type === "VEVENT") {
      const hasValarm = comp.children.some((c) => c.type === "VALARM");
      events.push({ props: comp.props, hasValarm });
    }
    for (const child of comp.children) walk(child);
  }
  for (const root of roots) walk(root);
  return events;
}

// ── Date parsing ────────────────────────────────────────────

function parseIcsDateTime(raw: string, keyLine: string): { date: Date; allDay: boolean } {
  // VALUE=DATE format: 20261002
  if (keyLine.includes("VALUE=DATE") || /^\d{8}$/.test(raw)) {
    const y = parseInt(raw.slice(0, 4));
    const m = parseInt(raw.slice(4, 6)) - 1;
    const d = parseInt(raw.slice(6, 8));
    // Start of day in LA timezone: create as UTC offset for LA
    // LA is UTC-7 (PDT) or UTC-8 (PST). Use a simpler approach:
    // Create date at midnight UTC, then shift by +7 or +8 hours.
    // For simplicity, store as midnight LA = 07:00 UTC (PDT) or 08:00 UTC (PST)
    // We'll use a fixed approach: create as ISO with explicit offset
    const date = new Date(Date.UTC(y, m, d, 7, 0, 0)); // approx PDT midnight
    return { date, allDay: true };
  }
  // Full datetime: 20260728T153000Z
  if (raw.endsWith("Z")) {
    const y = parseInt(raw.slice(0, 4));
    const m = parseInt(raw.slice(4, 6)) - 1;
    const d = parseInt(raw.slice(6, 8));
    const h = parseInt(raw.slice(9, 11));
    const min = parseInt(raw.slice(11, 13));
    const s = parseInt(raw.slice(13, 15));
    return { date: new Date(Date.UTC(y, m, d, h, min, s)), allDay: false };
  }
  // Non-Z datetime (assumed local to America/Los_Angeles)
  const y = parseInt(raw.slice(0, 4));
  const m = parseInt(raw.slice(4, 6)) - 1;
  const d = parseInt(raw.slice(6, 8));
  const h = raw.length >= 13 ? parseInt(raw.slice(9, 11)) : 0;
  const min = raw.length >= 13 ? parseInt(raw.slice(11, 13)) : 0;
  const s = raw.length >= 15 ? parseInt(raw.slice(13, 15)) : 0;
  const date = new Date(Date.UTC(y, m, d, h + 7, min, s)); // approx PDT
  return { date, allDay: false };
}

// ── Description field extraction ────────────────────────────

function extractField(desc: string, field: string): string | null {
  const regex = new RegExp(`^${field}:\\s*(.+)`, "im");
  const match = desc.match(regex);
  return match?.[1]?.trim() || null;
}

// ── Event type classification ───────────────────────────────

function classifyEvent(
  summary: string,
  desc: string | null,
): { eventType: string; subtype: string | null } {
  const typeField = desc ? extractField(desc, "Type") : null;

  if (typeField) {
    if (/OSC/i.test(typeField)) return { eventType: "HEARING", subtype: "OSC" };
    if (/TSC/i.test(typeField)) return { eventType: "HEARING", subtype: "TSC" };
    if (/TRC/i.test(typeField)) return { eventType: "HEARING", subtype: "TRC" };
    if (/CMC/i.test(typeField)) return { eventType: "CASE_MANAGEMENT_CONFERENCE", subtype: null };
    if (/MSC/i.test(typeField)) return { eventType: "HEARING", subtype: "MSC" };
    if (/Motion/i.test(typeField)) return { eventType: "HEARING", subtype: "Motion Hearing" };
  }

  const s = summary;
  if (/\bTrial\b/i.test(s)) return { eventType: "TRIAL", subtype: null };
  if (/\bDepo(?:sition)?\b/i.test(s)) return { eventType: "DEPOSITION", subtype: null };
  if (/\bMediation\b/i.test(s)) return { eventType: "MEDIATION", subtype: null };
  if (/\bCCP\s*998\b/i.test(s) || (desc && extractField(desc, "Deadline")))
    return { eventType: "DEADLINE", subtype: extractField(desc ?? "", "Deadline") || "CCP 998" };
  if (/^File CMS/i.test(s)) return { eventType: "DEADLINE", subtype: "File CMS" };
  if (/\bDiscovery\b/i.test(s)) return { eventType: "DEADLINE", subtype: null };

  // Check summary for type keywords too (structured summaries)
  if (/\bOSC\b/i.test(s)) return { eventType: "HEARING", subtype: "OSC" };
  if (/\bTSC\b/i.test(s)) return { eventType: "HEARING", subtype: "TSC" };
  if (/\bTRC\b/i.test(s)) return { eventType: "HEARING", subtype: "TRC" };
  if (/\bCMC\b/i.test(s)) return { eventType: "CASE_MANAGEMENT_CONFERENCE", subtype: null };
  if (/\bMSC\b/i.test(s)) return { eventType: "HEARING", subtype: "MSC" };
  if (/\bMotion\b/i.test(s)) return { eventType: "HEARING", subtype: "Motion Hearing" };

  return { eventType: "OTHER", subtype: null };
}

// ── Title extraction ────────────────────────────────────────

function extractTitle(summary: string, desc: string | null): string {
  // If summary has structured "Case: X v Y\nType: ..." format, extract just the case name + type
  const caseField = desc ? extractField(desc, "Case") : null;
  const typeField = desc ? extractField(desc, "Type") : null;

  if (caseField && typeField) {
    return `${typeField} — ${caseField}`;
  }
  if (caseField) {
    return caseField;
  }

  // Clean up multi-line summaries (some have full structured data in SUMMARY)
  const firstLine = summary.split("\\n")[0].replace(/^Case:\s*/i, "").trim();
  return firstLine || summary;
}

// ── Case matching helpers ───────────────────────────────────

function extractCaseNames(summary: string): string[] {
  // Match "X v. Y", "X vs Y", "X vs. Y" patterns
  const vsMatch = summary.match(/(.+?)\s+v\.?\s+(.+)/i);
  if (vsMatch) {
    return [vsMatch[1].trim(), vsMatch[2].trim()];
  }
  return [];
}

function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// ── Main handler ────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const currentUser = await requireUser();
    if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { workspace } = await getCurrentWorkspace(currentUser.id);
    if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 403 });

    const body = await request.json() as { icsContent?: string };
    const icsContent = body.icsContent;
    if (!icsContent) return NextResponse.json({ error: "No ICS content provided." }, { status: 400 });

    // Parse all VEVENT components
    const vevents = extractVEvents(icsContent);

    // Load all workspace cases with parties for matching
    const cases = await prisma.case.findMany({
      where: { workspaceId: workspace.id },
      select: { id: true, title: true, caseNumber: true, parties: { select: { name: true } } },
    });
    const casesByNumber = new Map<string, typeof cases[number]>();
    for (const c of cases) {
      if (c.caseNumber) casesByNumber.set(c.caseNumber.toLowerCase(), c);
    }

    // Check existing events for UID dedup (stored in description with [GCal-UID:xxx])
    const existingEvents = await prisma.event.findMany({
      where: { workspaceId: workspace.id, description: { contains: "[GCal-UID:" } },
      select: { description: true },
    });
    const existingUids = new Set<string>();
    for (const e of existingEvents) {
      const match = e.description?.match(/\[GCal-UID:(.+?)\]/);
      if (match) existingUids.add(match[1]);
    }

    const parsedEvents: ParsedEvent[] = [];
    let skippedAlarms = 0;
    let skippedDuplicates = 0;

    for (const { props } of vevents) {
      const summary = props.get("SUMMARY") ?? "";
      const uid = props.get("UID") ?? "";

      // Skip VALARM-only entries (summary = "Alarm notification")
      if (summary === "Alarm notification") {
        skippedAlarms++;
        continue;
      }

      // Skip duplicates by UID
      if (uid && existingUids.has(uid)) {
        skippedDuplicates++;
        continue;
      }

      const descRaw = props.get("DESCRIPTION") ?? null;
      // Unescape ICS text
      const desc = descRaw?.replace(/\\n/g, "\n").replace(/\\,/g, ",").replace(/\\\\/g, "\\") ?? null;

      // Parse dates - need to check the raw line for VALUE=DATE parameter
      const dtStartRaw = props.get("DTSTART") ?? "";
      // Reconstruct key line to detect VALUE=DATE
      const isAllDayStart = /^\d{8}$/.test(dtStartRaw);
      const startParsed = parseIcsDateTime(dtStartRaw, isAllDayStart ? "VALUE=DATE" : "");

      const dtEndRaw = props.get("DTEND") ?? "";
      let endDate: Date;
      if (dtEndRaw) {
        const isAllDayEnd = /^\d{8}$/.test(dtEndRaw);
        endDate = parseIcsDateTime(dtEndRaw, isAllDayEnd ? "VALUE=DATE" : "").date;
      } else {
        // No DTEND — add 1 day for all-day, 1 hour otherwise
        endDate = new Date(startParsed.date.getTime() + (startParsed.allDay ? 86400000 : 3600000));
      }

      // For all-day events, set endTime to end of day (23:59:59 LA)
      const allDay = startParsed.allDay;

      // Skip past events
      if (startParsed.date.getTime() < Date.now()) continue;

      // Classify event type
      const { eventType, subtype } = classifyEvent(summary, desc);

      // Extract metadata
      const department = desc ? extractField(desc, "Department") : null;
      const location = props.get("LOCATION") ?? (desc ? extractField(desc, "Court") : null) ?? null;
      const caseNumberFromDesc = desc ? extractField(desc, "Case Number") : null;

      // Build title
      const title = extractTitle(summary, desc);

      // Match to case
      let caseId: string | null = null;
      let caseTitle: string | null = null;
      let matchedCaseNumber: string | null = caseNumberFromDesc;
      let matchMethod: string | null = null;

      if (caseNumberFromDesc) {
        const matched = casesByNumber.get(caseNumberFromDesc.toLowerCase());
        if (matched) {
          caseId = matched.id;
          caseTitle = matched.title;
          matchMethod = "caseNumber";
        }
      }

      // Fuzzy title match if no case number match
      if (!caseId) {
        const names = extractCaseNames(summary);
        if (names.length > 0) {
          const normalized = names.map(normalizeForMatch);
          for (const c of cases) {
            const cNorm = normalizeForMatch(c.title);
            if (normalized.some((n) => n.length > 3 && cNorm.includes(n))) {
              caseId = c.id;
              caseTitle = c.title;
              matchedCaseNumber = c.caseNumber;
              matchMethod = "titleFuzzy";
              break;
            }
          }
        }
      }

      // Name-based match: for events like "ARTUR HAKOBYAN Trial" with no "v." pattern
      if (!caseId) {
        const caseField = desc ? extractField(desc, "Case") : null;
        const searchText = caseField || summary;
        // Strip trailing keywords to isolate the name
        const nameOnly = searchText
          .replace(/\b(Trial|Discovery\s*Due|Deposition|Depo|Mediation|CCP\s*998\s*Due|Discovery\s*responses?\s*due.*)\b.*$/i, "")
          .replace(/[-–—]/g, " ")
          .trim();
        if (nameOnly.length > 3) {
          const nameNorm = normalizeForMatch(nameOnly);
          for (const c of cases) {
            // Check against case title
            if (normalizeForMatch(c.title).includes(nameNorm)) {
              caseId = c.id;
              caseTitle = c.title;
              matchedCaseNumber = c.caseNumber;
              matchMethod = "nameFuzzy";
              break;
            }
            // Check against party names
            for (const p of c.parties) {
              if (normalizeForMatch(p.name).includes(nameNorm) || nameNorm.includes(normalizeForMatch(p.name))) {
                caseId = c.id;
                caseTitle = c.title;
                matchedCaseNumber = c.caseNumber;
                matchMethod = "partyName";
                break;
              }
            }
            if (caseId) break;
          }
        }
      }

      const warnings: string[] = [];
      if (!caseId && caseNumberFromDesc) warnings.push("Case number not found in workspace");
      if (!caseId && !caseNumberFromDesc) warnings.push("No case match");

      // Build description with UID tag for dedup
      const descParts: string[] = [];
      if (desc) {
        // Strip Google Meet boilerplate
        const cleanDesc = desc.replace(/-::~:~::~[\s\S]*?::~:~::-/g, "").trim();
        if (cleanDesc) descParts.push(cleanDesc);
      }
      descParts.push(`[GCal-UID:${uid}]`);

      parsedEvents.push({
        uid,
        title,
        description: descParts.join("\n\n"),
        startTime: startParsed.date.toISOString(),
        endTime: endDate.toISOString(),
        allDay,
        eventType,
        subtype,
        department,
        location,
        caseId,
        caseTitle,
        caseNumber: matchedCaseNumber,
        matchMethod,
        warnings,
      });
    }

    // Sort by start time
    parsedEvents.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    const matched = parsedEvents.filter((e) => e.caseId).length;
    const unmatched = parsedEvents.filter((e) => !e.caseId).length;

    return NextResponse.json({
      totalParsed: vevents.length,
      eventsToImport: parsedEvents.length,
      skippedAlarms,
      skippedDuplicates,
      matched,
      unmatched,
      events: parsedEvents,
    });
  } catch (err) {
    console.error("Event import preview error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
