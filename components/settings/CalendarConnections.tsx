import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

interface Props {
  googleConnected: boolean;
}

export default function CalendarConnections({ googleConnected }: Props) {
  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold">Calendar Connections</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Connect an external calendar to receive your litigation events and deadlines.
        </p>
      </div>

      <Separator />

      <div className="flex flex-col gap-4">
        {/* Google Calendar */}
        <div className="flex items-center justify-between rounded-lg border border-border px-5 py-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">Google Calendar</span>
            <span className="text-xs text-muted-foreground">
              Push your litigation events and deadlines to Google Calendar.
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0 ml-4">
            {googleConnected ? (
              <>
                <Badge variant="secondary" className="text-green-700 bg-green-50 border-green-200">
                  Connected
                </Badge>
                <form method="POST" action="/api/auth/google/disconnect">
                  <Button variant="ghost" size="sm" type="submit">
                    Disconnect
                  </Button>
                </form>
              </>
            ) : (
              <>
                <span className="text-xs text-muted-foreground">Not connected</span>
                <form method="GET" action="/api/auth/google">
                  <Button size="sm" type="submit">
                    Connect
                  </Button>
                </form>
              </>
            )}
          </div>
        </div>

        {/* Outlook Calendar */}
        <div className="flex items-center justify-between rounded-lg border border-border px-5 py-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">Outlook Calendar</span>
            <span className="text-xs text-muted-foreground">
              Push your litigation events and deadlines to Outlook Calendar.
            </span>
          </div>
          <Badge variant="secondary">Coming Soon</Badge>
        </div>

        {/* Apple Calendar */}
        <div className="flex items-center justify-between rounded-lg border border-border px-5 py-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">Apple Calendar</span>
            <span className="text-xs text-muted-foreground">
              Push your litigation events and deadlines to iCloud Calendar.
            </span>
          </div>
          <Badge variant="secondary">Coming Soon</Badge>
        </div>
      </div>
    </div>
  );
}
