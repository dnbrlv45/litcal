"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import {
  CalendarDays,
  Briefcase,
  CheckSquare,
  Inbox,
  FileText,
  Users,
  BarChart2,
  Settings,
  ChevronLeft,
} from "lucide-react";
import { EVENT_TYPE_COLORS, EventType } from "@/lib/google-calendar";

const NAV_ITEMS = [
  { label: "Calendar",  href: "/",         icon: CalendarDays },
  { label: "Cases",     href: "/cases",     icon: Briefcase },
  { label: "Tasks",     href: "/tasks",     icon: CheckSquare },
  { label: "Inbox",     href: "/inbox",     icon: Inbox },
  { label: "Documents", href: "/documents", icon: FileText },
  { label: "Contacts",  href: "/contacts",  icon: Users },
  { label: "Reports",   href: "/reports",   icon: BarChart2 },
  { label: "Settings",  href: "/settings",  icon: Settings },
];

const MY_CALENDARS: { label: string; type: EventType }[] = [
  { label: "My Events",   type: "OTHER" },
  { label: "Hearings",    type: "HEARING" },
  { label: "Depositions", type: "DEPOSITION" },
  { label: "Mediations",  type: "CONFERENCE" },
  { label: "Trials",      type: "TRIAL" },
  { label: "Deadlines",   type: "DEADLINE" },
  { label: "Reminders",   type: "REMINDER" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 shrink-0 flex flex-col bg-slate-900 text-slate-100 h-full">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-slate-700/60">
        <div className="w-7 h-7 rounded-md bg-indigo-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
          V
        </div>
        <div className="leading-tight">
          <div className="text-xs font-bold tracking-wide text-white uppercase">Veritas</div>
          <div className="text-[10px] text-slate-400 uppercase tracking-widest">Litigation</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 px-2 pt-3 flex-1 min-h-0 overflow-y-auto">
        {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
          const isActive = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-indigo-600 text-white"
                  : "text-slate-300 hover:text-white hover:bg-slate-800"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          );
        })}

        {/* MY CALENDARS */}
        <div className="mt-5 mb-1 px-3">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            My Calendars
          </span>
        </div>
        {MY_CALENDARS.map(({ label, type }) => (
          <div key={label} className="flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer transition-colors">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${EVENT_TYPE_COLORS[type].dot}`} />
            {label}
          </div>
        ))}
        <div className="flex items-center gap-3 px-3 py-1.5 text-sm text-slate-500 hover:text-slate-300 cursor-pointer transition-colors">
          <span className="w-2.5 h-2.5 rounded-full border border-dashed border-slate-600 shrink-0" />
          Add Calendar
        </div>
      </nav>

      {/* Bottom */}
      <div className="px-3 py-3 border-t border-slate-700/60 flex items-center gap-2">
        <UserButton
          appearance={{
            elements: {
              avatarBox: "w-7 h-7",
            },
          }}
        />
        <span className="text-xs text-slate-400 truncate flex-1">Account</span>
        <ChevronLeft className="w-4 h-4 text-slate-600" />
      </div>
    </aside>
  );
}
