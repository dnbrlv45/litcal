"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Scale } from "lucide-react";

export default function DeadlinesNavItem({ collapsed }: { collapsed?: boolean }) {
  const pathname = usePathname();
  const [overdueCount, setOverdueCount] = useState(0);
  const isActive = pathname === "/deadlines" || pathname.startsWith("/deadlines/");

  const fetchOverdue = useCallback(async () => {
    try {
      const res = await fetch("/api/deadlines?countsOnly=1");
      if (!res.ok) return;
      const data = await res.json();
      setOverdueCount(data.overdueCount ?? 0);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    void fetchOverdue();
    const interval = setInterval(() => void fetchOverdue(), 60000);
    return () => clearInterval(interval);
  }, [fetchOverdue]);

  // Refetch when deadlines are updated (e.g. task marked complete)
  useEffect(() => {
    const handler = () => void fetchOverdue();
    window.addEventListener("deadlines-updated", handler);
    return () => window.removeEventListener("deadlines-updated", handler);
  }, [fetchOverdue]);

  return (
    <Link
      href="/deadlines"
      aria-label="Deadlines"
      className={`group relative flex items-center rounded-lg text-sm transition-all ${
        collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5"
      } ${
        isActive
          ? "bg-nav-accent text-nav-foreground shadow-sm ring-1 ring-nav-border"
          : "text-nav-muted-foreground hover:text-nav-foreground hover:bg-nav-accent"
      }`}
    >
      <span className={`relative grid size-7 place-items-center rounded-md transition-colors ${
        isActive ? "bg-white/10 text-teal-200" : "text-nav-muted-foreground group-hover:bg-white/10 group-hover:text-nav-foreground"
      }`}>
        <Scale className="w-4 h-4 shrink-0" />
        {overdueCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center px-0.5">
            {overdueCount > 9 ? "9+" : overdueCount}
          </span>
        )}
      </span>
      {!collapsed && <span className="flex-1 font-medium">Deadlines</span>}
      {collapsed && (
        <span className="pointer-events-none invisible absolute left-[calc(100%+10px)] top-1/2 z-50 flex -translate-y-1/2 items-center gap-2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 opacity-0 shadow-lg transition-all duration-150 group-hover:visible group-hover:opacity-100">
          <span className="size-1.5 rounded-full bg-teal-500" />
          Deadlines
        </span>
      )}
    </Link>
  );
}
