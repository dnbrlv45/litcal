import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import CalendarConnections from "@/components/settings/CalendarConnections";

interface PageProps {
  searchParams: Promise<{ connected?: string; disconnected?: string; error?: string }>;
}

export default async function CalendarSettingsPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  const params = await searchParams;

  let googleCalendarConnected = false;
  let googleGmailConnected = false;

  if (user) {
    const connection = await prisma.userCalendarConnection.findFirst({
      where: { userId: user.id, provider: "GOOGLE" },
    });
    googleCalendarConnected = !!connection?.isActive;
    googleGmailConnected    = !!connection?.gmailRefreshToken;
  }

  return (
    <div className="p-8">
      {params.connected === "google" && (
        <div className="mb-6 rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800 max-w-2xl">
          Google Calendar connected successfully.
        </div>
      )}
      {params.connected === "gmail" && (
        <div className="mb-6 rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800 max-w-2xl">
          Gmail connected successfully.
        </div>
      )}
      {params.disconnected === "google" && (
        <div className="mb-6 rounded-md bg-muted border border-border px-4 py-3 text-sm text-muted-foreground max-w-2xl">
          Google Calendar disconnected.
        </div>
      )}
      {params.disconnected === "gmail" && (
        <div className="mb-6 rounded-md bg-muted border border-border px-4 py-3 text-sm text-muted-foreground max-w-2xl">
          Gmail disconnected.
        </div>
      )}
      {params.error && (
        <div className="mb-6 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800 max-w-2xl">
          {params.error === "denied"           && "Google access was denied."}
          {params.error === "invalid_state"    && "Authentication failed — please try again."}
          {params.error === "token_exchange"   && "Failed to connect — please try again."}
          {params.error === "no_refresh_token" && "Google did not return a refresh token — please try again."}
          {!["denied","invalid_state","token_exchange","no_refresh_token"].includes(params.error) &&
            "Something went wrong — please try again."}
        </div>
      )}
      <CalendarConnections
        googleCalendarConnected={googleCalendarConnected}
        googleGmailConnected={googleGmailConnected}
      />
    </div>
  );
}
