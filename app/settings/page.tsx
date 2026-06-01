import Link from "next/link";
import { Separator } from "@/components/ui/separator";

export default function SettingsPage() {
  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-xl font-semibold">Settings</h1>
      <p className="text-sm text-muted-foreground mt-1">Manage your account and integrations.</p>
      <Separator className="my-6" />
      <div className="flex flex-col gap-2">
        <Link
          href="/settings/calendar"
          className="text-sm px-3 py-2 rounded-md hover:bg-accent text-foreground transition-colors"
        >
          Calendar Connections
        </Link>
      </div>
    </div>
  );
}
