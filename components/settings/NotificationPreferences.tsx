"use client";

import { useState } from "react";

interface Preferences {
  taskAssignedEmails: boolean;
  taskDueEmails: boolean;
  eventReminderEmails: boolean;
  deadlineReminderEmails: boolean;
  discoveryReminderEmails: boolean;
  remoteAppearanceReminderEmails: boolean;
  ruleApprovalEmails: boolean;
}

interface Props {
  initialPreferences: Preferences;
}

const PREFS: Array<{ key: keyof Preferences; label: string }> = [
  { key: "taskAssignedEmails", label: "Task Assigned Emails" },
  { key: "taskDueEmails", label: "Task Due Emails" },
  { key: "eventReminderEmails", label: "Event Reminder Emails" },
  { key: "deadlineReminderEmails", label: "Deadline Reminder Emails" },
  { key: "discoveryReminderEmails", label: "Discovery Reminder Emails" },
  { key: "remoteAppearanceReminderEmails", label: "Remote Appearance Reminder Emails" },
  { key: "ruleApprovalEmails", label: "Rule Approval Emails" },
];

export default function NotificationPreferences({ initialPreferences }: Props) {
  const [preferences, setPreferences] = useState(initialPreferences);
  const [savingKey, setSavingKey] = useState<keyof Preferences | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function updatePreference(key: keyof Preferences, value: boolean) {
    const previous = preferences[key];
    setPreferences((current) => ({ ...current, [key]: value }));
    setSavingKey(key);
    setError(null);
    try {
      const res = await fetch("/api/settings/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      if (!res.ok) throw new Error("Save failed");
      const data = await res.json();
      setPreferences(data.preferences);
    } catch {
      setPreferences((current) => ({ ...current, [key]: previous }));
      setError("Could not save notification preferences.");
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="font-semibold text-slate-950">Email Notifications</h2>
        <p className="mt-1 text-sm text-slate-500">Choose which LitCal notifications should also be sent by email.</p>
      </div>
      <div className="divide-y divide-slate-100">
        {PREFS.map((pref) => (
          <label key={pref.key} className="flex items-center justify-between gap-4 px-5 py-4 text-sm">
            <span className="font-medium text-slate-800">{pref.label}</span>
            <input
              type="checkbox"
              checked={preferences[pref.key]}
              disabled={savingKey === pref.key}
              onChange={(event) => updatePreference(pref.key, event.target.checked)}
              className="size-4 rounded border-slate-300 text-teal-700 focus:ring-teal-700"
            />
          </label>
        ))}
      </div>
      {error && <p className="border-t border-rose-100 px-5 py-3 text-sm text-rose-700">{error}</p>}
    </div>
  );
}
