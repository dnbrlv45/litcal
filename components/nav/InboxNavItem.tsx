"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { Bell, X, CheckCheck, ExternalLink } from "lucide-react";
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

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function InboxNavItem({ collapsed }: { collapsed?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [toasts, setToasts] = useState<Notification[]>([]);
  const [hovered, setHovered] = useState(false);
  const knownIdsRef = useRef<Set<string> | null>(null);
  const anchorRef = useRef<HTMLAnchorElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const isActive = pathname === "/notifications" || pathname === "/inbox";

  const fetchNotifications = useCallback(async () => {
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
      setNotifications(next);
      setUnread(data.unreadCount ?? next.filter((n) => !n.read).length);
    } catch { /* silent */ }
  }, []);

  // Initial fetch + 60s polling. This runs on every page for every open
  // session, so keep it infrequent — DB egress on the Free tier is capped.
  useEffect(() => {
    void fetchNotifications();
    const interval = setInterval(() => void fetchNotifications(), 60000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Refetch immediately when the notifications page marks something read.
  useEffect(() => {
    const handler = () => void fetchNotifications();
    window.addEventListener("notifications-updated", handler);
    return () => window.removeEventListener("notifications-updated", handler);
  }, [fetchNotifications]);

  // Toast auto-dismiss
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
    setNotifications((prev) => prev.map((n) => n.id === notification.id ? { ...n, read: true } : n));
    router.push(notificationHref(notification));
  }

  async function markReadFromPopover(notification: Notification, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (notification.read) return;
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [notification.id] }),
    });
    setUnread((prev) => Math.max(0, prev - 1));
    setNotifications((prev) => prev.map((n) => n.id === notification.id ? { ...n, read: true } : n));
  }

  // 3 most recent notifications for the popover
  const recent = notifications.slice(0, 3);

  // Popover position relative to anchor
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 });
  useEffect(() => {
    if (hovered && anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setPopoverPos({ top: rect.top, left: rect.right + 10 });
    }
  }, [hovered]);

  return (
    <>
      <div
        className="relative"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <Link
          ref={anchorRef}
          href="/notifications"
          aria-label="Notifications"
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
            <Bell className="w-4 h-4 shrink-0" />
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center px-0.5">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </span>
          {!collapsed && <span className="flex-1 font-medium">Notifications</span>}
          {/* Collapsed tooltip — only show when not hovering a popover */}
          {collapsed && recent.length === 0 && (
            <span className="pointer-events-none invisible absolute left-[calc(100%+10px)] top-1/2 z-50 flex -translate-y-1/2 items-center gap-2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 opacity-0 shadow-lg transition-all duration-150 group-hover:visible group-hover:opacity-100">
              <span className="size-1.5 rounded-full bg-teal-500" />
              Notifications
            </span>
          )}
        </Link>
      </div>

      {/* Hover popover — rendered in portal so it escapes sidebar overflow */}
      {typeof document !== "undefined" && hovered && recent.length > 0 && createPortal(
        <div
          ref={popoverRef}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{ top: popoverPos.top, left: popoverPos.left }}
          className="fixed z-[9999] w-80 rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Recent</span>
            <Link
              href="/notifications"
              className="flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800"
            >
              View all <ExternalLink className="size-3" />
            </Link>
          </div>

          {/* Notification rows */}
          {recent.map((n) => (
            <button
              key={n.id}
              onClick={() => void openToast(n)}
              className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 ${!n.read ? "bg-teal-50/40" : ""}`}
            >
              {!n.read
                ? <span className="mt-1.5 size-2 rounded-full bg-teal-500 shrink-0" />
                : <span className="mt-1.5 size-2 rounded-full bg-transparent shrink-0" />
              }
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-900 leading-snug truncate">{n.title}</p>
                {n.body && <p className="mt-0.5 text-xs text-slate-500 line-clamp-1">{n.body}</p>}
                <p className="mt-0.5 text-[10px] text-slate-400">{timeAgo(n.createdAt)}</p>
              </div>
              {!n.read && (
                <button
                  onClick={(e) => void markReadFromPopover(n, e)}
                  title="Mark read"
                  className="mt-0.5 shrink-0 rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-teal-700"
                >
                  <CheckCheck className="size-3.5" />
                </button>
              )}
            </button>
          ))}
        </div>,
        document.body,
      )}

      {/* Toast notifications */}
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
