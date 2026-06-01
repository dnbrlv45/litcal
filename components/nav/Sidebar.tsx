"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton, OrganizationSwitcher } from "@clerk/nextjs";
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
  ChevronLeft,
  Plus,
} from "lucide-react";
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
    <aside className="w-[248px] shrink-0 flex flex-col bg-white text-slate-950 h-full border-r border-slate-200/80">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 shrink-0">
        <div className="w-9 h-9 rounded-lg bg-slate-950 flex items-center justify-center text-white font-bold text-lg shrink-0 shadow-sm">
          V
        </div>
        <div className="leading-tight">
          <div className="text-[13px] font-extrabold tracking-[0.24em] text-slate-950 uppercase">Veritas</div>
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-[0.32em]">Litigation</div>
        </div>
      </div>

      {/* Org switcher */}
      <div className="px-4 pb-4 shrink-0">
        <OrganizationSwitcher
          hidePersonal={false}
          afterCreateOrganizationUrl="/"
          afterSelectOrganizationUrl="/"
          afterLeaveOrganizationUrl="/"
          appearance={{
            elements: {
              rootBox: "w-full",
              organizationSwitcherTrigger:
                "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-100 transition-colors border border-slate-200 bg-slate-50/80",
              organizationSwitcherTriggerIcon: "text-slate-500",
            },
          }}
        />
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-1 px-4 flex-1 min-h-0 overflow-y-auto">
        {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
          const isActive = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-violet-50 text-violet-700 shadow-[inset_0_0_0_1px_rgba(124,58,237,0.08)]"
                  : "text-slate-700 hover:text-slate-950 hover:bg-slate-100"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="flex-1">{label}</span>
              {label === "Tasks" && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">12</span>}
              {label === "Inbox" && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">7</span>}
            </Link>
          );
        })}

        {/* MY CALENDARS */}
        <div className="mt-6 mb-1 px-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            My Calendars
          </span>
        </div>
        {MY_CALENDARS.map(({ label, type }) => (
          <div key={label} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-700 hover:text-slate-950 hover:bg-slate-100 cursor-pointer transition-colors">
            <span className={`w-4 h-4 rounded-[5px] shrink-0 ${EVENT_TYPE_COLORS[type].dot} shadow-sm`} />
            {label}
          </div>
        ))}
        <div className="flex items-center gap-3 px-3 py-2 text-sm text-slate-500 hover:text-slate-800 cursor-pointer transition-colors">
          <Plus className="w-4 h-4 shrink-0" />
          Add Calendar
        </div>
      </nav>

      {/* Bottom */}
      <div className="px-4 py-4 border-t border-slate-200/80 flex items-center gap-2">
        <UserButton
          appearance={{
            elements: {
              avatarBox: "w-7 h-7",
            },
          }}
        />
        <span className="text-xs text-slate-500 truncate flex-1">Account</span>
        <ChevronLeft className="w-4 h-4 text-slate-400" />
      </div>
    </aside>
  );
}
