"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

interface Props {
  googleCalendarConnected: boolean;
  googleGmailConnected: boolean;
}

export default function CalendarConnections({ googleCalendarConnected, googleGmailConnected }: Props) {
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ synced: number; failed: number } | null>(null);

  async function handleSyncAll() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/calendar/sync-all", { method: "POST" });
      const data = await res.json();
      setSyncResult({ synced: data.synced ?? 0, failed: data.failed ?? 0 });
    } catch {
      setSyncResult({ synced: 0, failed: -1 });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">Integrations</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Connect the services LitCal actively supports today.
        </p>
      </div>

      <Separator />

      <div className="flex flex-col gap-6">
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-semibold text-slate-950">Calendar</h2>
            <p className="mt-1 text-sm text-slate-500">Sync litigation events and deadlines to your external calendar.</p>
          </div>

          <IntegrationRow
            title="Google Calendar"
            description="Push litigation events and deadlines to your Google Calendar."
            connected={googleCalendarConnected}
            connectAction="/api/auth/google"
            disconnectAction="/api/auth/google/disconnect"
          />

          {googleCalendarConnected && (
            <div className="border-t border-slate-100 px-5 py-4 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-slate-950">Sync existing events</span>
                <span className="text-xs text-slate-500">Push all LitCal events that haven&apos;t been synced to Google Calendar yet.</span>
              </div>
              <div className="flex items-center gap-3 shrink-0 ml-4">
                {syncResult && (
                  <span className={`text-xs font-medium ${syncResult.failed === -1 ? "text-red-600" : syncResult.failed > 0 ? "text-amber-600" : "text-green-700"}`}>
                    {syncResult.failed === -1
                      ? "Sync failed — try again"
                      : syncResult.synced === 0 && syncResult.failed === 0
                      ? "All events already synced"
                      : `${syncResult.synced} synced${syncResult.failed > 0 ? `, ${syncResult.failed} failed` : ""}`}
                  </span>
                )}
                <Button variant="outline" size="sm" onClick={handleSyncAll} disabled={syncing}>
                  {syncing ? "Syncing…" : "Sync Now"}
                </Button>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-semibold text-slate-950">Email</h2>
            <p className="mt-1 text-sm text-slate-500">Connect email features LitCal uses for team communication.</p>
          </div>

          <IntegrationRow
            title="Gmail"
            description="Send team invite emails from your Gmail account."
            connected={googleGmailConnected}
            connectAction="/api/auth/google/gmail"
            disconnectAction="/api/auth/google/gmail/disconnect"
          />
        </section>
      </div>
    </div>
  );
}

function IntegrationRow({
  title,
  description,
  connected,
  connectAction,
  disconnectAction,
}: {
  title: string;
  description: string;
  connected: boolean;
  connectAction: string;
  disconnectAction: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-slate-950">{title}</span>
        <span className="text-xs text-slate-500">{description}</span>
      </div>
      <div className="flex items-center gap-3 shrink-0 ml-4">
        {connected ? (
          <>
            <Badge variant="secondary" className="text-green-700 bg-green-50 border-green-200">Connected</Badge>
            <form method="GET" action={connectAction}>
              <Button variant="outline" size="sm" type="submit">Reconnect</Button>
            </form>
            <form method="POST" action={disconnectAction}>
              <Button variant="ghost" size="sm" type="submit">Disconnect</Button>
            </form>
          </>
        ) : (
          <>
            <span className="text-xs text-muted-foreground">Not connected</span>
            <form method="GET" action={connectAction}>
              <Button size="sm" type="submit">Connect</Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
