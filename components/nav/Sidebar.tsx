"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  Briefcase,
  CheckSquare,
  FileUp,
  BarChart2,
  Settings,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import InboxNavItem from "./InboxNavItem";
import AIInboxNavItem from "./AIInboxNavItem";
import DeadlinesNavItem from "./DeadlinesNavItem";
import { useAskLitCal } from "@/components/ask-litcal/AskLitCalContext";

const PRIMARY_NAV_ITEMS = [
  { label: "Calendar",  href: "/",            icon: CalendarDays },
  { label: "Cases",     href: "/cases",        icon: Briefcase },
  { label: "Tasks",     href: "/tasks",        icon: CheckSquare },
];

const WORKSPACE_NAV_ITEMS = [
  { label: "Reports",   href: "/reports",      icon: BarChart2 },
  { label: "Imports",   href: "/imports/cases",icon: FileUp },
  { label: "Settings",  href: "/settings",     icon: Settings },
];

export default function Sidebar({ isSuperAdmin = false, isViewer = false }: { isSuperAdmin?: boolean; isViewer?: boolean }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { openPanel: openAskLitCal } = useAskLitCal();

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
    if (href.startsWith("/imports")) {
      return pathname === href || pathname.startsWith("/imports/");
    }
    if (href === "/settings") {
      return pathname === "/settings" || pathname.startsWith("/settings/");
    }
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <aside className={`hidden md:flex h-full shrink-0 flex-col border-r border-nav-border bg-nav text-nav-foreground transition-[width] duration-200 ${
      collapsed ? "w-[76px]" : "w-[240px]"
    }`}>
      {/* Logo */}
      <div className={`flex shrink-0 items-center gap-3 py-5 ${collapsed ? "justify-center px-3" : "px-5"}`}>
        <Image src="/litcal-logo.svg" alt="LitCal" width={36} height={36} className="size-9 shrink-0 rounded-lg shadow-sm ring-1 ring-black/5" priority />
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <div className="text-[15px] font-extrabold tracking-[0.1em] text-nav-foreground uppercase">LitCal</div>
            <div className="text-[11px] font-medium text-nav-muted-foreground">Litigation calendar</div>
          </div>
        )}
      </div>

      <div className={`shrink-0 ${collapsed ? "px-3 pb-2" : "px-4 pb-3"}`}>
        {!collapsed && (
          <button
            type="button"
            onClick={() => openAskLitCal()}
            className="group mb-3 flex h-10 w-full items-center gap-3 rounded-lg bg-nav-accent px-3 text-sm font-semibold text-nav-foreground shadow-sm ring-1 ring-nav-border transition-colors hover:brightness-125"
          >
            <span className="grid size-7 place-items-center rounded-md bg-white/10 text-teal-100">
              <Sparkles className="size-4 shrink-0" />
            </span>
            <span className="flex-1 text-left">Ask LitCal</span>
          </button>
        )}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={`group relative flex h-9 w-full items-center rounded-lg border border-nav-border bg-nav-accent/50 text-sm font-medium text-nav-muted-foreground shadow-sm transition-colors hover:bg-nav-accent hover:text-nav-foreground ${
            collapsed ? "justify-center px-2" : "justify-between px-3"
          }`}
        >
          {!collapsed && <span>Collapse</span>}
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          {collapsed && <CollapsedTooltip label="Expand sidebar" />}
        </button>
      </div>

      {/* Nav */}
      <nav className={`flex min-h-0 flex-1 flex-col gap-1 ${collapsed ? "overflow-visible px-3" : "overflow-y-auto px-4"}`}>
        {PRIMARY_NAV_ITEMS.map(({ label, href, icon: Icon }) => (
          <NavLink
            key={href}
            href={href}
            label={label}
            icon={Icon}
            active={isNavItemActive(href)}
            collapsed={collapsed}
          />
        ))}
        {!isViewer && <AIInboxNavItem collapsed={collapsed} />}
        <InboxNavItem collapsed={collapsed} />
        <DeadlinesNavItem collapsed={collapsed} />

        {collapsed ? (
          <button
            onClick={() => openAskLitCal()}
            aria-label="Ask LitCal"
            className="group relative mt-3 flex items-center justify-center rounded-lg px-2 py-2.5 text-sm text-nav-muted-foreground transition-all hover:bg-nav-accent hover:text-nav-foreground"
          >
            <span className="grid size-7 place-items-center rounded-md text-nav-muted-foreground transition-colors group-hover:bg-white/10 group-hover:text-teal-200">
              <Sparkles className="size-4 shrink-0" />
            </span>
            <CollapsedTooltip label="Ask LitCal" />
          </button>
        ) : (
          <>
            <SectionLabel>Workspace</SectionLabel>
            {WORKSPACE_NAV_ITEMS.map(({ label, href, icon: Icon }) => (
              <NavLink
                key={href}
                href={href}
                label={label}
                icon={Icon}
                active={isNavItemActive(href)}
                collapsed={collapsed}
              />
            ))}
          </>
        )}
      </nav>

      {/* Bottom */}
      <div className={`py-4 border-t border-sidebar-border flex flex-col gap-1 ${collapsed ? "px-3" : "px-4"}`}>
        {isSuperAdmin && (
          <>
            <Link
              href="/admin/court-coverage"
              aria-label="Court Coverage"
              className={`group relative flex items-center rounded-lg text-sm transition-all ${
                collapsed ? "justify-center px-2 py-2.5" : "gap-2 px-3 py-2"
              } ${
                pathname === "/admin/court-coverage"
                  ? "bg-nav-accent text-nav-foreground shadow-sm ring-1 ring-nav-border"
                  : "text-nav-muted-foreground hover:text-nav-foreground hover:bg-nav-accent"
              }`}
            >
              <ShieldAlert className="size-4 shrink-0" />
              {!collapsed && <span className="font-medium">Coverage</span>}
              {collapsed && <CollapsedTooltip label="Court Coverage" />}
            </Link>
            <Link
              href="/admin/court-rules"
              aria-label="Court Rules"
              className={`group relative flex items-center rounded-lg text-sm transition-all ${
                collapsed ? "justify-center px-2 py-2.5" : "gap-2 px-3 py-2"
              } ${
                pathname.startsWith("/admin/court-rules")
                  ? "bg-nav-accent text-nav-foreground shadow-sm ring-1 ring-nav-border"
                  : "text-nav-muted-foreground hover:text-nav-foreground hover:bg-nav-accent"
              }`}
            >
              <Settings className="size-4 shrink-0" />
              {!collapsed && <span className="font-medium">Court Rules</span>}
              {collapsed && <CollapsedTooltip label="Court Rules" />}
            </Link>
          </>
        )}
        <form action="/api/auth/sign-out" method="post" className="w-full">
          <button
            aria-label="Sign Out"
            className={`group relative flex w-full items-center rounded-lg py-2 text-sm font-medium text-nav-muted-foreground hover:bg-nav-accent hover:text-nav-foreground ${
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

type NavLinkProps = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  active: boolean;
  collapsed: boolean;
};

function NavLink({ href, label, icon: Icon, active, collapsed }: NavLinkProps) {
  return (
    <Link
      href={href}
      aria-label={label}
      className={`group relative flex items-center rounded-lg text-sm transition-all ${
        collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5"
      } ${
        active
          ? "bg-nav-accent text-nav-foreground shadow-sm ring-1 ring-nav-border"
          : "text-nav-muted-foreground hover:bg-nav-accent hover:text-nav-foreground"
      }`}
    >
      <span className={`grid size-7 place-items-center rounded-md transition-colors ${
        active ? "bg-white/10 text-teal-200" : "text-nav-muted-foreground group-hover:bg-white/10 group-hover:text-nav-foreground"
      }`}>
        <Icon className="size-4 shrink-0" />
      </span>
      {!collapsed && <span className="flex-1 font-medium">{label}</span>}
      {collapsed && <CollapsedTooltip label={label} />}
    </Link>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1 mt-5 px-3">
      <span className="text-[10px] font-bold uppercase tracking-widest text-nav-muted-foreground">
        {children}
      </span>
    </div>
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
