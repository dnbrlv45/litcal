"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Bell, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

interface NotificationBellProps {
  collapsed?: boolean;
}

export default function NotificationBell({ collapsed = false }: NotificationBellProps) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread]               = useState(0);
  const [open, setOpen]                   = useState(false);
  const [toasts, setToasts]               = useState<Notification[]>([]);
  const [dropdownPos, setDropdownPos]     = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const knownIdsRef = useRef<Set<string> | null>(null);

  async function fetchNotifications() {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = await res.json();
      const nextNotifications = (data.notifications ?? []) as Notification[];
      const knownIds = knownIdsRef.current;
      if (knownIds && typeof document !== "undefined" && document.visibilityState === "visible") {
        const freshUnread = nextNotifications
          .filter((n) => !n.read && !knownIds.has(n.id))
          .slice(0, 3);
        if (freshUnread.length > 0) {
          setToasts((current) => [...freshUnread, ...current].slice(0, 3));
        }
      }
      knownIdsRef.current = new Set(nextNotifications.map((n) => n.id));
      setNotifications(nextNotifications);
      setUnread(data.unreadCount ?? 0);
    } catch { /* silent */ }
  }

  useEffect(() => {
    void Promise.resolve().then(fetchNotifications);
    const interval = setInterval(() => {
      void fetchNotifications();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      const target = e.target as Node;
      const dropdown = document.getElementById("notif-dropdown");
      if (buttonRef.current?.contains(target) || dropdown?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((toast) => window.setTimeout(() => {
      dismissToast(toast.id);
    }, 10000));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [toasts]);

  function handleToggle() {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.top, left: rect.right + 8 });
    }
    setOpen((o) => !o);
  }

  async function markAllRead() {
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) });
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnread(0);
  }

  async function markRead(id: string) {
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [id] }) });
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
    setUnread((prev) => Math.max(0, prev - 1));
  }

  async function openNotification(notification: Notification) {
    if (!notification.read) await markRead(notification.id);
    setOpen(false);
    setToasts((current) => current.filter((n) => n.id !== notification.id));
    router.push(notificationHref(notification));
  }

  function dismissToast(id: string) {
    setToasts((current) => current.filter((n) => n.id !== id));
  }

  const dropdown = open ? (
    <div
      id="notif-dropdown"
      style={{ position: "fixed", top: dropdownPos.top, left: dropdownPos.left, zIndex: 9999 }}
      className="w-[328px] bg-white border border-slate-200 rounded-lg panel-shadow overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/80">
        <span className="text-sm font-semibold text-slate-950">Notifications</span>
        {unread > 0 && (
          <button onClick={markAllRead} className="rounded-md px-2 py-1 text-xs font-medium text-teal-700 hover:bg-teal-50">
            Mark all read
          </button>
        )}
      </div>

      <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
        {notifications.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-6">No notifications.</p>
        ) : notifications.slice(0, 10).map((n) => (
          <button
            key={n.id}
            onClick={() => void openNotification(n)}
            className={`w-full px-4 py-3 text-left transition-colors hover:bg-slate-50 ${!n.read ? "bg-teal-50/60" : ""}`}
          >
            <div className="flex items-start gap-2">
              {!n.read && <span className="mt-1.5 w-2 h-2 rounded-full bg-teal-500 shrink-0" />}
              <div className={!n.read ? "" : "pl-4"}>
                <p className="text-sm font-semibold leading-snug text-slate-900">{n.title}</p>
                {n.body && <p className="text-xs text-slate-500 mt-0.5 whitespace-pre-line">{n.body}</p>}
                <p className="text-xs text-teal-700 mt-1 font-semibold">{notificationTargetLabel(n)}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {new Date(n.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>
      <div className="border-t border-slate-100 px-4 py-2.5">
        <Link
          href="/notifications"
          onClick={() => setOpen(false)}
          className="text-xs text-teal-700 hover:text-teal-800 font-semibold"
        >
          View all notifications →
        </Link>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleToggle}
        aria-label="Notifications"
        className={`group relative flex items-center rounded-lg text-sm transition-all text-slate-600 hover:text-slate-950 hover:bg-white/65 w-full ${
          collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5"
        }`}
      >
        <span className="relative grid size-7 place-items-center rounded-md text-slate-500 transition-colors group-hover:bg-slate-100 group-hover:text-slate-800">
          <Bell className="w-4 h-4 shrink-0" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center px-0.5">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </span>
        {!collapsed && <span className="flex-1 text-left font-medium">Notifications</span>}
        {collapsed && (
          <span className="pointer-events-none invisible absolute left-[calc(100%+10px)] top-1/2 z-50 flex -translate-y-1/2 items-center gap-2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 opacity-0 shadow-lg transition-all duration-150 group-hover:visible group-hover:opacity-100 group-focus-visible:visible group-focus-visible:opacity-100">
            <span className="size-1.5 rounded-full bg-teal-500" />
            Notifications
          </span>
        )}
      </button>

      {typeof document !== "undefined" && toasts.length > 0 && createPortal(
        <div className="fixed right-5 top-5 z-[10000] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2">
          {toasts.map((toast) => (
            <div key={toast.id} className="rounded-lg border border-slate-200 bg-white shadow-xl">
              <div className="flex items-start gap-3 p-4">
                <span className="mt-1 size-2 rounded-full bg-teal-500" />
                <button
                  onClick={() => void openNotification(toast)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="text-sm font-semibold leading-snug text-slate-950">{toast.title}</p>
                  {toast.body && <p className="mt-1 line-clamp-2 text-xs text-slate-500 whitespace-pre-line">{toast.body}</p>}
                  <p className="mt-1 text-xs font-semibold text-teal-700">{notificationTargetLabel(toast)}</p>
                </button>
                <button
                  onClick={() => dismissToast(toast.id)}
                  className="grid size-7 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Dismiss notification"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>,
        document.body,
      )}

      {typeof document !== "undefined" && dropdown && createPortal(dropdown, document.body)}
    </>
  );
}
