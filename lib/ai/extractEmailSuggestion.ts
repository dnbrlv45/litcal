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
  };
  missingFields: string[];
  dedupeKey: string;
}

const PROMPT_TEMPLATE = `You are reviewing litigation emails for a California personal injury law firm.

Analyze the email subject, sender, body, and ALL attachment text carefully.

Return a JSON ARRAY — one object per distinct finding. Follow these rules exactly:

STEP 1 — Check for a scheduled event: If any attachment is a deposition notice, hearing notice, or trial notice with a DATE and TIME, add one CALENDAR_EVENT item.

STEP 2 — Check for discovery documents SEPARATELY: Scan every attachment. If ANY attachment is form interrogatories, special interrogatories, requests for production, or requests for admission (even if the same email also has a deposition notice), add ONE DISCOVERY item covering all of them combined. Use the date from the proof of service as servedOrReceivedDate. Calculate responseDueDate as 30 days later.

STEP 3 — If BOTH steps produced an item, return an array of 2. Do not merge them into one.

Example: An email with [deposition notice, form interrogatories, special interrogatories, RFP] → return exactly [{CALENDAR_EVENT for deposition date}, {DISCOVERY for the interrogatories/RFP}].

Each item must have this exact structure:
{
  "classification": "",
  "confidence": 0,
  "case": {
    "plaintiff": null,
    "defendant": null,
    "caseNumber": null,
    "county": null,
    "court": null,
    "caseType": null,
    "defenseFirm": null,
    "defenseAttorney": null,
    "dateFiled": null
  },
  "event": {
    "eventType": null,
    "title": null,
    "date": null,
    "startTime": null,
    "endTime": null,
    "description": null,
    "location": null
  },
  "discovery": {
    "discoveryType": null,
    "direction": null,
    "servedOrReceivedDate": null,
    "responseDueDate": null
  },
  "discoveryExtension": {
    "newDate": null
  },
  "missingFields": [],
  "dedupeKey": ""
}

Classification rules — pick ONE per item:
- CALENDAR_EVENT: email or attachment contains a hearing, deposition, trial, CMC, MSC, IME, mediation, conference, or any scheduled court date
- DISCOVERY: email or attachment contains discovery documents served or received (interrogatories, requests for production, requests for admission, deposition notice as a served document)
- DISCOVERY_EXTENSION: email grants an extension for discovery response deadline
- NEW_CASE: email contains a new lawsuit, complaint, summons, or new case filing
- IGNORE: nothing needs to be calendared or tracked

IMPORTANT — Date and time extraction from attachments:
* Deposition notices contain the deposition date and time — look in attachment text for phrases like "the deposition of", "will be taken on", "scheduled for", followed by a date and time. Extract these exactly.
* Times are often written as "10:00 a.m.", "2:30 p.m." — convert to 24-hour HH:MM format (10:00, 14:30).
* All dates must be in YYYY-MM-DD format.
* If the date or time is in an attachment, it is still there — search thoroughly before returning null.
* Only return null for date/startTime if you truly cannot find it anywhere in the email or attachments.

Case extraction rules:
* plaintiff: the injured party — look before "v." or "vs." or labeled "Plaintiff"
* defendant: look after "v." or "vs." or labeled "Defendant"
* caseNumber: look for "Case No.", numbers like 24STCV01234 near a court name
* court: full name e.g. "Los Angeles Superior Court"
* county: derive from court name if not stated
* dateFiled: date complaint was filed — NOT a hearing date

Discovery extraction rules (for DISCOVERY items):
* discoveryType: one of FORM_INTERROGATORIES, SPECIAL_INTERROGATORIES, REQUESTS_FOR_PRODUCTION, REQUESTS_FOR_ADMISSION, DEPOSITION_NOTICE, OTHER
* direction: RECEIVED (opposing counsel sent it to us) or SERVED (we sent it to them)
* servedOrReceivedDate: date the discovery was served or received — YYYY-MM-DD
* responseDueDate: calculate 30 days from servedOrReceivedDate for standard discovery (California CCP §2030.260). Return YYYY-MM-DD.

Dedupe key rules:
* CALENDAR_EVENT: caseNumber|eventType|date|startTime
* DISCOVERY: caseNumber|discoveryType|direction|servedOrReceivedDate
* DISCOVERY_EXTENSION: caseNumber|DISCOVERY_EXTENSION|newDate
* NEW_CASE: caseNumber|NEW_CASE
* Use plaintiff+defendant if caseNumber is missing.

Do not guess. If a value is truly missing return null. Return the JSON array only — no explanation.`;

const VALID_CLASSIFICATIONS: AIClassification[] = [
  "CALENDAR_EVENT",
  "DISCOVERY",
  "DISCOVERY_EXTENSION",
  "NEW_CASE",
  "IGNORE",
];

const MAX_BODY_CHARS = 12_000;
const MAX_PDF_CHARS = 10_000;

export async function extractEmailSuggestion(params: {
  subject: string;
  sender: string;
  bodyText: string;
  attachmentTexts: string[];
}): Promise<EmailSuggestionResult[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const MODELS = [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
  ];

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

  let lastError: Error = new Error("All Gemini models failed");

  for (const modelName of MODELS) {
    try {
      const model = genai.getGenerativeModel({ model: modelName });
      const result = await model.generateContent([PROMPT_TEMPLATE, userContent]);
      const raw = result.response.text().trim();

      // Match a JSON array or single object
      const arrayMatch = raw.match(/\[[\s\S]*\]/);
      const objectMatch = raw.match(/\{[\s\S]*\}/);
      const jsonStr = arrayMatch?.[0] ?? (objectMatch ? `[${objectMatch[0]}]` : null);
      if (!jsonStr) throw new Error("Gemini returned no JSON");

      let parsed: EmailSuggestionResult[];
      try {
        const raw2 = JSON.parse(jsonStr);
        parsed = Array.isArray(raw2) ? raw2 : [raw2];
      } catch {
        throw new Error(`Gemini returned invalid JSON: ${raw.slice(0, 200)}`);
      }

      // Filter out IGNORE items and validate classifications
      const valid = parsed.filter((item) => {
        if (!VALID_CLASSIFICATIONS.includes(item.classification as AIClassification)) return false;
        if (item.classification === "IGNORE") return false;
        return true;
      });

      // Always return at least one item (even if everything was IGNORE)
      if (valid.length === 0) {
        return [{ ...parsed[0], classification: "IGNORE" }];
      }

      return valid;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const isRateLimit =
        lastError.message.includes("429") ||
        lastError.message.toLowerCase().includes("quota") ||
        lastError.message.toLowerCase().includes("rate");

      if (isRateLimit) {
        console.warn(`Gemini model ${modelName} rate limited, trying next fallback`);
        continue;
      }
      throw lastError;
    }
  }

  throw lastError;
}
