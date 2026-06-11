import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentWorkspace } from "@/lib/workspaces";
import { prisma } from "@/lib/prisma";
import NotificationPreferences from "@/components/settings/NotificationPreferences";

export default async function NotificationSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const { workspace } = await getCurrentWorkspace(user.id);
  if (!workspace) redirect("/setup");

  const preferences = await prisma.userNotificationPreference.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
  });

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 p-8">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">Notifications</h1>
        <p className="mt-1 text-sm text-slate-500">Manage optional LitCal email notifications.</p>
        <div className="mt-6">
          <NotificationPreferences
            initialPreferences={{
              taskAssignedEmails: preferences.taskAssignedEmails,
              taskDueEmails: preferences.taskDueEmails,
              deadlineReminderEmails: preferences.deadlineReminderEmails,
              discoveryReminderEmails: preferences.discoveryReminderEmails,
              remoteAppearanceReminderEmails: preferences.remoteAppearanceReminderEmails,
              ruleApprovalEmails: preferences.ruleApprovalEmails,
            }}
          />
        </div>
      </div>
    </div>
  );
}
