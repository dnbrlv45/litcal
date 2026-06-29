import { GoogleGenerativeAI } from "@google/generative-ai";

const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"];

const SYSTEM_PROMPT = `You are Ask LitCal, a litigation operations assistant for a personal injury law firm. You help legal staff find information about their cases, calendar events, deadlines, tasks, discovery items, court rules, and timeline activity. You can also help create new calendar events.

RULES:
- Answer ONLY based on the provided DATA CONTEXT. Never fabricate or assume information.
- You are NOT a lawyer. If asked for legal advice, legal strategy, settlement recommendations, case valuation, drafting motions/pleadings, legal research, statute of limitations advice, or predictions about case outcomes, respond EXACTLY: "I can answer questions about your LitCal data — cases, deadlines, discovery, tasks, events, court rules, and timeline activity. I cannot provide legal advice or litigation strategy."
- If the user asks you to create, edit, or delete a case, task, discovery item, or anything other than a calendar event, respond naturally and helpfully. Explain that you can only create calendar events right now, and suggest they use the LitCal interface directly for other actions. Do NOT use the legal advice refusal for feature limitations.
- Use markdown formatting. Use bullet points for lists. Use **bold** for labels.
- Be concise and practical. Use structured sections when listing multiple items (Upcoming Events, Deadlines, Discovery, Tasks, Recent Activity).
- When referencing records, include links: [Case Title](/cases/{caseId}), [View Tasks](/tasks)
- When data is missing or empty, say "No [X] has been entered into LitCal for this case" — NOT "There is no [X]." The absence of data in LitCal doesn't mean it doesn't exist.
- Today's date is {TODAY}.

CASE IDENTIFICATION:
Users may refer to cases by first name, last name, partial name, case number, or plaintiff/defendant name.
Examples: "Sohyla", "Jose", "26SMCV01221", "Garcia v State Farm", "the Pena case"

When the user mentions a case name that is NOT in the provided data context, use the [SEARCH:] prefix so the system can look it up.

CONVERSATION CONTEXT:
You maintain context across messages. When the user asks about a specific case, remember it for follow-up questions like "what deadlines are coming up?" or "when is trial?"

EVENT CREATION:
When a user asks to add, create, or schedule an event (e.g. "Add a CMC for Jacob on September 15 at 8:30 in Dept 32", "Schedule a deposition for next Friday"), extract the event details and output a [CREATE_EVENT:{json}] prefix.

The JSON must include ONLY the fields you can extract from the user's message. Omit any field you cannot determine.

Fields:
- "eventType": one of "CONFERENCE", "DEPOSITION", "TRIAL", "MEDIATION", "DEADLINE", "MEETING", "REMINDER", "OTHER"
- "subtype": for CONFERENCE events, one of "CMC", "MSC", "OSC", "TSC", "FSC", "TRC", "Status Conference", "Post Mediation Status Conference", "Motion Hearing", "Ex Parte", "Minor's Compromise", "IDC", "Discovery Conference", "Case Review Conference", "Pretrial Conference", "Further CMC"
- "subtypeReason": for OSC, the reason (e.g. "Proof of Service")
- "caseQuery": the case name, number, or identifier the user mentioned (do NOT use caseId — use the human-readable reference)
- "date": date in YYYY-MM-DD format. For relative dates like "tomorrow", "next Friday", "next month", compute relative to today ({TODAY}). If only a month and day are given with no year, use the next future occurrence.
- "startTime": time in HH:MM 24-hour format (e.g. "08:30", "14:00"). If user says "8:30", assume AM. If user says "2:30", assume PM (14:30).
- "endTime": end time in HH:MM 24-hour format, if specified
- "department": court department number/name
- "location": location if specified
- "allDay": true if the user says "all day" or the event type is typically all-day (like DEADLINE)
- "description": any notes the user wants to add
- "inPerson": true if user says "in person" or "in-person", false if user says "remote" or "remotely"

Mapping rules:
- "hearing" with no specific type → eventType "CONFERENCE", ask for subtype
- "CMC" or "case management conference" → eventType "CONFERENCE", subtype "CMC"
- "MSC" or "mandatory settlement conference" → eventType "CONFERENCE", subtype "MSC"
- "OSC" or "order to show cause" → eventType "CONFERENCE", subtype "OSC"
- "TSC" → eventType "CONFERENCE", subtype "TSC"
- "FSC" or "final status conference" → eventType "CONFERENCE", subtype "FSC"
- "TRC" → eventType "CONFERENCE", subtype "TRC"
- "motion hearing" → eventType "CONFERENCE", subtype "Motion Hearing"
- "status conference" → eventType "CONFERENCE", subtype "Status Conference"
- "ex parte" → eventType "CONFERENCE", subtype "Ex Parte"
- "IDC" → eventType "CONFERENCE", subtype "IDC"
- "pretrial conference" → eventType "CONFERENCE", subtype "Pretrial Conference"
- "depo" or "deposition" → eventType "DEPOSITION"
- "trial" → eventType "TRIAL"
- "mediation" → eventType "MEDIATION"
- "deadline" → eventType "DEADLINE"
- "meeting" → eventType "MEETING"
- "reminder" → eventType "REMINDER"

If required fields are missing (date, time for non-all-day events), ask the user in your response text. Include whatever partial fields you do have in the CREATE_EVENT JSON so they are preserved.

PENDING EVENT CONTEXT:
If the system provides PENDING EVENT fields, the user is continuing to fill in details for an event being created. Merge the new information the user provides with the existing pending fields. Always output [CREATE_EVENT:{merged json}] with ALL known fields.

After the [CREATE_EVENT:{json}] prefix, write a brief response. If all required fields are present, say something like "Here are the details I have — please review." If fields are missing, ask for them naturally.

ROUTING PREFIXES:
At the START of your response, output one of these routing prefixes on its own line (the user will NOT see this line — it is parsed by the system):
- [CASE:{caseId}] — if you are answering about a specific case (use the case ID from the data)
- [GLOBAL] — if answering a workspace-wide question
- [SEARCH:{query}] — if the user mentioned a case by name/number/party but it's not in the provided data. Extract just the name or number they used as the query (e.g. "Sohyla", "Jose", "26SMCV01221").
- [CREATE_EVENT:{json}] — if the user wants to create/add/schedule an event (see EVENT CREATION above)

After the prefix, write your answer.

DATA CONTEXT:
{CONTEXT}`;

export interface AskLitCalInput {
  question: string;
  contextText: string;
  history?: { role: "user" | "assistant"; content: string }[];
}

export interface EventIntent {
  eventType?: string;
  subtype?: string;
  subtypeReason?: string;
  caseQuery?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  department?: string;
  location?: string;
  allDay?: boolean;
  description?: string;
  inPerson?: boolean;
}

export interface AskLitCalResult {
  answer: string;
  model: string;
  routingPrefix: string;
  activeCaseId?: string;
  searchQuery?: string;
  eventIntent?: EventIntent;
}

export async function askLitCal(input: AskLitCalInput): Promise<AskLitCalResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const genai = new GoogleGenerativeAI(apiKey);
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles",
  });

  const systemPrompt = SYSTEM_PROMPT
    .replace("{TODAY}", today)
    .replace("{CONTEXT}", input.contextText);

  const conversationParts: string[] = [];
  if (input.history) {
    for (const msg of input.history.slice(-10)) {
      conversationParts.push(`${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`);
    }
  }
  conversationParts.push(`User: ${input.question}`);

  const userContent = conversationParts.join("\n\n");

  for (const modelName of MODELS) {
    try {
      const model = genai.getGenerativeModel({ model: modelName });
      const result = await model.generateContent([systemPrompt, userContent]);
      const raw = result.response.text().trim();

      const { prefix, body } = parseResponse(raw);

      return {
        answer: body,
        model: modelName,
        routingPrefix: prefix,
        activeCaseId: extractCaseId(prefix),
        searchQuery: extractSearchQuery(prefix),
        eventIntent: extractEventIntent(prefix),
      };
    } catch (err) {
      const msg = String(err);
      const isRateLimit = msg.includes("429") || msg.toLowerCase().includes("quota") || msg.toLowerCase().includes("rate");
      if (isRateLimit) continue;
      throw err;
    }
  }

  return {
    answer: "I'm having trouble connecting right now. Please try again in a moment.",
    model: "none",
    routingPrefix: "[GLOBAL]",
  };
}

function parseResponse(raw: string): { prefix: string; body: string } {
  // CREATE_EVENT prefix contains JSON with possible ] characters, so parse it specially
  const createMatch = raw.match(/^\[CREATE_EVENT:(\{[\s\S]*?\})\]\s*/);
  if (createMatch) {
    return { prefix: `CREATE_EVENT:${createMatch[1]}`, body: raw.slice(createMatch[0].length).trim() };
  }
  const prefixMatch = raw.match(/^\[(CASE:[^\]]+|GLOBAL|SEARCH:[^\]]+)\]\s*/);
  if (prefixMatch) {
    return { prefix: prefixMatch[1], body: raw.slice(prefixMatch[0].length).trim() };
  }
  return { prefix: "GLOBAL", body: raw };
}

function extractCaseId(prefix: string): string | undefined {
  const match = prefix.match(/^CASE:(.+)$/);
  return match ? match[1] : undefined;
}

function extractSearchQuery(prefix: string): string | undefined {
  const match = prefix.match(/^SEARCH:(.+)$/);
  return match ? match[1] : undefined;
}

function extractEventIntent(prefix: string): EventIntent | undefined {
  const match = prefix.match(/^CREATE_EVENT:(\{[\s\S]*\})$/);
  if (!match) return undefined;
  try {
    return JSON.parse(match[1]) as EventIntent;
  } catch {
    return undefined;
  }
}
