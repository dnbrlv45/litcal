import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import CaseDetailClient from "./CaseDetailClient";

export default async function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const { id } = await params;
  return <CaseDetailClient id={id} />;
}
