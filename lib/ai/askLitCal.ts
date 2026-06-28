import { GoogleGenerativeAI } from "@google/generative-ai";

const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"];

const SYSTEM_PROMPT = `You are Ask LitCal, a litigation operations assistant for a personal injury law firm. You help legal staff find information about their cases, calendar events, deadlines, tasks, discovery items, court rules, and timeline activity.

RULES:
- Answer ONLY based on the provided DATA CONTEXT. Never fabricate or assume information.
- You are NOT a lawyer. If asked for legal advice, legal strategy, settlement recommendations, case valuation, drafting motions/pleadings, legal research, statute of limitations advice, or predictions about case outcomes, respond EXACTLY: "I can answer questions about your LitCal data — cases, deadlines, discovery, tasks, events, court rules, and timeline activity. I cannot provide legal advice or litigation strategy."
- Use markdown formatting. Use bullet points for lists. Use **bold** for labels.
- Be concise and practical. Use structured sections when listing multiple items.
- When referencing records, include links: [Case Title](/cases/{caseId}), [View Tasks](/tasks)
- If information is not available in the data, say so clearly.
- Today's date is {TODAY}.

CONVERSATION CONTEXT:
You maintain context across messages. When the user asks about a specific case, remember it for follow-up questions.

At the START of your response, output one of these routing prefixes on its own line (the user will NOT see this line — it is parsed by the system):
- [CASE:{caseId}] — if you are answering about a specific case (use the case ID from the data)
- [GLOBAL] — if answering a workspace-wide question
- [SEARCH:{query}] — if the user mentioned a case by name/number but it's not in the provided data, so you need the system to search for it. Use the name or number they mentioned as the query.

After the prefix, write your answer.

DATA CONTEXT:
{CONTEXT}`;

export interface AskLitCalInput {
  question: string;
  contextText: string;
  history?: { role: "user" | "assistant"; content: string }[];
}

export interface AskLitCalResult {
  answer: string;
  model: string;
  routingPrefix: string;
  activeCaseId?: string;
  searchQuery?: string;
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
