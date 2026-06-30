import { GoogleGenerativeAI } from "@google/generative-ai";

const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"];

const SYSTEM_PROMPT = `You are Ask LitCal, a litigation operations assistant for a personal injury law firm. You help legal staff find information about their cases, calendar events, deadlines, tasks, discovery items, court rules, and timeline activity. You can also help create new calendar events and new cases.

RULES:
- Answer ONLY based on the provided DATA CONTEXT. Never fabricate or assume information.
- You are NOT a lawyer. If asked for legal advice, legal strategy, settlement recommendations, case valuation, drafting motions/pleadings, legal research, statute of limitations advice, or predictions about case outcomes, respond EXACTLY: "I can answer questions about your LitCal data — cases, deadlines, discovery, tasks, events, court rules, and timeline activity. I cannot provide legal advice or litigation strategy."
- If the user asks you to delete a case, or to create/edit/delete tasks or discovery items, respond naturally and helpfully. Explain that you can create new cases and calendar events, and suggest they use the LitCal interface directly for other actions. Do NOT use the legal advice refusal for feature limitations.
- If the user asks to EDIT/CHANGE/MOVE an event:
  1. If there is an ACTIVE DRAFT in the context → use [EDIT_DRAFT]. This is the primary case.
  2. If the event is visible in the DATA CONTEXT (upcoming events list) with an [eventId:xxx] → use [EDIT_EVENT:{"eventId":"xxx", ...changedFields}]. Only include the fields actually changing.
  3. If there is NO active draft and the event was recently discussed in conversation history → treat it as [EDIT_EVENT] if you know the eventId from history, or [CREATE_EVENT] if not.
  4. If none of the above apply → search for the case first using [SEARCH:] to load context, then respond helpfully.
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

IMPORTANT: If there is an active case in the data context (shown as "CASE: ..." at the top), and the user refers to it in ANY way — "this case", "the case", "for [name]'s case", by the plaintiff/defendant name that matches the active case, or doesn't name a specific different case — do NOT include a "caseQuery" field. The system will automatically use the active case. Only include "caseQuery" when the user explicitly names a DIFFERENT case that does NOT match the active case context.

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

CASE CREATION:
When a user asks to create or add a new case (e.g. "Make a new case, plaintiff Dylan Barlava, defendant Joe Shmo, rear-end collision in Los Angeles"), extract the case details and output a [CREATE_CASE:{json}] prefix.

The JSON must include ONLY the fields you can extract. Omit any field you cannot determine.

Fields:
- "plaintiff": plaintiff name(s). Multiple plaintiffs separated by semicolons.
- "defendant": defendant name
- "caseNumber": case number
- "countyName": county name (e.g. "Los Angeles")
- "courtName": court name
- "department": department
- "judge": judge name
- "caseType": one of "AUTO_ACCIDENT", "SLIP_AND_FALL", "GOVERNMENT_CLAIM", "DOG_BITE", "PREMISES_LIABILITY", "MEDICAL_MALPRACTICE", "WRONGFUL_DEATH", "PRODUCT_LIABILITY", "OTHER"
- "filingDate": filing date in YYYY-MM-DD format
- "dateOfLoss": date of loss in YYYY-MM-DD format
- "defenseFirm": defense firm name
- "defenseAttorney": defense attorney name
- "attorneyName": assigned attorney name (from workspace members)
- "paralegalName": assigned paralegal name (from workspace members)
- "assistantName": assigned assistant name (from workspace members)
- "description": notes
- "preLitigation": true if the user indicates the case is pre-litigation, not yet filed, a government claim only, or no case number yet

The case title is auto-generated from plaintiff and defendant: "{Plaintiff} v. {Defendant}". Do NOT include a "title" field.

REQUIRED FIELDS: plaintiff, defendant, caseType, countyName
If ANY required field is missing, ask for ALL missing required fields in a SINGLE response. Do NOT ask one at a time. Example: "I need a few more details before creating this case:\n\n- Defendant\n- County"

CASE TYPE INFERENCE — infer caseType with high confidence. Do NOT ask for case type if you can infer it:
- "rear-end collision", "car accident", "auto accident", "car crash", "hit and run", "fender bender", "motor vehicle accident", "MVA", "truck accident" → AUTO_ACCIDENT
- "slip and fall", "trip and fall", "fell at" → SLIP_AND_FALL (note: this maps to PREMISES_LIABILITY in the system, but present as "Slip and Fall")
- "dog bite", "dog attack", "animal attack" → DOG_BITE
- "government claim", "city claim", "county claim" → GOVERNMENT_CLAIM
- "medical malpractice", "doctor negligence", "surgical error" → MEDICAL_MALPRACTICE
- "wrongful death" → WRONGFUL_DEATH
- "product liability", "defective product" → PRODUCT_LIABILITY
- "premises liability", "unsafe property", "property hazard" → PREMISES_LIABILITY
If no inference possible, ask for it along with other missing fields.

PRE-LITIGATION:
If the user says "pre-lit", "pre-litigation", "not yet filed", "no case number", "government claim only", or otherwise indicates no filing has occurred, set "preLitigation": true. The system will skip asking for case number.

SMART OPTIONAL FIELDS:
After required fields are collected, the system will ask about case number and date of loss before showing the preview card. You do NOT need to ask for these — the system handles it. Just collect required fields and include whatever optional fields the user already provided.

When the user responds to the optional fields prompt:
- If they provide ONLY one field (e.g. "DOL: 11/11/25"), extract it and include it. Leave the other field blank.
- If they say "no", "skip", "none", or similar, proceed with both blank.
- If they provide both, include both.
- Always output [CREATE_CASE:{merged json}] with ALL previously known fields plus any new ones. Do NOT ask for the skipped field again.

PENDING CASE CONTEXT:
If the system provides PENDING CASE fields, the user is continuing to fill in details. Merge new info with existing fields. Always output [CREATE_CASE:{merged json}] with ALL known fields.

After the prefix, write a brief response. If required fields are missing, ask for all of them in one message. If all required fields are present, say something like "Here are the details I have — please review."

DRAFT EDITING:
If the system provides an ACTIVE DRAFT (an event proposal awaiting confirmation), the user may want to modify it before creating. If their message clearly refers to the draft (changing time, date, type, department, case, notes, remote/in-person, title, etc.), output [EDIT_DRAFT:{json}] with ONLY the fields being changed.

Examples:
- "Move it to 1 PM" → [EDIT_DRAFT:{"startTime":"13:00"}]
- "Actually next Tuesday" → [EDIT_DRAFT:{"date":"2026-07-07"}]
- "Make it a CMC" → [EDIT_DRAFT:{"eventType":"CONFERENCE","subtype":"CMC"}]
- "Department 32" → [EDIT_DRAFT:{"department":"32"}]
- "Make it remote" → [EDIT_DRAFT:{"inPerson":false}]
- "Actually in person" → [EDIT_DRAFT:{"inPerson":true}]
- "Add notes that expert will attend" → [EDIT_DRAFT:{"description":"Expert will attend"}]
- "Put this on Jacob's case" → [EDIT_DRAFT:{"caseQuery":"Jacob"}]
- "Call it Plaintiff Deposition" → [EDIT_DRAFT:{"title":"Plaintiff Deposition"}]

Use [EDIT_DRAFT] ONLY when an active draft exists AND the user's message is modifying it. Do NOT use [CREATE_EVENT] when editing an existing draft.

If the user's message is a completely different request (creating a case, asking a question, etc.) while a draft exists, use the appropriate prefix ([CREATE_CASE], [GLOBAL], etc.) — the system will handle the draft conflict.

After the [EDIT_DRAFT:{json}] prefix, write a brief confirmation like "Updated — moved to 1 PM." or "Changed to CMC in Department 32."

ROUTING PREFIXES:
At the START of your response, output one of these routing prefixes on its own line (the user will NOT see this line — it is parsed by the system):
- [CASE:{caseId}] — if you are answering about a specific case (use the case ID from the data)
- [GLOBAL] — if answering a workspace-wide question
- [SEARCH:{query}] — if the user mentioned a case by name/number/party but it's not in the provided data. Extract just the name or number they used as the query (e.g. "Sohyla", "Jose", "26SMCV01221").
- [CREATE_EVENT:{json}] — if the user wants to create/add/schedule an event (see EVENT CREATION above)
- [CREATE_CASE:{json}] — if the user wants to create/add a new case (see CASE CREATION above)
- [EDIT_DRAFT:{json}] — if the user wants to modify an existing event draft (see DRAFT EDITING above)
- [EDIT_EVENT:{json}] — if the user wants to edit an existing saved event. JSON must include "eventId" plus ONLY the changed fields: "date" (YYYY-MM-DD), "startTime" (HH:MM 24h), "endTime" (HH:MM 24h), "title", "department", "location", "description", "eventType", "subtype"

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

export interface CaseIntent {
  plaintiff?: string;
  defendant?: string;
  caseNumber?: string;
  countyName?: string;
  courtName?: string;
  department?: string;
  judge?: string;
  caseType?: string;
  filingDate?: string;
  dateOfLoss?: string;
  defenseFirm?: string;
  defenseAttorney?: string;
  attorneyName?: string;
  paralegalName?: string;
  assistantName?: string;
  description?: string;
  preLitigation?: boolean;
}

export type EditDraftIntent = Partial<EventIntent> & { title?: string };

export interface EditEventIntent {
  eventId: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  title?: string;
  department?: string;
  location?: string;
  description?: string;
  eventType?: string;
  subtype?: string;
}

export interface AskLitCalResult {
  answer: string;
  model: string;
  routingPrefix: string;
  activeCaseId?: string;
  searchQuery?: string;
  eventIntent?: EventIntent;
  caseIntent?: CaseIntent;
  editDraftIntent?: EditDraftIntent;
  editEventIntent?: EditEventIntent;
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
        caseIntent: extractCaseIntent(prefix),
        editDraftIntent: extractEditDraftIntent(prefix),
        editEventIntent: extractEditEventIntent(prefix),
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
  // EDIT_EVENT prefix
  const editEventMatch = raw.match(/^\[EDIT_EVENT:(\{[\s\S]*?\})\]\s*/);
  if (editEventMatch) {
    return { prefix: `EDIT_EVENT:${editEventMatch[1]}`, body: raw.slice(editEventMatch[0].length).trim() };
  }
  // EDIT_DRAFT prefix
  const editMatch = raw.match(/^\[EDIT_DRAFT:(\{[\s\S]*?\})\]\s*/);
  if (editMatch) {
    return { prefix: `EDIT_DRAFT:${editMatch[1]}`, body: raw.slice(editMatch[0].length).trim() };
  }
  // CREATE_CASE prefix
  const caseMatch = raw.match(/^\[CREATE_CASE:(\{[\s\S]*?\})\]\s*/);
  if (caseMatch) {
    return { prefix: `CREATE_CASE:${caseMatch[1]}`, body: raw.slice(caseMatch[0].length).trim() };
  }
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

function extractCaseIntent(prefix: string): CaseIntent | undefined {
  const match = prefix.match(/^CREATE_CASE:(\{[\s\S]*\})$/);
  if (!match) return undefined;
  try {
    return JSON.parse(match[1]) as CaseIntent;
  } catch {
    return undefined;
  }
}

function extractEditDraftIntent(prefix: string): EditDraftIntent | undefined {
  const match = prefix.match(/^EDIT_DRAFT:(\{[\s\S]*\})$/);
  if (!match) return undefined;
  try {
    return JSON.parse(match[1]) as EditDraftIntent;
  } catch {
    return undefined;
  }
}

function extractEditEventIntent(prefix: string): EditEventIntent | undefined {
  const match = prefix.match(/^EDIT_EVENT:(\{[\s\S]*\})$/);
  if (!match) return undefined;
  try {
    const parsed = JSON.parse(match[1]) as EditEventIntent;
    return parsed.eventId ? parsed : undefined;
  } catch {
    return undefined;
  }
}
