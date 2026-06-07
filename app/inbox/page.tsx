import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import InboxClient from "./InboxClient";

export default async function InboxPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return <InboxClient />;
}
