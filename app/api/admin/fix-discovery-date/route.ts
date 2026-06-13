import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const c = await prisma.case.findFirst({ where: { caseNumber: "25NVVCV03295" }, select: { id: true } });
  if (!c) return NextResponse.json({ error: "Case not found" }, { status: 404 });

  const result = await prisma.discoveryItem.updateMany({
    where: { caseId: c.id, currentDueDate: new Date("2026-06-13") },
    data: { currentDueDate: new Date("2026-06-15"), originalDueDate: new Date("2026-06-15") },
  });

  return NextResponse.json({ updated: result.count });
}
