import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import CasesClient from "./CasesClient";

export default async function CasesPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  return <CasesClient />;
}
