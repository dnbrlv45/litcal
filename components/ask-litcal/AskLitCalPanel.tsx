"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { X, Send, Loader2, MessageSquare, Sparkles, CalendarPlus, AlertTriangle, CheckCircle2, Briefcase } from "lucide-react";
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

interface CaseIntent {
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
  optionalFieldsAsked?: boolean;
}

interface ProposedEvent {
  title: string;
  eventType: string;
  subtype: string | null;
  subtypeReason: string | null;
  date: string;
  startTime: string | null;
  endTime: string | null;
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

interface ProposedCase {
  title: string;
  plaintiff: string;
  defendant: string | null;
  caseNumber: string | null;
  countyName: string | null;
  courtName: string | null;
  department: string | null;
  judge: string | null;
  caseType: string;
  caseTypeLabel: string;
  filingDate: string | null;
  dateOfLoss: string | null;
  defenseFirm: string | null;
  defenseAttorney: string | null;
  description: string | null;
  attorneyId: string | null;
  attorneyName: string | null;
  paralegalId: string | null;
  paralegalName: string | null;
  assistantId: string | null;
  assistantName: string | null;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  caseMatches?: { id: string; title: string; caseNumber: string | null }[];
  proposedEvent?: ProposedEvent;
  proposedCase?: ProposedCase;
  quickActions?: { label: string; prompt: string }[];
  dismissed?: boolean;
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
  const [pendingCase, setPendingCase] = useState<CaseIntent | null>(null);
  const [activeDraft, setActiveDraft] = useState<ProposedEvent | null>(null);
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [creatingCase, setCreatingCase] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevOpenRef = useRef(false);

  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setMessages([]);
      setActiveCaseId(caseId);
      setInput("");
      setPendingEvent(null);
      setPendingCase(null);
      setActiveDraft(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
    prevOpenRef.current = open;
  }, [open, caseId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async (text: string, overrideActiveCaseId?: string, silent = false) => {
    if (!text.trim() || loading) return;

    if (!silent) {
      const userMsg: Message = { role: "user", content: text };
      setMessages((prev) => [...prev, userMsg]);
    }
    setInput("");
    setLoading(true);

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch("/api/ask-litcal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: text,
          activeCaseId: overrideActiveCaseId ?? activeCaseId,
          history,
          pendingEvent: pendingEvent ?? undefined,
          pendingCase: pendingCase ?? undefined,
          activeDraft: (() => {
            const draft = activeDraft ?? messages.filter((m) => m.proposedEvent && !m.dismissed).slice(-1)[0]?.proposedEvent;
            if (!draft) return undefined;
            return {
              title: draft.title,
              eventType: draft.eventType,
              subtype: draft.subtype,
              date: draft.date,
              startTime: draft.startTime,
              endTime: draft.endTime,
              allDay: draft.allDay,
              department: draft.department,
              location: draft.location,
              description: draft.description,
              inPerson: draft.inPerson,
              caseId: draft.caseId,
              caseName: draft.caseName,
            };
          })(),
        }),
      });
      const data = await res.json() as {
        answer?: string;
        activeCaseId?: string | null;
        caseMatches?: { id: string; title: string; caseNumber: string | null }[] | null;
        pendingEvent?: EventIntent | null;
        pendingCase?: CaseIntent | null;
        proposedEvent?: ProposedEvent | null;
        proposedCase?: ProposedCase | null;
        draftEdits?: Partial<ProposedEvent> & { caseQuery?: string; title?: string };
        error?: string;
      };

      if (!res.ok) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.error ?? "Something went wrong." }]);
        return;
      }

      if (data.activeCaseId) setActiveCaseId(data.activeCaseId);

      // Handle draft edits — update the active draft in place
      if (data.draftEdits && activeDraft) {
        const edits = data.draftEdits;
        const updated = { ...activeDraft };

        if (edits.date) updated.date = edits.date;
        if (edits.startTime) updated.startTime = edits.startTime;
        if (edits.endTime) updated.endTime = edits.endTime;

        // If the start time moved but the end time wasn't explicitly changed,
        // shift the end time to preserve the original event duration.
        if (edits.startTime && !edits.endTime && activeDraft.startTime && activeDraft.endTime) {
          const toMin = (t: string) => {
            const [h, m] = t.split(":").map(Number);
            return h * 60 + m;
          };
          const toStr = (mins: number) => {
            const norm = ((mins % 1440) + 1440) % 1440;
            return `${String(Math.floor(norm / 60)).padStart(2, "0")}:${String(norm % 60).padStart(2, "0")}`;
          };
          const duration = toMin(activeDraft.endTime) - toMin(activeDraft.startTime);
          if (duration > 0) updated.endTime = toStr(toMin(edits.startTime) + duration);
        }
        if (edits.department !== undefined) updated.department = edits.department ?? null;
        if (edits.location !== undefined) updated.location = edits.location ?? null;
        if (edits.description !== undefined) updated.description = edits.description ?? null;
        if (edits.inPerson !== undefined) updated.inPerson = edits.inPerson as boolean;
        if (edits.allDay !== undefined) updated.allDay = edits.allDay as boolean;
        if (edits.title) updated.title = edits.title;

        // Handle event type changes
        if (edits.eventType) {
          let newType = edits.eventType as string;
          const newSubtype = edits.subtype as string | undefined;
          if (newType === "CONFERENCE" && (newSubtype === "CMC" || newSubtype === "Further CMC")) {
            newType = "CASE_MANAGEMENT_CONFERENCE";
          }
          updated.eventType = newType;
          updated.subtype = newSubtype ?? null;
          // Re-generate title if not explicitly set
          if (!edits.title && updated.caseName) {
            const typeLabels: Record<string, string> = {
              CONFERENCE: "Conference", DEPOSITION: "Deposition", TRIAL: "Trial",
              MEDIATION: "Mediation", DEADLINE: "Deadline", MEETING: "Meeting",
              CASE_MANAGEMENT_CONFERENCE: "Case Management Conference",
            };
            const label = newSubtype ?? typeLabels[newType] ?? newType;
            updated.title = `${updated.caseName} — ${label}`;
          }
        } else if (edits.subtype !== undefined) {
          updated.subtype = edits.subtype as string | null;
        }

        // Update display time
        if (updated.allDay) {
          updated.displayTime = "All Day";
        } else if (updated.startTime) {
          const fmt = (t: string) => {
            const [h, m] = t.split(":").map(Number);
            const ampm = h >= 12 ? "PM" : "AM";
            const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
            return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
          };
          updated.displayTime = `${fmt(updated.startTime)}${updated.endTime ? ` – ${fmt(updated.endTime)}` : ""}`;
        }

        setActiveDraft(updated);
        setMessages((prev) => [...prev, {
          role: "assistant",
          content: data.answer ?? "Draft updated.",
        }]);
      } else {
        // Track pending state for multi-turn collection
        if (data.pendingEvent) {
          setPendingEvent(data.pendingEvent);
          setPendingCase(null);
        } else if (data.proposedEvent) {
          setPendingEvent(null);
          setActiveDraft(data.proposedEvent);
        }

        if (data.pendingCase) {
          setPendingCase(data.pendingCase);
          setPendingEvent(null);
        } else if (data.proposedCase) {
          setPendingCase(null);
        }

        setMessages((prev) => [...prev, {
          role: "assistant",
          content: data.answer ?? "No response.",
          caseMatches: data.caseMatches ?? undefined,
          proposedEvent: !activeDraft ? (data.proposedEvent ?? undefined) : undefined,
          proposedCase: data.proposedCase ?? undefined,
        }]);
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Failed to connect. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }, [loading, messages, activeCaseId, pendingEvent, pendingCase, activeDraft]);

  const dismissProposalCards = useCallback(() => {
    setMessages((prev) => prev.map((m) =>
      (m.proposedEvent || m.proposedCase) ? { ...m, dismissed: true } : m
    ));
  }, []);

  const confirmEvent = useCallback(async (proposed: ProposedEvent) => {
    setCreatingEvent(true);
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      let startISO: string;
      let endISO: string;
      if (proposed.allDay) {
        const d = new Date(`${proposed.date}T00:00:00`);
        startISO = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0)).toISOString();
        endISO = new Date(`${proposed.date}T23:59:59`).toISOString();
      } else {
        // Append :00 seconds for cross-browser ISO 8601 compatibility
        const startStr = `${proposed.date}T${proposed.startTime}:00`;
        startISO = new Date(startStr).toISOString();
        const endTimeStr = proposed.endTime ?? (() => {
          const [h, m] = (proposed.startTime ?? "09:00").split(":").map(Number);
          return `${String((h + 1) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
        })();
        const endStr = `${proposed.date}T${endTimeStr}:00`;
        endISO = new Date(endStr).toISOString();
      }
      if (!startISO || !endISO || startISO === "Invalid Date" || endISO === "Invalid Date") {
        setMessages((prev) => [...prev, { role: "assistant", content: `Failed to create event: could not parse date/time (${proposed.date} ${proposed.startTime}).` }]);
        setCreatingEvent(false);
        return;
      }
      const res = await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: proposed.title,
          start: startISO,
          end: endISO,
          timeZone,
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
        const debug = `title="${proposed.title}" start="${startISO}" end="${endISO}"`;
        setMessages((prev) => [...prev, { role: "assistant", content: `Failed to create event: ${data.error ?? "Unknown error"}\n\n(Debug: ${debug})` }]);
        return;
      }

      setPendingEvent(null);
      setActiveDraft(null);
      dismissProposalCards();
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: `**Event created successfully.** "${proposed.title}" has been added to LitCal with all automations applied.`,
      }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Failed to create event. Please try again." }]);
    } finally {
      setCreatingEvent(false);
    }
  }, [dismissProposalCards]);

  const confirmCase = useCallback(async (proposed: ProposedCase) => {
    setCreatingCase(true);
    try {
      const res = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: proposed.title,
          plaintiff: proposed.plaintiff,
          defendant: proposed.defendant ?? undefined,
          caseNumber: proposed.caseNumber ?? undefined,
          countyName: proposed.countyName ?? undefined,
          courtName: proposed.courtName ?? undefined,
          judge: proposed.judge ?? undefined,
          caseType: proposed.caseType,
          filingDate: proposed.filingDate ?? undefined,
          dateOfLoss: proposed.dateOfLoss ?? undefined,
          defenseFirm: proposed.defenseFirm ?? undefined,
          defenseAttorney: proposed.defenseAttorney ?? undefined,
          description: proposed.description ?? undefined,
          attorneys: proposed.attorneyId ? [proposed.attorneyId] : [],
          paralegals: proposed.paralegalId ? [proposed.paralegalId] : [],
          assistants: proposed.assistantId ? [proposed.assistantId] : [],
          source: "ask-litcal",
        }),
      });
      const data = await res.json() as { case?: { id: string; title: string }; error?: string };

      if (!res.ok) {
        setMessages((prev) => [...prev, { role: "assistant", content: `Failed to create case: ${data.error ?? "Unknown error"}` }]);
        return;
      }

      setPendingCase(null);
      dismissProposalCards();
      const newCaseId = data.case?.id;
      if (newCaseId) setActiveCaseId(newCaseId);
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: `**Case created successfully.** "${proposed.title}" has been added to LitCal.`,
        quickActions: [
          { label: "Schedule First Hearing", prompt: "Schedule a hearing for this case" },
          { label: "Add Discovery", prompt: "What discovery do I need to add?" },
          { label: "Assign Staff", prompt: "Who is assigned to this case?" },
          ...(newCaseId ? [{ label: "Open Case", prompt: `__NAVIGATE__/cases/${newCaseId}` }] : []),
        ],
      }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Failed to create case. Please try again." }]);
    } finally {
      setCreatingCase(false);
    }
  }, [dismissProposalCards]);

  const cancelEvent = useCallback(() => {
    setPendingEvent(null);
    setActiveDraft(null);
    dismissProposalCards();
    setMessages((prev) => [...prev, { role: "assistant", content: "Event creation cancelled." }]);
  }, [dismissProposalCards]);

  const cancelCase = useCallback(() => {
    setPendingCase(null);
    dismissProposalCards();
    setMessages((prev) => [...prev, { role: "assistant", content: "Case creation cancelled." }]);
  }, [dismissProposalCards]);

  function handleCaseSelect(id: string) {
    setActiveCaseId(id);
    if (pendingEvent) {
      setPendingEvent({ ...pendingEvent, caseQuery: undefined });
      sendMessage(`Use this case.`, id, true);
    } else {
      sendMessage(`Tell me about this case.`, id, true);
    }
  }

  if (!open) return null;

  const isCreating = creatingEvent || creatingCase;
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
                  {msg.proposedEvent && !msg.dismissed && (
                    <EventPreviewCard
                      event={msg.proposedEvent}
                      onConfirm={() => confirmEvent(msg.proposedEvent!)}
                      onCancel={cancelEvent}
                      creating={creatingEvent}
                    />
                  )}
                  {msg.proposedCase && !msg.dismissed && (
                    <CasePreviewCard
                      caseData={msg.proposedCase}
                      onConfirm={() => confirmCase(msg.proposedCase!)}
                      onCancel={cancelCase}
                      creating={creatingCase}
                    />
                  )}
                  {msg.quickActions && msg.quickActions.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {msg.quickActions.map((action, j) => (
                        <button
                          key={j}
                          onClick={() => {
                            if (action.prompt.startsWith("__NAVIGATE__")) {
                              window.location.href = action.prompt.replace("__NAVIGATE__", "");
                            } else {
                              sendMessage(action.prompt);
                            }
                          }}
                          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-teal-50 hover:border-teal-200 hover:text-teal-800 transition-colors"
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <span>{msg.content}</span>
              )}
            </div>
          </div>
        ))}

        {/* Persistent active draft card */}
        {activeDraft && (
          <div className="flex justify-start">
            <div className="max-w-[85%]">
              <EventPreviewCard
                event={activeDraft}
                onConfirm={() => confirmEvent(activeDraft)}
                onCancel={cancelEvent}
                creating={creatingEvent}
              />
            </div>
          </div>
        )}

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
            disabled={loading || isCreating}
            className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-300 focus:ring-1 focus:ring-teal-200 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !input.trim() || isCreating}
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

// ── Event Preview Card ──────────────────────────────────────────────────────

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

// ── Case Preview Card ───────────────────────────────────────────────────────

function CasePreviewCard({
  caseData,
  onConfirm,
  onCancel,
  creating,
}: {
  caseData: ProposedCase;
  onConfirm: () => void;
  onCancel: () => void;
  creating: boolean;
}) {
  const rows: { label: string; value: string }[] = [
    { label: "Title", value: caseData.title },
    { label: "Plaintiff", value: caseData.plaintiff },
  ];

  if (caseData.defendant) rows.push({ label: "Defendant", value: caseData.defendant });
  if (caseData.caseNumber) rows.push({ label: "Case #", value: caseData.caseNumber });
  rows.push({ label: "Type", value: caseData.caseTypeLabel });
  if (caseData.countyName) rows.push({ label: "County", value: caseData.countyName });
  if (caseData.courtName) rows.push({ label: "Court", value: caseData.courtName });
  if (caseData.department) rows.push({ label: "Dept", value: caseData.department });
  if (caseData.judge) rows.push({ label: "Judge", value: caseData.judge });
  if (caseData.filingDate) rows.push({ label: "Filed", value: formatDateDisplay(caseData.filingDate) });
  if (caseData.dateOfLoss) rows.push({ label: "Date of Loss", value: formatDateDisplay(caseData.dateOfLoss) });
  if (caseData.defenseFirm) rows.push({ label: "Def. Firm", value: caseData.defenseFirm });
  if (caseData.defenseAttorney) rows.push({ label: "Def. Atty", value: caseData.defenseAttorney });
  if (caseData.attorneyName) rows.push({ label: "Attorney", value: caseData.attorneyName });
  if (caseData.paralegalName) rows.push({ label: "Paralegal", value: caseData.paralegalName });
  if (caseData.assistantName) rows.push({ label: "Assistant", value: caseData.assistantName });
  if (caseData.description) rows.push({ label: "Notes", value: caseData.description });

  return (
    <div className="mt-3 rounded-lg border border-indigo-200 bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border-b border-indigo-200">
        <Briefcase className="size-4 text-indigo-700" />
        <span className="text-xs font-bold text-indigo-800">Proposed Case</span>
      </div>

      <div className="px-3 py-2.5 space-y-1.5 text-xs">
        {rows.map((r, i) => (
          <div key={i} className="flex gap-2">
            <span className="text-slate-500 w-20 shrink-0">{r.label}</span>
            <span className="font-medium text-slate-800">{r.value}</span>
          </div>
        ))}
      </div>

      {/* What will happen */}
      <div className="px-3 py-2 border-t border-slate-100">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Will run:</p>
        <ul className="space-y-0.5">
          <li className="text-[11px] text-slate-600 flex items-center gap-1.5">
            <CheckCircle2 className="size-3 text-indigo-500 shrink-0" />
            Create LitCal case
          </li>
          <li className="text-[11px] text-slate-600 flex items-center gap-1.5">
            <CheckCircle2 className="size-3 text-indigo-500 shrink-0" />
            Add case timeline entry
          </li>
          {caseData.attorneyName && (
            <li className="text-[11px] text-slate-600 flex items-center gap-1.5">
              <CheckCircle2 className="size-3 text-indigo-500 shrink-0" />
              Assign attorney: {caseData.attorneyName}
            </li>
          )}
          {caseData.paralegalName && (
            <li className="text-[11px] text-slate-600 flex items-center gap-1.5">
              <CheckCircle2 className="size-3 text-indigo-500 shrink-0" />
              Assign paralegal: {caseData.paralegalName}
            </li>
          )}
          {caseData.assistantName && (
            <li className="text-[11px] text-slate-600 flex items-center gap-1.5">
              <CheckCircle2 className="size-3 text-indigo-500 shrink-0" />
              Assign assistant: {caseData.assistantName}
            </li>
          )}
        </ul>
      </div>

      {/* Actions */}
      <div className="flex gap-2 px-3 py-2.5 border-t border-slate-100 bg-slate-50">
        <button
          onClick={onConfirm}
          disabled={creating}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-indigo-700 text-white text-xs font-semibold py-2 hover:bg-indigo-800 disabled:opacity-50 transition-colors"
        >
          {creating ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              <Briefcase className="size-3.5" />
              Create Case
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
