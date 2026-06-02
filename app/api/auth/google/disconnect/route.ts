import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const user = await requireUser();
  if (!user) {
    return NextResponse.redirect(new URL("/sign-in", baseUrl));
  }

  // Soft-delete the connection — preserve the row for audit purposes
  await prisma.userCalendarConnection.updateMany({
    where: { userId: user.id, provider: "GOOGLE", isActive: true },
    data: { isActive: false, disconnectedAt: new Date() },
  });

  return NextResponse.redirect(new URL("/settings/calendar?disconnected=google", baseUrl));
}
