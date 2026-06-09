import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/counties — returns all counties with their courts
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const counties = await prisma.county.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      courts: {
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      },
    },
  });

  return NextResponse.json({ counties });
}
