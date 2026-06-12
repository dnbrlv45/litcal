import { GoogleGenerativeAI } from "@google/generative-ai";

export type AIClassification = "CALENDAR_EVENT" | "DISCOVERY_EXTENSION" | "NEW_CASE" | "IGNORE";

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
  discoveryExtension: {
    newDate: string | null;
  };
  missingFields: string[];
  dedupeKey: string;
}

const PROMPT_TEMPLATE = `You are reviewing litigation emails for a California personal injury law firm.

Analyze the email subject, email body, and attachment text.

Return JSON only.

Classify the email as one of:
CALENDAR_EVENT
DISCOVERY_EXTENSION
NEW_CASE
IGNORE

Do not guess. If a value is missing, return null.

Important rules:
* Discovery is tracked as one case-level deadline.
* Do not identify separate discovery types like Form Interrogatories, RFAs, or RFPs.
* If an email grants an extension for discovery responses, classify it as DISCOVERY_EXTENSION.
* If the email or attachment contains a hearing, deposition, mediation, trial, CMC, MSC, IME, conference, or deadline, classify it as CALENDAR_EVENT.
* If the email contains a new lawsuit, complaint, summons, or new case information, classify it as NEW_CASE.
* If nothing needs to be calendared or created, classify as IGNORE.

Return this exact JSON structure:

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
  "discoveryExtension": {
    "newDate": null
  },
  "missingFields": [],
  "dedupeKey": ""
}

Dedupe key rules:
* For calendar events: caseNumber|eventType|date|startTime
* For discovery extensions: caseNumber|DISCOVERY_EXTENSION|newDate
* For new cases: caseNumber|NEW_CASE
* If caseNumber is missing, use plaintiff + defendant when available.
* If there is not enough information, still return a best-effort dedupeKey using available stable fields.
* Never include random or guessed information.`;

const VALID_CLASSIFICATIONS: AIClassification[] = [
  "CALENDAR_EVENT",
  "DISCOVERY_EXTENSION",
  "NEW_CASE",
  "IGNORE",
];

const MAX_BODY_CHARS = 12_000;
const MAX_PDF_CHARS = 8_000;

export async function extractEmailSuggestion(params: {
  subject: string;
  sender: string;
  bodyText: string;
  attachmentTexts: string[];
}): Promise<EmailSuggestionResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const genai = new GoogleGenerativeAI(apiKey);
  const model = genai.getGenerativeModel({ model: "gemini-1.5-flash" });

  const body = params.bodyText.slice(0, MAX_BODY_CHARS);
  const attachments = params.attachmentTexts
    .map((t, i) => `--- Attachment ${i + 1} ---\n${t.slice(0, MAX_PDF_CHARS)}`)
    .join("\n\n");

  const userContent = `Subject: ${params.subject}
From: ${params.sender}

Email Body:
${body}

${attachments ? `Attachments:\n${attachments}` : ""}`;

  const result = await model.generateContent([PROMPT_TEMPLATE, userContent]);
  const raw = result.response.text().trim();

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Gemini returned no JSON");

  let parsed: EmailSuggestionResult;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error(`Gemini returned invalid JSON: ${raw.slice(0, 200)}`);
  }

  if (!VALID_CLASSIFICATIONS.includes(parsed.classification as AIClassification)) {
    throw new Error(`Gemini returned invalid classification: ${parsed.classification}`);
  }

  return parsed;
}
