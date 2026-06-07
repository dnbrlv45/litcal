"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { Inbox, X } from "lucide-react";
import { notificationHref, notificationTargetLabel } from "@/lib/notification-routing";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  createdAt: string;
  taskRef:  { id: string; title: string } | null;
  caseRef:  { id: string; title: string; caseNumber: string | null } | null;
  eventRef: { id: string; title: string } | null;
}

export default function InboxNavItem({ collapsed }: { collapsed?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);
  const [toasts, setToasts] = useState<Notification[]>([]);
  const knownIdsRef = useRef<Set<string> | null>(null);
  const isActive = pathname === "/inbox";

  async function fetchNotifications() {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = await res.json();
      const next = (data.notifications ?? []) as Notification[];
      const knownIds = knownIdsRef.current;
      if (knownIds && typeof document !== "undefined" && document.visibilityState === "visible") {
        const fresh = next.filter((n) => !n.read && !knownIds.has(n.id)).slice(0, 3);
        if (fresh.length > 0) setToasts((cur) => [...fresh, ...cur].slice(0, 3));
      }
      knownIdsRef.current = new Set(next.map((n) => n.id));
      setUnread(data.unreadCount ?? next.filter((n) => !n.read).length);
    } catch { /* silent */ }
  }

  useEffect(() => {
    void fetchNotifications();
    const interval = setInterval(() => void fetchNotifications(), 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) => window.setTimeout(() => dismissToast(t.id), 10000));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [toasts]);

  function dismissToast(id: string) {
    setToasts((cur) => cur.filter((n) => n.id !== id));
  }

  async function openToast(notification: Notification) {
    dismissToast(notification.id);
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [notification.id] }),
    });
    setUnread((prev) => Math.max(0, prev - 1));
    router.push(notificationHref(notification));
  }

  return (
    <>
      <Link
        href="/inbox"
        aria-label="Inbox"
        className={`group relative flex items-center rounded-lg text-sm transition-all ${
          collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5"
        } ${
          isActive
            ? "bg-white text-slate-950 shadow-sm ring-1 ring-sidebar-border"
            : "text-slate-600 hover:text-slate-950 hover:bg-white/65"
        }`}
      >
        <span className={`relative grid size-7 place-items-center rounded-md transition-colors ${
          isActive ? "bg-teal-50 text-teal-700" : "text-slate-500 group-hover:bg-slate-100 group-hover:text-slate-800"
        }`}>
          <Inbox className="w-4 h-4 shrink-0" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center px-0.5">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </span>
        {!collapsed && <span className="flex-1 font-medium">Inbox</span>}
        {collapsed && (
          <span className="pointer-events-none invisible absolute left-[calc(100%+10px)] top-1/2 z-50 flex -translate-y-1/2 items-center gap-2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 opacity-0 shadow-lg transition-all duration-150 group-hover:visible group-hover:opacity-100 group-focus-visible:visible group-focus-visible:opacity-100">
            <span className="size-1.5 rounded-full bg-teal-500" />
            Inbox
          </span>
        )}
      </Link>

      {typeof document !== "undefined" && toasts.length > 0 && createPortal(
        <div className="fixed right-5 top-5 z-[10000] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2">
          {toasts.map((toast) => (
            <div key={toast.id} className="rounded-lg border border-slate-200 bg-white shadow-xl">
              <div className="flex items-start gap-3 p-4">
                <span className="mt-1 size-2 rounded-full bg-teal-500" />
                <button onClick={() => void openToast(toast)} className="min-w-0 flex-1 text-left">
                  <p className="text-sm font-semibold leading-snug text-slate-950">{toast.title}</p>
                  {toast.body && <p className="mt-1 line-clamp-2 text-xs text-slate-500 whitespace-pre-line">{toast.body}</p>}
                  <p className="mt-1 text-xs font-semibold text-teal-700">{notificationTargetLabel(toast)}</p>
                </button>
                <button
                  onClick={() => dismissToast(toast.id)}
                  className="grid size-7 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Dismiss"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
