import { auth } from "@clerk/nextjs/server";
import CalendarView from "@/components/calendar/CalendarView";
import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

export default async function HomePage() {
  const { userId } = await auth();

  if (!userId) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center gap-8 text-center px-4 bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-slate-950 flex items-center justify-center text-white font-bold text-xl mb-1">
            V
          </div>
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Veritas Litigation
            </h1>
            <p className="text-sm text-slate-500 max-w-xs">
              Calendar-first litigation management. Track deadlines, hearings, and case events — all in one place.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <SignInButton mode="modal">
            <Button variant="outline" className="min-w-28">Sign In</Button>
          </SignInButton>
          <SignUpButton mode="modal">
            <Button className="min-w-28 bg-teal-700 hover:bg-teal-800 text-white border-0">
              Get Started
            </Button>
          </SignUpButton>
        </div>
      </div>
    );
  }

  return <CalendarView />;
}
