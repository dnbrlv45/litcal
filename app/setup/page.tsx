import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentWorkspace } from "@/lib/workspaces";
import SetupClient from "./SetupClient";

export default async function SetupPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const { workspace } = await getCurrentWorkspace(user.id);
  if (workspace) redirect("/");

  return <SetupClient />;
}
