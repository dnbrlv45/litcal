"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CalendarDays, Briefcase, CheckSquare, Settings } from "lucide-react";

const NAV_ITEMS = [
  { label: "Calendar", href: "/",        icon: CalendarDays },
  { label: "Cases",    href: "/cases",   icon: Briefcase },
  { label: "Tasks",    href: "/tasks",   icon: CheckSquare },
  { label: "Alerts",   href: "/notifications", icon: Bell },
  { label: "Settings", href: "/settings", icon: Settings },
];

export default function MobileNav() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    if (href === "/settings") return pathname === "/settings" || pathname.startsWith("/settings/");
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-stretch border-t border-slate-200 bg-white md:hidden">
      {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
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
    </nav>
  );
}
