import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentWorkspace } from "@/lib/workspaces";
import AIInboxClient from "./AIInboxClient";

export const metadata: Metadata = { title: "AI Inbox — LitCal" };

export default async function AIInboxPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const { membership } = await getCurrentWorkspace(user.id);
  if (membership?.role === "VIEWER") redirect("/");
  return <AIInboxClient isSuperAdmin={user.isSuperAdmin} />;
}
