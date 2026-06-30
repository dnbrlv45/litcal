"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CalendarDays, Briefcase, CheckSquare, Settings, Inbox, Sparkles } from "lucide-react";
import { useAskLitCal } from "@/components/ask-litcal/AskLitCalContext";

const NAV_ITEMS = [
  { label: "Calendar", href: "/",             icon: CalendarDays, viewerHidden: false },
  { label: "Cases",    href: "/cases",        icon: Briefcase,    viewerHidden: false },
  { label: "Tasks",    href: "/tasks",        icon: CheckSquare,  viewerHidden: false },
  { label: "AI Inbox", href: "/ai-inbox",     icon: Inbox,        viewerHidden: true  },
  { label: "Alerts",   href: "/notifications",icon: Bell,         viewerHidden: false },
  { label: "Settings", href: "/settings",     icon: Settings,     viewerHidden: false },
];

export default function MobileNav({ isViewer = false }: { isViewer?: boolean }) {
  const pathname = usePathname();
  const { openPanel: openAskLitCal } = useAskLitCal();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    if (href === "/settings") return pathname === "/settings" || pathname.startsWith("/settings/");
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-stretch border-t border-slate-200 bg-white md:hidden">
      {NAV_ITEMS.filter(({ viewerHidden }) => !(isViewer && viewerHidden)).map(({ label, href, icon: Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors ${
              active ? "text-teal-700" : "text-slate-500"
            }`}
          >
            <Icon className={`size-5 ${active ? "text-teal-700" : "text-slate-400"}`} />
            {label}
          </Link>
        );
      })}
      <button
        onClick={() => openAskLitCal()}
        className="flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium text-slate-500 transition-colors"
      >
        <span className="grid size-7 place-items-center rounded-md bg-slate-950 text-white">
          <Sparkles className="size-4" />
        </span>
        Ask
      </button>
    </nav>
  );
}
