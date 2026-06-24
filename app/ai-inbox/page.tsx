import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import AIInboxClient from "./AIInboxClient";

export const metadata: Metadata = { title: "AI Inbox — LitCal" };

export default async function AIInboxPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return <AIInboxClient isSuperAdmin={user.isSuperAdmin} />;
}
