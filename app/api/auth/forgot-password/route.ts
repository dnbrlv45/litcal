import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendLitCalEmail } from "@/lib/google-mail";
import { rateLimit } from "@/lib/rate-limit";

const TOKEN_TTL_MS = 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) {
    return NextResponse.json({ error: "Enter your email." }, { status: 400 });
  }

  if (!rateLimit(`forgot-password:${email}`, 3, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests. Try again in a few minutes." }, { status: 429 });
  }

  // Same response whether or not the account exists, so this can't be used to probe emails.
  const ok = NextResponse.json({ ok: true });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return ok;

  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + TOKEN_TTL_MS) },
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const resetUrl = `${baseUrl}/reset-password?token=${token}`;
  const name = user.firstName ? ` ${user.firstName}` : "";

  try {
    await sendLitCalEmail({
      recipientEmail: user.email,
      subject: "Reset your LitCal password",
      text: [
        `Hi${name},`,
        "",
        "Use the link below to set a new LitCal password. It expires in 1 hour.",
        "",
        resetUrl,
        "",
        "If you didn't request this, you can ignore this email.",
      ].join("\n"),
      html: `<p>Hi${name},</p><p>Use the link below to set a new LitCal password. It expires in 1 hour.</p><p><a href="${resetUrl}">Set your password</a></p><p>If you didn't request this, you can ignore this email.</p>`,
    });
  } catch (error) {
    console.error("Password reset email failed:", error);
  }

  return ok;
}
