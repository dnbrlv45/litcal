import CalendarView from "@/components/calendar/CalendarView";
import Image from "next/image";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";

export default async function HomePage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center gap-8 text-center px-4 bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <Image src="/litcal-logo.svg" alt="LitCal" width={56} height={56} className="mb-1 size-14 rounded-xl shadow-sm" priority />
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              LitCal
            </h1>
            <p className="text-sm text-slate-500 max-w-xs">
              Calendar-first litigation management. Track deadlines, hearings, and case events — all in one place.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/sign-in" className="inline-flex h-8 min-w-28 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 hover:bg-slate-50">
            Sign In
          </Link>
          <Link href="/sign-up" className="inline-flex h-8 min-w-28 items-center justify-center rounded-lg bg-teal-700 px-3 text-sm font-medium text-white hover:bg-teal-800">
            Get Started
          </Link>
        </div>
      </div>
    );
  }

  return <CalendarView />;
}
