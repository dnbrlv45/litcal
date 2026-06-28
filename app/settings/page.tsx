import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, CalendarClock, Download, ShieldCheck, Users } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentWorkspace } from "@/lib/workspaces";
import DeleteWorkspaceSection from "@/components/settings/DeleteWorkspaceSection";

const SETTINGS_LINKS = [
  {
    title: "Calendar Integrations",
    description: "Connect Google Calendar and manage sync behavior.",
    href: "/settings/calendar",
    icon: CalendarClock,
  },
  {
    title: "Notifications",
    description: "Choose reminder and email notification preferences.",
    href: "/settings/notifications",
    icon: Bell,
  },
  {
    title: "Team",
    description: "Invite members and manage workspace access.",
    href: "/settings/team",
    icon: Users,
  },
  {
    title: "Exports",
    description: "Download workspace data and reporting files.",
    href: "/settings/exports",
    icon: Download,
  },
  {
    title: "Court Rules",
    description: "Request coverage for courts and deadline rules.",
    href: "/settings/court-rules",
    icon: ShieldCheck,
  },
];

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const { workspace, membership } = await getCurrentWorkspace(user.id);
  if (!workspace || !membership) redirect("/setup");
  const isOwner = membership.role === "OWNER";

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 p-8">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage integrations, preferences, and workspace safety.</p>
        <Separator className="my-6" />
        <div className="grid gap-3 sm:grid-cols-2">
          {SETTINGS_LINKS.map(({ title, description, href, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="group flex min-h-28 items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-teal-200 hover:bg-teal-50/30"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600 transition-colors group-hover:bg-teal-100 group-hover:text-teal-800">
                <Icon className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-950">{title}</span>
                <span className="mt-1 block text-sm leading-5 text-slate-500">{description}</span>
              </span>
            </Link>
          ))}
          <div className="sm:col-span-2">
            {isOwner && <DeleteWorkspaceSection workspaceName={workspace.name} />}
          </div>
        </div>
      </div>
    </div>
  );
}
