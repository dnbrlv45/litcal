import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

interface Props {
  googleCalendarConnected: boolean;
  googleGmailConnected: boolean;
}

export default function CalendarConnections({ googleCalendarConnected, googleGmailConnected }: Props) {
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
