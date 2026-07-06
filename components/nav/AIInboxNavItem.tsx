"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Inbox } from "lucide-react";

export default function AIInboxNavItem({ collapsed }: { collapsed?: boolean }) {
  const pathname = usePathname();
  const [pending, setPending] = useState(0);
  const isActive = pathname === "/ai-inbox" || pathname.startsWith("/ai-inbox/");

  const fetchCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/ai-inbox/suggestions?countsOnly=1");
      if (!res.ok) return;
      const data = await res.json() as { counts?: Record<string, number> };
      setPending((data.counts?.PENDING ?? 0) + (data.counts?.DUPLICATE ?? 0));
    } catch { /* silent */ }
  }, []);

  // Initial fetch + 60s polling
  useEffect(() => {
    void Promise.resolve().then(fetchCounts);
    const interval = setInterval(() => void fetchCounts(), 60000);
    return () => clearInterval(interval);
  }, [fetchCounts]);

  // AIInboxClient broadcasts fresh counts whenever it refetches, so the badge
  // updates instantly as suggestions are approved/ignored on the page.
  useEffect(() => {
    const handler = (e: Event) => {
      const counts = (e as CustomEvent<Record<string, number>>).detail;
      if (counts) setPending((counts.PENDING ?? 0) + (counts.DUPLICATE ?? 0));
      else void fetchCounts();
    };
    window.addEventListener("ai-inbox-counts", handler);
    return () => window.removeEventListener("ai-inbox-counts", handler);
  }, [fetchCounts]);

  return (
    <Link
      href="/ai-inbox"
      aria-label="AI Inbox"
      className={`group relative flex items-center rounded-lg text-sm transition-all ${
        collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5"
      } ${
        isActive
          ? "bg-nav-accent text-nav-foreground shadow-sm ring-1 ring-nav-border"
          : "text-nav-muted-foreground hover:bg-nav-accent hover:text-nav-foreground"
      }`}
    >
      <span className={`relative grid size-7 place-items-center rounded-md transition-colors ${
        isActive ? "bg-white/10 text-teal-200" : "text-nav-muted-foreground group-hover:bg-white/10 group-hover:text-nav-foreground"
      }`}>
        <Inbox className="size-4 shrink-0" />
        {pending > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center px-0.5">
            {pending > 9 ? "9+" : pending}
          </span>
        )}
      </span>
      {!collapsed && <span className="flex-1 font-medium">AI Inbox</span>}
      {collapsed && (
        <span className="pointer-events-none invisible absolute left-[calc(100%+10px)] top-1/2 z-50 flex -translate-y-1/2 items-center gap-2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 opacity-0 shadow-lg transition-all duration-150 group-hover:visible group-hover:opacity-100 group-focus-visible:visible group-focus-visible:opacity-100">
          <span className="size-1.5 rounded-full bg-teal-500" />
          AI Inbox{pending > 0 ? ` (${pending} pending)` : ""}
        </span>
      )}
    </Link>
  );
}
