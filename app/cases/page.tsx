import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import CasesClient from "./CasesClient";

export default async function CasesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return <CasesClient />;
}
