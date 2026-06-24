import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import CaseImportClient from "./CaseImportClient";

export default async function CaseImportPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return <CaseImportClient />;
}
