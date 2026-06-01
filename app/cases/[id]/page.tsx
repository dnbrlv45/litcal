import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import CaseDetailClient from "./CaseDetailClient";

export default async function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { id } = await params;
  return <CaseDetailClient id={id} />;
}
