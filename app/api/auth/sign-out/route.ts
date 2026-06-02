import { NextRequest, NextResponse } from "next/server";
import { clearSession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const response = NextResponse.redirect(new URL("/sign-in", baseUrl));
  await clearSession(response);
  return response;
}
