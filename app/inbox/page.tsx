import { redirect } from "next/navigation";

export default async function InboxPage() {
  redirect("/notifications");
}
