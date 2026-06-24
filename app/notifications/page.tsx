import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import InboxClient from "../inbox/InboxClient";

export const metadata: Metadata = { title: "Notifications - LitCal" };

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return <InboxClient />;
}
