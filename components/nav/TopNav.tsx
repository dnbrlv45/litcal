"use client";

import { Show, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { label: "Calendar", href: "/" },
  { label: "Cases", href: "/cases" },
  { label: "Inbox", href: "/inbox" },
  { label: "Tasks", href: "/tasks" },
  { label: "Settings", href: "/settings" },
];

export default function TopNav() {
  const pathname = usePathname();

  return (
    <header className="h-14 border-b border-border bg-background flex items-center px-6 gap-8 shrink-0">
      <span className="text-sm font-semibold tracking-tight text-foreground whitespace-nowrap">
        LitCal
      </span>

      <nav className="flex items-center gap-1 flex-1">
        {NAV_LINKS.map(({ label, href }) => {
          const isActive =
            href === "/"
              ? pathname === "/"
              : pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                isActive
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-2">
        <Show when="signed-out">
          <Link href="/sign-in" className="inline-flex h-7 items-center rounded-lg px-2.5 text-[0.8rem] font-medium text-slate-700 hover:bg-slate-100">
            Sign In
          </Link>
          <Link href="/sign-up" className="inline-flex h-7 items-center rounded-lg bg-slate-950 px-2.5 text-[0.8rem] font-medium text-white hover:bg-slate-800">
            Sign Up
          </Link>
        </Show>
        <Show when="signed-in">
          <UserButton />
        </Show>
      </div>
    </header>
  );
}
