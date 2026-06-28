"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { X, Send, Loader2, MessageSquare, Sparkles } from "lucide-react";
import { useAskLitCal } from "./AskLitCalContext";

interface Message {
  role: "user" | "assistant";
  content: string;
  caseMatches?: { id: string; title: string; caseNumber: string | null }[];
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

export default function AskLitCalPanel() {
  const { open, caseId, closePanel } = useAskLitCal();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevOpenRef = useRef(false);

  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setMessages([]);
      setActiveCaseId(caseId);
      setInput("");
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
        }),
      });
      const data = await res.json() as {
        answer?: string;
        activeCaseId?: string | null;
        caseMatches?: { id: string; title: string; caseNumber: string | null }[] | null;
        error?: string;
      };

      if (!res.ok) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.error ?? "Something went wrong." }]);
        return;
      }

      if (data.activeCaseId) setActiveCaseId(data.activeCaseId);

      setMessages((prev) => [...prev, {
        role: "assistant",
        content: data.answer ?? "No response.",
        caseMatches: data.caseMatches ?? undefined,
      }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Failed to connect. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }, [loading, messages, activeCaseId]);

  function handleCaseSelect(id: string) {
    setActiveCaseId(id);
    sendMessage(`Tell me about this case.`);
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
            disabled={loading}
            className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-300 focus:ring-1 focus:ring-teal-200 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
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
