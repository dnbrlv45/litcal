"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Bell, Trash2, CheckCheck, X } from "lucide-react";
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

const TYPE_LABELS: Record<string, string> = {
  TASK_ASSIGNED: "Task",
  CASE_ASSIGNED: "Case",
  EVENT_REMINDER: "Reminder",
};

export default function InboxClient() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications ?? []);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(fetchNotifications);
  }, [fetchNotifications]);

  async function markAllRead() {
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) });
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  async function markRead(id: string) {
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [id] }) });
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
  }

  async function openNotification(notification: Notification) {
    if (!notification.read) await markRead(notification.id);
    router.push(notificationHref(notification));
  }

  async function deleteSelected() {
    const ids = Array.from(selected);
    await fetch("/api/notifications", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
    setNotifications((prev) => prev.filter((n) => !selected.has(n.id)));
    setSelected(new Set());
  }

  async function deleteOne(id: string) {
    await fetch("/api/notifications", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [id] }) });
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    setSelected((prev) => { const s = new Set(prev); s.delete(id); return s; });
  }

  async function deleteAll() {
    await fetch("/api/notifications", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) });
    setNotifications([]);
    setSelected(new Set());
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  function toggleSelectAll() {
    if (selected.size === notifications.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(notifications.map((n) => n.id)));
    }
  }

  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Bell className="w-5 h-5 text-slate-600" />
          <h1 className="text-xl font-semibold">Inbox</h1>
          {unread > 0 && (
            <span className="bg-rose-100 text-rose-700 text-xs font-semibold px-2 py-0.5 rounded-full">
              {unread} unread
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unread > 0 && (
            <button
              onClick={markAllRead}
              className="flex items-center gap-1.5 text-sm text-teal-700 hover:text-teal-900 px-3 py-1.5 rounded-lg hover:bg-teal-50 transition-colors"
            >
              <CheckCheck className="w-4 h-4" />
              Mark all read
            </button>
          )}
          {notifications.length > 0 && (
            <button
              onClick={deleteAll}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-rose-600 px-3 py-1.5 rounded-lg hover:bg-rose-50 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Clear all
            </button>
          )}
        </div>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center justify-between bg-teal-50 border border-teal-200 rounded-xl px-4 py-2.5 mb-4">
          <span className="text-sm text-teal-800 font-medium">{selected.size} selected</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const unreadSelected = Array.from(selected).filter((id) => !notifications.find((n) => n.id === id)?.read);
                if (unreadSelected.length > 0) {
                  fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: unreadSelected }) })
                    .then(() => setNotifications((prev) => prev.map((n) => selected.has(n.id) ? { ...n, read: true } : n)));
                }
              }}
              className="text-sm text-teal-700 hover:underline"
            >
              Mark read
            </button>
            <button onClick={deleteSelected} className="text-sm text-rose-600 hover:underline">
              Delete
            </button>
            <button onClick={() => setSelected(new Set())} className="text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-slate-400 text-sm">Loading…</div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-16">
          <Bell className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">No notifications.</p>
        </div>
      ) : (
        <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 border-b border-slate-200">
            <input
              type="checkbox"
              checked={selected.size === notifications.length && notifications.length > 0}
              onChange={toggleSelectAll}
              className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            <span className="text-xs text-slate-500 font-medium">{notifications.length} notification{notifications.length !== 1 ? "s" : ""}</span>
          </div>

          {notifications.map((n) => (
            <div
              key={n.id}
              className={`flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50 ${!n.read ? "bg-teal-50/50" : ""} ${selected.has(n.id) ? "bg-teal-50" : ""}`}
            >
              <input
                type="checkbox"
                checked={selected.has(n.id)}
                onChange={() => toggleSelect(n.id)}
                onClick={(e) => e.stopPropagation()}
                className="mt-1 rounded border-slate-300 text-teal-600 focus:ring-teal-500 shrink-0"
              />
              {!n.read && <span className="mt-2 w-2 h-2 rounded-full bg-teal-500 shrink-0" />}
              <button className="flex-1 min-w-0 text-left" onClick={() => void openNotification(n)}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="inline-block text-[10px] font-semibold uppercase tracking-wide text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded mr-2">
                      {TYPE_LABELS[n.type] ?? n.type}
                    </span>
                    <span className="text-sm font-medium">{n.title}</span>
                  </div>
                  <span className="text-xs text-slate-400 whitespace-nowrap shrink-0">
                    {new Date(n.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </span>
                </div>
                {n.body && (
                  <p className="text-xs text-slate-500 mt-1 whitespace-pre-line">{n.body}</p>
                )}
                <p className="mt-1 inline-block text-xs font-semibold text-teal-700">{notificationTargetLabel(n)}</p>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); void deleteOne(n.id); }}
                className="shrink-0 p-1 rounded text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors mt-0.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
