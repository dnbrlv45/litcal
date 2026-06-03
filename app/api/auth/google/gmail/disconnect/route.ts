import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const user = await requireUser();
  if (!user) return NextResponse.redirect(new URL("/sign-in", baseUrl));

  const connection = await prisma.userCalendarConnection.findFirst({
    where: { userId: user.id, provider: "GOOGLE" },
  });

  if (connection) {
    await prisma.userCalendarConnection.update({
      where: { id: connection.id },
      data: { gmailRefreshToken: null, gmailConnectedAt: null },
    });
  }

  return NextResponse.redirect(new URL("/settings/calendar?disconnected=gmail", baseUrl));
}
