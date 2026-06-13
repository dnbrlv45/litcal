import { GoogleGenerativeAI } from "@google/generative-ai";

export type AIClassification = "CALENDAR_EVENT" | "DISCOVERY" | "DISCOVERY_EXTENSION" | "NEW_CASE" | "IGNORE";

export interface EmailSuggestionResult {
  classification: AIClassification;
  confidence: number;
  case: {
    plaintiff: string | null;
    defendant: string | null;
    caseNumber: string | null;
    county: string | null;
    court: string | null;
    caseType: string | null;
    defenseFirm: string | null;
    defenseAttorney: string | null;
    dateFiled: string | null;
  };
  event: {
    eventType: string | null;
    title: string | null;
    date: string | null;
    startTime: string | null;
    endTime: string | null;
    description: string | null;
    location: string | null;
  };
  discovery: {
    discoveryType: string | null;
    direction: string | null;
    servedOrReceivedDate: string | null;
    responseDueDate: string | null;
  };
  discoveryExtension: {
    newDate: string | null;
    mutual: boolean | null;
    appliesTo: "OUR_DEADLINE" | "OPPOSING_DEADLINE" | "BOTH" | null;
  };
  missingFields: string[];
  dedupeKey: string;
}

const CASE_SCHEMA = `"case": {
  "plaintiff": null,      // injured party, before "v." or labeled Plaintiff
  "defendant": null,      // after "v." or labeled Defendant
  "caseNumber": null,     // e.g. 25NVVCV03295
  "county": null,
  "court": null,          // full name e.g. "Los Angeles Superior Court"
  "caseType": null,
  "defenseFirm": null,
  "defenseAttorney": null,
  "dateFiled": null       // date complaint filed — NOT a hearing date, YYYY-MM-DD
}`;

const CALENDAR_PROMPT = `You are a California litigation assistant. Extract calendar events from this email.

Look for: depositions, hearings, trials, CMC, MSC, IME, mediations, or any scheduled court date in the email body or attachments.

If a scheduled event is found, return this JSON object (not an array):
{
  "found": true,
  "classification": "CALENDAR_EVENT",
  "confidence": 0.95,
  ${CASE_SCHEMA},
  "event": {
    "eventType": null,   // DEPOSITION, HEARING, TRIAL, CONFERENCE, MEDIATION, DEADLINE, OTHER
    "title": null,
    "date": null,        // YYYY-MM-DD
    "startTime": null,   // HH:MM 24-hour (convert "10:00 a.m." → "10:00", "2:30 p.m." → "14:30")
    "endTime": null,
    "description": null,
    "location": null
  },
  "missingFields": [],
  "dedupeKey": ""        // caseNumber|eventType|date|startTime
}

If NO scheduled event is found, return: {"found": false}

Return JSON only. No explanation.`;

const DISCOVERY_PROMPT = `You are a California litigation assistant. Extract discovery documents from this email.

Look for: form interrogatories, special interrogatories, requests for production of documents, requests for admission. These are discovery documents served between parties — NOT a deposition notice (that is a calendar event, not discovery).

If discovery documents are found, return this JSON object (not an array):
{
  "found": true,
  "classification": "DISCOVERY",
  "confidence": 0.95,
  ${CASE_SCHEMA},
  "discovery": {
    "discoveryType": null,         // FORM_INTERROGATORIES, SPECIAL_INTERROGATORIES, REQUESTS_FOR_PRODUCTION, REQUESTS_FOR_ADMISSION, OTHER — use the primary type if multiple
    "direction": null,             // RECEIVED (opposing counsel sent to us) or SERVED (we sent to them)
    "servedOrReceivedDate": null,  // from proof of service, YYYY-MM-DD
    "responseDueDate": null        // 30 days after servedOrReceivedDate per CCP §2030.260, YYYY-MM-DD
  },
  "missingFields": [],
  "dedupeKey": ""   // caseNumber|DISCOVERY|direction|servedOrReceivedDate
}

If NO discovery documents are found, return: {"found": false}

Return JSON only. No explanation.`;

const GENERAL_PROMPT = `You are a California litigation assistant. Classify this email.

Determine if it contains:
- DISCOVERY_EXTENSION: an email granting an extension for a discovery response deadline
- NEW_CASE: a new lawsuit, complaint, summons, or new case filing
- IGNORE: nothing that needs to be calendared or tracked

If it matches one of the above, return this JSON object:
{
  "found": true,
  "classification": "DISCOVERY_EXTENSION" | "NEW_CASE" | "IGNORE",
  "confidence": 0.9,
  ${CASE_SCHEMA},
  "discoveryExtension": {
    "newDate": null,    // YYYY-MM-DD, only for DISCOVERY_EXTENSION
    "mutual": false,    // true if both sides get the extension, false if only one side
    "appliesTo": null   // "OUR_DEADLINE", "OPPOSING_DEADLINE", or "BOTH" — if mutual set "BOTH"
  },
  "missingFields": [],
  "dedupeKey": ""
}

If none of the above apply (e.g. it's a calendar event or discovery — those are handled separately), return: {"found": false}

Return JSON only. No explanation.`;

const EMPTY_RESULT: Omit<EmailSuggestionResult, "classification" | "confidence" | "dedupeKey"> = {
  case: { plaintiff: null, defendant: null, caseNumber: null, county: null, court: null, caseType: null, defenseFirm: null, defenseAttorney: null, dateFiled: null },
  event: { eventType: null, title: null, date: null, startTime: null, endTime: null, description: null, location: null },
  discovery: { discoveryType: null, direction: null, servedOrReceivedDate: null, responseDueDate: null },
  discoveryExtension: { newDate: null, mutual: null, appliesTo: null },
  missingFields: [],
};

const VALID_CLASSIFICATIONS: AIClassification[] = ["CALENDAR_EVENT", "DISCOVERY", "DISCOVERY_EXTENSION", "NEW_CASE", "IGNORE"];

const MAX_BODY_CHARS = 12_000;
const MAX_PDF_CHARS = 10_000;

async function callGemini(genai: GoogleGenerativeAI, prompt: string, userContent: string): Promise<Record<string, unknown> | null> {
  const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"];

  for (const modelName of MODELS) {
    try {
      const model = genai.getGenerativeModel({ model: modelName });
      const result = await model.generateContent([prompt, userContent]);
      const raw = result.response.text().trim();
      const objectMatch = raw.match(/\{[\s\S]*\}/);
      if (!objectMatch) continue;
      return JSON.parse(objectMatch[0]) as Record<string, unknown>;
    } catch (err) {
      const msg = String(err);
      const isRateLimit = msg.includes("429") || msg.toLowerCase().includes("quota") || msg.toLowerCase().includes("rate");
      if (isRateLimit) continue;
      throw err;
    }
  }
  return null;
}

export async function extractEmailSuggestion(params: {
  subject: string;
  sender: string;
  bodyText: string;
  attachmentTexts: string[];
}): Promise<EmailSuggestionResult[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const genai = new GoogleGenerativeAI(apiKey);

  const body = params.bodyText.slice(0, MAX_BODY_CHARS);
  const attachments = params.attachmentTexts
    .map((t, i) => `--- Attachment ${i + 1} ---\n${t.slice(0, MAX_PDF_CHARS)}`)
    .join("\n\n");

  const userContent = `Subject: ${params.subject}
From: ${params.sender}

Email Body:
${body}

${attachments ? `Attachments:\n${attachments}` : ""}`;

  // Run all three focused calls in parallel
  const [calendarRaw, discoveryRaw, generalRaw] = await Promise.all([
    callGemini(genai, CALENDAR_PROMPT, userContent),
    callGemini(genai, DISCOVERY_PROMPT, userContent),
    callGemini(genai, GENERAL_PROMPT, userContent),
  ]);

  const results: EmailSuggestionResult[] = [];

  if (calendarRaw?.found) {
    results.push({
      ...EMPTY_RESULT,
      ...(calendarRaw as Partial<EmailSuggestionResult>),
      classification: "CALENDAR_EVENT",
      confidence: (calendarRaw.confidence as number) ?? 0.9,
      dedupeKey: (calendarRaw.dedupeKey as string) ?? "",
      case: (calendarRaw.case as EmailSuggestionResult["case"]) ?? EMPTY_RESULT.case,
      event: (calendarRaw.event as EmailSuggestionResult["event"]) ?? EMPTY_RESULT.event,
      missingFields: (calendarRaw.missingFields as string[]) ?? [],
    });
  }

  if (discoveryRaw?.found) {
    results.push({
      ...EMPTY_RESULT,
      ...(discoveryRaw as Partial<EmailSuggestionResult>),
      classification: "DISCOVERY",
      confidence: (discoveryRaw.confidence as number) ?? 0.9,
      dedupeKey: (discoveryRaw.dedupeKey as string) ?? "",
      case: (discoveryRaw.case as EmailSuggestionResult["case"]) ?? EMPTY_RESULT.case,
      discovery: (discoveryRaw.discovery as EmailSuggestionResult["discovery"]) ?? EMPTY_RESULT.discovery,
      missingFields: (discoveryRaw.missingFields as string[]) ?? [],
    });
  }

  if (generalRaw?.found) {
    const cls = generalRaw.classification as AIClassification;
    if (VALID_CLASSIFICATIONS.includes(cls) && cls !== "IGNORE") {
      results.push({
        ...EMPTY_RESULT,
        ...(generalRaw as Partial<EmailSuggestionResult>),
        classification: cls,
        confidence: (generalRaw.confidence as number) ?? 0.9,
        dedupeKey: (generalRaw.dedupeKey as string) ?? "",
        case: (generalRaw.case as EmailSuggestionResult["case"]) ?? EMPTY_RESULT.case,
        discoveryExtension: (generalRaw.discoveryExtension as EmailSuggestionResult["discoveryExtension"]) ?? EMPTY_RESULT.discoveryExtension,
        missingFields: (generalRaw.missingFields as string[]) ?? [],
      });
    }
  }

  if (results.length === 0) {
    return [{ ...EMPTY_RESULT, classification: "IGNORE", confidence: 1, dedupeKey: "" }];
  }

  return results;
}
