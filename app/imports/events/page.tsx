import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import EventImportClient from "./EventImportClient";

export default async function EventImportPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return <EventImportClient />;
}
