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
  importAs: "event" | "task";
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
      const unescaped = value.replace(/\\,/g, ",").replace(/\\\\/g, "\\");
      stack[stack.length - 1].props.set(propName, unescaped);
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
    // Match EventModal's all-day convention: noon UTC avoids local date drift.
    const date = new Date(Date.UTC(y, m, d, 12, 0, 0));
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
    if (/CMC|Case Management/i.test(typeField)) return { eventType: "CASE_MANAGEMENT_CONFERENCE", subtype: null };
    if (/MSC/i.test(typeField)) return { eventType: "HEARING", subtype: "MSC" };
    if (/FSC|Final Status/i.test(typeField)) return { eventType: "HEARING", subtype: "FSC" };
    if (/Post[-\s]*Mediation|Status Conference|SC\b/i.test(typeField)) return { eventType: "HEARING", subtype: typeField };
    if (/Motion/i.test(typeField)) return { eventType: "HEARING", subtype: "Motion Hearing" };
  }

  const s = summary;
  if (/\bTrial\b/i.test(s)) return { eventType: "TRIAL", subtype: null };
  if (/\bDepo(?:sition)?\b/i.test(s)) return { eventType: "DEPOSITION", subtype: null };
  if (/\bMediation\b/i.test(s)) return { eventType: "MEDIATION", subtype: null };
  if (/\bCCP\s*998\b/i.test(s) || /\bExpert Designation Due\b/i.test(s) || /\bDiscovery Cutoff\b/i.test(s) || (desc && extractField(desc, "Deadline")))
    return { eventType: "DEADLINE", subtype: extractField(desc ?? "", "Deadline") || "Trial Deadline" };
  if (/^File CMS\b/i.test(s) || /\bCMC Statement\b/i.test(s)) return { eventType: "DEADLINE", subtype: "File CMS" };
  if (/\bDiscovery\b/i.test(s)) return { eventType: "DEADLINE", subtype: null };
  if (/\bMediation Brief Due\b/i.test(s)) return { eventType: "DEADLINE", subtype: "Mediation Brief" };
  if (/\bFSC Documents?\s+DUE\b/i.test(s)) return { eventType: "DEADLINE", subtype: "FSC Documents" };
  if (/\bStatute of Limitations\b/i.test(s)) return { eventType: "DEADLINE", subtype: "Statute of Limitations" };

  // Check summary for type keywords too (structured summaries)
  if (/\bOSC\b/i.test(s)) return { eventType: "HEARING", subtype: "OSC" };
  if (/\bOrder to Show Cause\b/i.test(s)) return { eventType: "HEARING", subtype: "OSC" };
  if (/\bTSC\b/i.test(s)) return { eventType: "HEARING", subtype: "TSC" };
  if (/\bTRC\b/i.test(s)) return { eventType: "HEARING", subtype: "TRC" };
  if (/\bCMC\b|\bCase Management Conference\b/i.test(s)) return { eventType: "CASE_MANAGEMENT_CONFERENCE", subtype: null };
  if (/\bMSC\b/i.test(s)) return { eventType: "HEARING", subtype: "MSC" };
  if (/\bFSC\b|\bFinal Status Conference\b/i.test(s)) return { eventType: "HEARING", subtype: "FSC" };
  if (/\bStatus Conference\b/i.test(s)) return { eventType: "HEARING", subtype: "Status Conference" };
  if (/\bMotion\b/i.test(s)) return { eventType: "HEARING", subtype: "Motion Hearing" };
  if (/\bRequest Remote Appearance\b/i.test(s)) return { eventType: "DEADLINE", subtype: "Request Remote Appearance" };

  return { eventType: "OTHER", subtype: null };
}

function shouldImportAsTask(title: string, eventType: string, subtype: string | null): boolean {
  if (eventType !== "DEADLINE" && !/^Follow Up\b/i.test(title)) return false;
  return (
    subtype === "File CMS" ||
    subtype === "Request Remote Appearance" ||
    subtype === "Mediation Brief" ||
    subtype === "FSC Documents" ||
    /^Follow Up\b/i.test(title)
  );
}

function normalizeSignatureValue(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function eventSignature(input: {
  title: string;
  startTime: string | Date;
  endTime: string | Date;
  eventType: string;
  caseId: string | null;
}): string {
  const startTime = input.startTime instanceof Date ? input.startTime.toISOString() : new Date(input.startTime).toISOString();
  const endTime = input.endTime instanceof Date ? input.endTime.toISOString() : new Date(input.endTime).toISOString();
  return [
    normalizeSignatureValue(input.title),
    startTime,
    endTime,
    input.eventType,
    input.caseId ?? "",
  ].join("|");
}

function taskSignature(input: {
  title: string;
  dueDate: string | Date | null;
  caseId: string | null;
}): string {
  const dueDate = input.dueDate ? (input.dueDate instanceof Date ? input.dueDate.toISOString() : new Date(input.dueDate).toISOString()) : "";
  return [
    normalizeSignatureValue(input.title),
    dueDate,
    input.caseId ?? "",
  ].join("|");
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

function extractVsParties(text: string): { plaintiff: string; defendant: string } | null {
  const vsMatch = text.match(/(.+?)\s+(?:vs?\.?|VS\.?)\s+(.+)/i);
  if (!vsMatch) return null;
  return { plaintiff: vsMatch[1].trim(), defendant: vsMatch[2].trim() };
}

function extractLastName(name: string): string {
  const cleaned = name
    .replace(/,?\s*et\s+al\.?/gi, "")
    .replace(/,?\s*(?:Jr\.?|Sr\.?|III|II|IV)$/i, "")
    .replace(/\bDOES?\s+\d+.*$/i, "")
    .trim();
  // "LAST, FIRST" format
  const commaMatch = cleaned.match(/^([A-Za-z'-]+),/);
  if (commaMatch) return commaMatch[1].toLowerCase();
  // "FIRST ... LAST" format — take last word
  const parts = cleaned.split(/\s+/).filter(Boolean);
  return (parts[parts.length - 1] || "").toLowerCase();
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

    // Check existing imports for UID dedup (stored in description with [GCal-UID:xxx])
    const existingEvents = await prisma.event.findMany({
      where: { workspaceId: workspace.id, status: { not: "CANCELLED" } },
      select: { description: true, title: true, startTime: true, endTime: true, eventType: true, caseId: true },
    });
    const existingTasks = await prisma.task.findMany({
      where: { workspaceId: workspace.id },
      select: { description: true, title: true, dueDate: true, caseId: true },
    });
    const existingUids = new Set<string>();
    for (const row of [...existingEvents, ...existingTasks]) {
      const match = row.description?.match(/\[GCal-UID:(.+?)\]/);
      if (match) existingUids.add(match[1]);
    }
    const existingEventSignatures = new Set(
      existingEvents.map((event) => eventSignature(event)),
    );
    const existingTaskSignatures = new Set(
      existingTasks.map((task) => taskSignature(task)),
    );

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
      const desc = descRaw?.replace(/\\n/g, "\n") ?? null;

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

      const allDay = startParsed.allDay;
      if (allDay) {
        // ICS DTEND for all-day is exclusive (next day). Keep imports as one-day rows.
        endDate = new Date(Date.UTC(
          startParsed.date.getUTCFullYear(),
          startParsed.date.getUTCMonth(),
          startParsed.date.getUTCDate(),
          23, 59, 59, 999,
        ));
      }

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
      const importAs = shouldImportAsTask(title, eventType, subtype) ? "task" : "event";

      // Match to case
      let caseId: string | null = null;
      let caseTitle: string | null = null;
      let matchedCaseNumber: string | null = caseNumberFromDesc;
      let matchMethod: string | null = null;

      // 1. Case number match (exact)
      if (caseNumberFromDesc) {
        const matched = casesByNumber.get(caseNumberFromDesc.toLowerCase());
        if (matched) {
          caseId = matched.id;
          caseTitle = matched.title;
          matchMethod = "caseNumber";
        }
      }

      // 2. Last-name matching — handles all name variations
      if (!caseId) {
        const caseField = desc ? extractField(desc, "Case") : null;
        // Clean the summary to extract name content
        const cleanedSummary = summary
          .replace(/^(?:File\s*CMS\s*[-–—]\s*|Request\s*Remote\s*Appearance\s*[-–—]\s*)/i, "")
          .replace(/\s*\(.*?\)\s*$/, "") // remove trailing (case number)
          .split("\\n")[0].trim();

        // Try the Case: field from description first, then cleaned summary
        const matchSources = [caseField, cleanedSummary].filter(Boolean) as string[];

        for (const source of matchSources) {
          if (caseId) break;

          const vsParties = extractVsParties(source);
          if (vsParties) {
            // Has "v." pattern — match by plaintiff last name + defendant last name
            const pLast = extractLastName(vsParties.plaintiff);
            const dLast = extractLastName(vsParties.defendant);

            if (pLast.length >= 3) {
              for (const c of cases) {
                const titleLower = c.title.toLowerCase();
                const hasPlaintiff = titleLower.includes(pLast) ||
                  c.parties.some((p) => p.name.toLowerCase().includes(pLast));
                const hasDefendant = dLast.length >= 3 && titleLower.includes(dLast);

                if (hasPlaintiff && (hasDefendant || dLast.length < 3)) {
                  caseId = c.id;
                  caseTitle = c.title;
                  matchedCaseNumber = c.caseNumber;
                  matchMethod = "lastNameBoth";
                  break;
                }
              }

              // If no both-side match, try plaintiff-only but require it matches
              // exactly one case to avoid ambiguity
              if (!caseId) {
                const candidates = cases.filter((c) => {
                  const tl = c.title.toLowerCase();
                  return tl.includes(pLast) ||
                    c.parties.some((p) => p.name.toLowerCase().includes(pLast));
                });
                if (candidates.length === 1) {
                  caseId = candidates[0].id;
                  caseTitle = candidates[0].title;
                  matchedCaseNumber = candidates[0].caseNumber;
                  matchMethod = "lastNameUnique";
                }
              }
            }
          } else {
            // No "v." pattern — single name like "Karen Murillo Discovery Due"
            const nameOnly = source
              .replace(/\b(Trial|Discovery\s*(?:Due|Cutoff|responses?\s*due.*)|Deposition|Depo|Mediation|CCP\s*998\s*Due|Expert\s*Designation\s*Due|IME)\b.*$/i, "")
              .trim();
            if (nameOnly.length >= 3) {
              const lastName = extractLastName(nameOnly);
              const fullNorm = normalizeForMatch(nameOnly);
              // Require match on last name + first name (or full normalized name)
              const candidates = cases.filter((c) => {
                if (c.parties.some((p) => {
                  const pNorm = normalizeForMatch(p.name);
                  return pNorm.includes(fullNorm) || fullNorm.includes(pNorm);
                })) return true;
                // Also check by last name against party names
                return lastName.length >= 4 && c.parties.some((p) =>
                  p.name.toLowerCase().includes(lastName)
                );
              });
              if (candidates.length === 1) {
                caseId = candidates[0].id;
                caseTitle = candidates[0].title;
                matchedCaseNumber = candidates[0].caseNumber;
                matchMethod = "nameUnique";
              }
            }
          }
        }
      }

      const warnings: string[] = [];
      if (!caseId && caseNumberFromDesc) warnings.push("Case number not found in workspace");
      if (!caseId && !caseNumberFromDesc) warnings.push("No case match");

      const signature = importAs === "task"
        ? taskSignature({ title, dueDate: startParsed.date, caseId })
        : eventSignature({ title, startTime: startParsed.date, endTime: endDate, eventType, caseId });
      if (importAs === "task") {
        if (existingTaskSignatures.has(signature)) {
          skippedDuplicates++;
          continue;
        }
        existingTaskSignatures.add(signature);
      } else {
        if (existingEventSignatures.has(signature)) {
          skippedDuplicates++;
          continue;
        }
        existingEventSignatures.add(signature);
      }

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
        importAs,
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
      workspaceCases: cases.map((c) => ({ id: c.id, title: c.title, caseNumber: c.caseNumber })),
    });
  } catch (err) {
    console.error("Event import preview error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
