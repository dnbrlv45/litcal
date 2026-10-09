import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { attachSession } from "@/lib/auth";
import { hashPassword, MIN_PASSWORD_LENGTH } from "@/lib/password";
import { rateLimit } from "@/lib/rate-limit";
import { createWorkspace, getCurrentWorkspace } from "@/lib/workspaces";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as
    | { email?: unknown; password?: unknown; firstName?: unknown; lastName?: unknown }
    | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const firstName = typeof body?.firstName === "string" ? body.firstName.trim() : "";
  const lastName = typeof body?.lastName === "string" ? body.lastName.trim() : "";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
      { status: 400 },
    );
  }
  if (!rateLimit(`sign-up:${request.headers.get("x-forwarded-for") ?? "unknown"}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return NextResponse.json(
      { error: "An account with this email already exists. Sign in instead." },
      { status: 409 },
    );
  }

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: hashPassword(password),
      firstName: firstName || null,
      lastName: lastName || null,
    },
  });

  // Accepts any pending invitation for this email; otherwise start a fresh workspace.
  const { workspace } = await getCurrentWorkspace(user.id);
  if (!workspace) await createWorkspace(user.id, "");

  const response = NextResponse.json({ ok: true });
  await attachSession(response, user.id);
  return response;
}
