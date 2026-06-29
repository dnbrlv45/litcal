"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { X, Send, Loader2, MessageSquare, Sparkles, CalendarPlus, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useAskLitCal } from "./AskLitCalContext";

interface EventIntent {
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

interface ProposedEvent {
  title: string;
  eventType: string;
  subtype: string | null;
  subtypeReason: string | null;
  date: string;
  startTime: string | null;
  endTime: string | null;
  startISO: string;
  endISO: string;
  allDay: boolean;
  department: string | null;
  location: string | null;
  description: string | null;
  inPerson: boolean;
  caseId: string | null;
  caseName: string | null;
  caseNumber: string | null;
  county: string | null;
  court: string | null;
  conflicts: { eventId: string; title: string; startTime: string; endTime: string; attorneyName: string }[];
  rulePreview: { appearanceType: string | null; requestRequired: boolean } | null;
  displayTime: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  caseMatches?: { id: string; title: string; caseNumber: string | null }[];
  proposedEvent?: ProposedEvent;
}

const CASE_PROMPTS = [
  "What is going on in this case?",
  "What deadlines are coming up?",
  "What discovery is outstanding?",
  "What tasks are open?",
  "When is trial?",
  "What changed recently?",
];

const GLOBAL_PROMPTS = [
  "What deadlines are due this week?",
  "Which tasks are overdue?",
  "Which trials are coming up?",
  "What events do we have this week?",
];

function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-teal-700 underline hover:text-teal-900">$1</a>')
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul class="list-disc pl-4 space-y-0.5">${m}</ul>`)
    .replace(/^### (.+)$/gm, '<h3 class="font-bold text-slate-900 mt-3 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="font-bold text-slate-900 text-base mt-3 mb-1">$1</h2>')
    .replace(/\n\n/g, "<br/><br/>")
    .replace(/\n/g, "<br/>");
}

function formatDateDisplay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export default function AskLitCalPanel() {
  const { open, caseId, closePanel } = useAskLitCal();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [pendingEvent, setPendingEvent] = useState<EventIntent | null>(null);
  const [creatingEvent, setCreatingEvent] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevOpenRef = useRef(false);

  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setMessages([]);
      setActiveCaseId(caseId);
      setInput("");
      setPendingEvent(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
    prevOpenRef.current = open;
  }, [open, caseId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch("/api/ask-litcal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: text,
          activeCaseId: activeCaseId,
          history,
          pendingEvent: pendingEvent ?? undefined,
        }),
      });
      const data = await res.json() as {
        answer?: string;
        activeCaseId?: string | null;
        caseMatches?: { id: string; title: string; caseNumber: string | null }[] | null;
        pendingEvent?: EventIntent | null;
        proposedEvent?: ProposedEvent | null;
        error?: string;
      };

      if (!res.ok) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.error ?? "Something went wrong." }]);
        return;
      }

      if (data.activeCaseId) setActiveCaseId(data.activeCaseId);

      // Track pending event state for multi-turn collection
      if (data.pendingEvent) {
        setPendingEvent(data.pendingEvent);
      } else if (data.proposedEvent) {
        setPendingEvent(null);
      }

      setMessages((prev) => [...prev, {
        role: "assistant",
        content: data.answer ?? "No response.",
        caseMatches: data.caseMatches ?? undefined,
        proposedEvent: data.proposedEvent ?? undefined,
      }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Failed to connect. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }, [loading, messages, activeCaseId, pendingEvent]);

  const confirmEvent = useCallback(async (proposed: ProposedEvent) => {
    setCreatingEvent(true);
    try {
      const res = await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: proposed.title,
          start: proposed.startISO,
          end: proposed.endISO,
          timeZone: "America/Los_Angeles",
          eventType: proposed.eventType,
          subtype: proposed.subtype ?? undefined,
          subtypeReason: proposed.subtypeReason ?? undefined,
          caseId: proposed.caseId ?? undefined,
          department: proposed.department ?? undefined,
          location: proposed.location ?? undefined,
          description: proposed.description ?? undefined,
          allDay: proposed.allDay,
          inPerson: proposed.inPerson,
          countyName: proposed.county ?? undefined,
          courtName: proposed.court ?? undefined,
        }),
      });
      const data = await res.json() as { event?: { id: string }; error?: string };

      if (!res.ok) {
        setMessages((prev) => [...prev, { role: "assistant", content: `Failed to create event: ${data.error ?? "Unknown error"}` }]);
        return;
      }

      setPendingEvent(null);
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: `**Event created successfully!** "${proposed.title}" has been added to LitCal. All automations (court rules, Google Calendar sync, reminders, and timeline) have been applied.`,
      }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Failed to create event. Please try again." }]);
    } finally {
      setCreatingEvent(false);
    }
  }, []);

  const cancelEvent = useCallback(() => {
    setPendingEvent(null);
    setMessages((prev) => [...prev, { role: "assistant", content: "Event creation cancelled." }]);
  }, []);

  function handleCaseSelect(id: string) {
    setActiveCaseId(id);
    if (pendingEvent) {
      setPendingEvent({ ...pendingEvent, caseQuery: undefined });
      sendMessage(`Use this case.`);
    } else {
      sendMessage(`Tell me about this case.`);
    }
  }

  if (!open) return null;

  const suggestedPrompts = activeCaseId ? CASE_PROMPTS : GLOBAL_PROMPTS;

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex flex-col w-full sm:w-[420px] bg-white border-l border-slate-200 shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50 shrink-0">
        <div className="flex items-center gap-2">
          <div className="grid size-8 place-items-center rounded-lg bg-teal-50 text-teal-700">
            <Sparkles className="size-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">Ask LitCal</h2>
            {activeCaseId && (
              <p className="text-[11px] text-teal-700 font-medium truncate max-w-[260px]">
                Active case context
              </p>
            )}
          </div>
        </div>
        <button onClick={closePanel} className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
          <X className="size-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <div className="grid size-12 place-items-center rounded-full bg-teal-50">
              <MessageSquare className="size-6 text-teal-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">Ask me anything about your cases</p>
              <p className="mt-1 text-xs text-slate-500">I can look up deadlines, events, discovery, tasks, and more.</p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center mt-2">
              {suggestedPrompts.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => sendMessage(prompt)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-teal-50 hover:border-teal-200 hover:text-teal-800 transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm ${
              msg.role === "user"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-800"
            }`}>
              {msg.role === "assistant" ? (
                <div>
                  <div
                    className="prose prose-sm max-w-none [&_ul]:my-1 [&_li]:my-0 [&_a]:text-teal-700"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                  />
                  {msg.caseMatches && msg.caseMatches.length > 0 && (
                    <div className="mt-3 flex flex-col gap-1.5">
                      {msg.caseMatches.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => handleCaseSelect(c.id)}
                          className="w-full text-left rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs hover:bg-teal-50 hover:border-teal-200 transition-colors"
                        >
                          <span className="font-semibold text-slate-800">{c.title}</span>
                          {c.caseNumber && <span className="text-slate-400 ml-1">#{c.caseNumber}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  {msg.proposedEvent && (
                    <EventPreviewCard
                      event={msg.proposedEvent}
                      onConfirm={() => confirmEvent(msg.proposedEvent!)}
                      onCancel={cancelEvent}
                      creating={creatingEvent}
                    />
                  )}
                </div>
              ) : (
                <span>{msg.content}</span>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-xl bg-slate-100 px-3.5 py-2.5 text-sm text-slate-500">
              <Loader2 className="size-3.5 animate-spin" />
              Thinking...
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-slate-200 px-4 py-3 bg-white">
        <form
          onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
          className="flex items-center gap-2"
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about a case, deadline, event..."
            disabled={loading || creatingEvent}
            className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-300 focus:ring-1 focus:ring-teal-200 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !input.trim() || creatingEvent}
            className="grid size-9 place-items-center rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40 transition-colors shrink-0"
          >
            <Send className="size-4" />
          </button>
        </form>
        <p className="mt-1.5 text-[10px] text-slate-400 text-center">
          Ask LitCal reads your data. It does not provide legal advice.
        </p>
      </div>
    </div>
  );
}

function EventPreviewCard({
  event,
  onConfirm,
  onCancel,
  creating,
}: {
  event: ProposedEvent;
  onConfirm: () => void;
  onCancel: () => void;
  creating: boolean;
}) {
  const eventTypeLabels: Record<string, string> = {
    CONFERENCE: "Conference",
    DEPOSITION: "Deposition",
    TRIAL: "Trial",
    MEDIATION: "Mediation",
    DEADLINE: "Deadline",
    MEETING: "Meeting",
    REMINDER: "Reminder",
    CASE_MANAGEMENT_CONFERENCE: "Case Management Conference",
    OTHER: "Other",
  };

  const automations: string[] = [
    "Create LitCal event",
  ];

  if (event.rulePreview) {
    automations.push(`Apply court rule (${event.rulePreview.appearanceType ?? "remote"} appearance)`);
    if (event.rulePreview.requestRequired) {
      automations.push("Generate remote appearance request task");
    }
  }

  if (event.eventType === "TRIAL") automations.push("Generate trial deadlines");
  if (event.eventType === "CASE_MANAGEMENT_CONFERENCE") automations.push("Generate CMS task");
  automations.push("Sync to Google Calendar");
  if (event.caseId) automations.push("Add case timeline entry");
  automations.push("Create reminders/notifications");

  return (
    <div className="mt-3 rounded-lg border border-teal-200 bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-teal-50 border-b border-teal-200">
        <CalendarPlus className="size-4 text-teal-700" />
        <span className="text-xs font-bold text-teal-800">Proposed Event</span>
      </div>

      <div className="px-3 py-2.5 space-y-1.5 text-xs">
        {event.caseName && (
          <div className="flex gap-2">
            <span className="text-slate-500 w-16 shrink-0">Case</span>
            <span className="font-medium text-slate-800">{event.caseName}{event.caseNumber ? ` (#${event.caseNumber})` : ""}</span>
          </div>
        )}
        <div className="flex gap-2">
          <span className="text-slate-500 w-16 shrink-0">Event</span>
          <span className="font-medium text-slate-800">{eventTypeLabels[event.eventType] ?? event.eventType}</span>
        </div>
        {event.subtype && (
          <div className="flex gap-2">
            <span className="text-slate-500 w-16 shrink-0">Type</span>
            <span className="font-medium text-slate-800">{event.subtype}{event.subtypeReason ? ` (${event.subtypeReason})` : ""}</span>
          </div>
        )}
        <div className="flex gap-2">
          <span className="text-slate-500 w-16 shrink-0">Date</span>
          <span className="font-medium text-slate-800">{formatDateDisplay(event.date)}</span>
        </div>
        <div className="flex gap-2">
          <span className="text-slate-500 w-16 shrink-0">Time</span>
          <span className="font-medium text-slate-800">{event.displayTime}</span>
        </div>
        {event.department && (
          <div className="flex gap-2">
            <span className="text-slate-500 w-16 shrink-0">Dept</span>
            <span className="font-medium text-slate-800">{event.department}</span>
          </div>
        )}
        {event.county && (
          <div className="flex gap-2">
            <span className="text-slate-500 w-16 shrink-0">Court</span>
            <span className="font-medium text-slate-800">{event.county}{event.court ? ` — ${event.court}` : ""}</span>
          </div>
        )}
        {event.rulePreview && (
          <div className="flex gap-2">
            <span className="text-slate-500 w-16 shrink-0">Appear.</span>
            <span className="font-medium text-slate-800">{event.rulePreview.appearanceType ?? "Remote"}{event.rulePreview.requestRequired ? " (request required)" : ""}</span>
          </div>
        )}
        {event.description && (
          <div className="flex gap-2">
            <span className="text-slate-500 w-16 shrink-0">Notes</span>
            <span className="text-slate-700">{event.description}</span>
          </div>
        )}
      </div>

      {/* Automations */}
      <div className="px-3 py-2 border-t border-slate-100">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Will run:</p>
        <ul className="space-y-0.5">
          {automations.map((a, i) => (
            <li key={i} className="text-[11px] text-slate-600 flex items-center gap-1.5">
              <CheckCircle2 className="size-3 text-teal-500 shrink-0" />
              {a}
            </li>
          ))}
        </ul>
      </div>

      {/* Conflicts warning */}
      {event.conflicts.length > 0 && (
        <div className="px-3 py-2 border-t border-amber-200 bg-amber-50">
          <div className="flex items-center gap-1.5 mb-1">
            <AlertTriangle className="size-3.5 text-amber-600" />
            <span className="text-[11px] font-semibold text-amber-800">Scheduling Conflict</span>
          </div>
          {event.conflicts.map((c, i) => (
            <p key={i} className="text-[11px] text-amber-700 ml-5">
              {c.title} ({new Date(c.startTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} – {new Date(c.endTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}) — {c.attorneyName}
            </p>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 px-3 py-2.5 border-t border-slate-100 bg-slate-50">
        <button
          onClick={onConfirm}
          disabled={creating}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-teal-700 text-white text-xs font-semibold py-2 hover:bg-teal-800 disabled:opacity-50 transition-colors"
        >
          {creating ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              <CalendarPlus className="size-3.5" />
              Create Event
            </>
          )}
        </button>
        <button
          onClick={onCancel}
          disabled={creating}
          className="rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 px-4 py-2 hover:bg-slate-50 disabled:opacity-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
