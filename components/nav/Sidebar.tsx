"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  Briefcase,
  CheckSquare,
  FileText,
  Users,
  BarChart2,
  Settings,
  Building2,
  Plus,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import InboxNavItem from "./InboxNavItem";
import { EVENT_TYPE_COLORS, EventType } from "@/lib/google-calendar";

const NAV_ITEMS = [
  { label: "Calendar",  href: "/",         icon: CalendarDays },
  { label: "Cases",     href: "/cases",     icon: Briefcase },
  { label: "Tasks",     href: "/tasks",     icon: CheckSquare },
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
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    void Promise.resolve().then(() => {
      setCollapsed(localStorage.getItem("litcal-sidebar-collapsed") === "true");
    });
  }, []);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      localStorage.setItem("litcal-sidebar-collapsed", String(next));
      return next;
    });
  }

  function isNavItemActive(href: string) {
    if (href === "/") return pathname === "/";
    if (href === "/settings") {
      return pathname === "/settings" || pathname.startsWith("/settings/calendar");
    }
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <aside className={`hidden md:flex shrink-0 flex-col bg-sidebar text-sidebar-foreground h-full border-r border-sidebar-border transition-[width] duration-200 ${
      collapsed ? "w-[76px]" : "w-[256px]"
    }`}>
      {/* Logo */}
      <div className={`flex items-center gap-3 py-5 shrink-0 ${collapsed ? "justify-center px-3" : "px-5"}`}>
        <Image src="/litcal-logo.svg" alt="LitCal" width={36} height={36} className="size-9 shrink-0 rounded-lg shadow-sm ring-1 ring-black/5" priority />
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <div className="text-[15px] font-extrabold tracking-[0.1em] text-slate-950 uppercase">LitCal</div>
            <div className="text-[11px] font-medium text-slate-500">Litigation calendar</div>
          </div>
        )}
      </div>

      <div className={`shrink-0 ${collapsed ? "px-3 pb-3" : "px-4 pb-3"}`}>
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={`group relative flex h-9 w-full items-center rounded-lg border border-sidebar-border bg-white/70 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:bg-white hover:text-slate-950 ${
            collapsed ? "justify-center px-2" : "justify-between px-3"
          }`}
        >
          {!collapsed && <span>Collapse</span>}
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          {collapsed && <CollapsedTooltip label="Expand sidebar" />}
        </button>
      </div>

      {!collapsed && (
        <div className="px-4 pb-4 shrink-0">
          <Link
            href="/settings/team"
            className="flex w-full items-center gap-2 rounded-lg border border-sidebar-border bg-white/70 px-3 py-2.5 text-sm text-slate-700 shadow-sm transition-colors hover:bg-white"
          >
            <Building2 className="size-4 text-slate-500" />
            <span className="truncate">LitCal Team</span>
          </Link>
        </div>
      )}

      {/* Nav */}
      <nav className={`flex flex-col gap-1 flex-1 min-h-0 ${collapsed ? "overflow-visible px-3" : "overflow-y-auto px-4"}`}>
        {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
          const isActive = isNavItemActive(href);
          return (
            <>
              <Link
                key={href}
                href={href}
                aria-label={label}
                className={`group relative flex items-center rounded-lg text-sm transition-all ${
                  collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5"
                } ${
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
                {!collapsed && <span className="flex-1 font-medium">{label}</span>}
                {collapsed && <CollapsedTooltip label={label} />}
              </Link>
              {href === "/tasks" && <InboxNavItem key="inbox" collapsed={collapsed} />}
            </>
          );
        })}

        {/* MY CALENDARS */}
        {!collapsed && (
          <>
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
          </>
        )}
      </nav>

      {/* Bottom */}
      <div className={`py-4 border-t border-sidebar-border flex items-center gap-2 ${collapsed ? "px-3" : "px-4"}`}>
        <form action="/api/auth/sign-out" method="post" className="w-full">
          <button
            aria-label="Sign Out"
            className={`group relative flex w-full items-center rounded-lg py-2 text-sm font-medium text-slate-600 hover:bg-white/70 hover:text-slate-950 ${
              collapsed ? "justify-center px-2" : "gap-2 px-3"
            }`}
          >
            <LogOut className="size-4" />
            {!collapsed && "Sign Out"}
            {collapsed && <CollapsedTooltip label="Sign Out" />}
          </button>
        </form>
      </div>
    </aside>
  );
}

function CollapsedTooltip({ label }: { label: string }) {
  return (
    <span className="pointer-events-none invisible absolute left-[calc(100%+10px)] top-1/2 z-50 flex -translate-y-1/2 items-center gap-2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 opacity-0 shadow-lg transition-all duration-150 group-hover:visible group-hover:opacity-100 group-focus-visible:visible group-focus-visible:opacity-100">
      <span className="size-1.5 rounded-full bg-teal-500" />
      {label}
    </span>
  );
}
