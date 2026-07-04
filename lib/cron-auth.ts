import crypto from "crypto";
import type { NextRequest } from "next/server";

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Authorizes a request from our external cron scheduler (cron-job.org).
 * cron-job.org is configured to send the shared secret either as
 * `Authorization: Bearer <CRON_SECRET>` (preferred) or `?secret=<CRON_SECRET>`.
 * Fails closed: if CRON_SECRET is unset, every request is rejected.
 */
export function isAuthorizedCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ") && safeEqual(authHeader.slice(7), secret)) {
    return true;
  }

  const urlSecret = new URL(req.url).searchParams.get("secret");
  if (urlSecret && safeEqual(urlSecret, secret)) {
    return true;
  }

  return false;
}
