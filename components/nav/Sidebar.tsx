"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  Briefcase,
  CheckSquare,
  Inbox,
  FileText,
  Users,
  BarChart2,
  Settings,
  Building2,
  Plus,
  LogOut,
} from "lucide-react";
import NotificationBell from "./NotificationBell";
import { EVENT_TYPE_COLORS, EventType } from "@/lib/google-calendar";

const NAV_ITEMS = [
  { label: "Calendar",  href: "/",         icon: CalendarDays },
  { label: "Cases",     href: "/cases",     icon: Briefcase },
  { label: "Tasks",     href: "/tasks",     icon: CheckSquare },
  { label: "Inbox",     href: "/inbox",     icon: Inbox },
  { label: "Documents", href: "/documents", icon: FileText },
  { label: "Contacts",  href: "/contacts",  icon: Users },
  { label: "Reports",   href: "/reports",      icon: BarChart2 },
  { label: "Team",      href: "/settings/team", icon: Building2 },
  { label: "Settings",  href: "/settings",     icon: Settings },
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
    <aside className="w-[256px] shrink-0 flex flex-col bg-sidebar text-sidebar-foreground h-full border-r border-sidebar-border">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 shrink-0">
        <Image src="/litcal-logo.svg" alt="LitCal" width={36} height={36} className="size-9 shrink-0 rounded-lg shadow-sm ring-1 ring-black/5" priority />
        <div className="leading-tight">
          <div className="text-[15px] font-extrabold tracking-[0.1em] text-slate-950 uppercase">LitCal</div>
          <div className="text-[11px] font-medium text-slate-500">Litigation calendar</div>
        </div>
      </div>

      {/* Workspace */}
      <div className="px-4 pb-4 shrink-0">
        <Link
          href="/settings/team"
          className="flex w-full items-center gap-2 rounded-lg border border-sidebar-border bg-white/70 px-3 py-2.5 text-sm text-slate-700 shadow-sm transition-colors hover:bg-white"
        >
          <Building2 className="size-4 text-slate-500" />
          <span className="truncate">LitCal Team</span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-1 px-4 flex-1 min-h-0 overflow-y-auto">
        {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
          const isActive = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                isActive
                  ? "bg-white text-slate-950 shadow-sm ring-1 ring-sidebar-border"
                  : "text-slate-600 hover:text-slate-950 hover:bg-white/65"
              }`}
            >
              <span className={`grid size-7 place-items-center rounded-md transition-colors ${
                isActive ? "bg-teal-50 text-teal-700" : "text-slate-500 group-hover:bg-slate-100 group-hover:text-slate-800"
              }`}>
                <Icon className="w-4 h-4 shrink-0" />
              </span>
              <span className="flex-1 font-medium">{label}</span>
            </Link>
          );
        })}
        <NotificationBell />

        {/* MY CALENDARS */}
        <div className="mt-6 mb-1 px-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            My Calendars
          </span>
        </div>
        {MY_CALENDARS.map(({ label, type }) => (
          <div key={label} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-950 hover:bg-white/65 cursor-pointer transition-colors">
            <span className={`w-4 h-4 rounded-[5px] shrink-0 ${EVENT_TYPE_COLORS[type].dot} shadow-sm`} />
            {label}
          </div>
        ))}
        <div className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-slate-500 hover:text-slate-800 cursor-pointer transition-colors">
          <Plus className="w-4 h-4 shrink-0" />
          Add Calendar
        </div>
      </nav>

      {/* Bottom */}
      <div className="px-4 py-4 border-t border-sidebar-border flex items-center gap-2">
        <form action="/api/auth/sign-out" method="post" className="w-full">
          <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-white/70 hover:text-slate-950">
            <LogOut className="size-4" />
            Sign Out
          </button>
        </form>
      </div>
    </aside>
  );
}
