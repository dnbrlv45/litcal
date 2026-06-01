import { auth } from "@clerk/nextjs/server";
import CalendarView from "@/components/calendar/CalendarView";
import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

export default async function HomePage() {
  const { userId } = await auth();

  if (!userId) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center gap-6 text-center px-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Your litigation calendar
          </h1>
          <p className="text-sm text-muted-foreground max-w-sm">
            Track deadlines, hearings, and case events — all in one place. Sign in to get started.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SignInButton mode="modal">
            <Button variant="outline">Sign In</Button>
          </SignInButton>
          <SignUpButton mode="modal">
            <Button>Get Started</Button>
          </SignUpButton>
        </div>
      </div>
    );
  }

  return <CalendarView />;
}
