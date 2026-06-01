import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.redirect(new URL("/sign-in", BASE_URL));
  }

  // Soft-delete the connection — preserve the row for audit purposes
  await prisma.userCalendarConnection.updateMany({
    where: { userId, provider: "GOOGLE", isActive: true },
    data: { isActive: false, disconnectedAt: new Date() },
  });

  return NextResponse.redirect(new URL("/settings/calendar?disconnected=google", BASE_URL));
}
