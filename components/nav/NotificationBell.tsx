"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Bell } from "lucide-react";
import Link from "next/link";

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
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread]               = useState(0);
  const [open, setOpen]                   = useState(false);
  const [dropdownPos, setDropdownPos]     = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  async function fetchNotifications() {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications ?? []);
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
          <div
            key={n.id}
            onClick={() => !n.read && markRead(n.id)}
            className={`px-4 py-3 cursor-pointer transition-colors hover:bg-slate-50 ${!n.read ? "bg-teal-50/60" : ""}`}
          >
            <div className="flex items-start gap-2">
              {!n.read && <span className="mt-1.5 w-2 h-2 rounded-full bg-teal-500 shrink-0" />}
              <div className={!n.read ? "" : "pl-4"}>
                <p className="text-sm font-semibold leading-snug text-slate-900">{n.title}</p>
                {n.body && <p className="text-xs text-slate-500 mt-0.5 whitespace-pre-line">{n.body}</p>}
                {n.caseRef && (
                  <Link
                    href={`/cases/${n.caseRef.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs text-teal-700 hover:underline mt-0.5 block"
                  >
                    {n.caseRef.caseNumber ? `#${n.caseRef.caseNumber} · ` : ""}{n.caseRef.title}
                  </Link>
                )}
                <p className="text-xs text-slate-400 mt-1">
                  {new Date(n.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </p>
              </div>
            </div>
          </div>
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
        title={collapsed ? "Notifications" : undefined}
        aria-label="Notifications"
        className={`group flex items-center rounded-lg text-sm transition-all text-slate-600 hover:text-slate-950 hover:bg-white/65 w-full ${
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
      </button>

      {typeof document !== "undefined" && dropdown && createPortal(dropdown, document.body)}
    </>
  );
}
