import { prisma } from "@/lib/prisma";

export interface ResolvedRule {
  id: string;
  appearanceType: string | null;
  phoneNumber: string | null;
  bridge: string | null;
  password: string | null;
  remoteLink: string | null;
  requestRequired: boolean;
  requestContactEmail: string | null;
  requestNotes: string | null;
  requestDaysBefore: number | null;
}

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

/**
 * Find the best-matching CourtHearingRule for a given county/court/department.
 * Priority: department > court-wide > county-wide.
 */
export async function findCourtHearingRule(opts: {
  countyName?: string | null;
  courtName?: string | null;
  department?: string | null;
}): Promise<ResolvedRule | null> {
  const { countyName, courtName, department } = opts;
  if (!countyName) return null;

  const cn = norm(countyName);
  const ct = norm(courtName);
  const dp = norm(department);

  const candidates = await prisma.courtHearingRule.findMany({
    where: {
      active: true,
      countyName: { equals: cn, mode: "insensitive" },
    },
    select: {
      id: true,
      courtName: true,
      department: true,
      appearanceType: true,
      phoneNumber: true,
      bridge: true,
      password: true,
      remoteLink: true,
      requestRequired: true,
      requestContactEmail: true,
      requestNotes: true,
      requestDaysBefore: true,
    },
  });

  // 1. county + court + department
  if (ct && dp) {
    const match = candidates.find(
      (r) => norm(r.courtName) === ct && norm(r.department) === dp
    );
    if (match) return toResolved(match);
  }

  // 2. county + court (department = null)
  if (ct) {
    const match = candidates.find(
      (r) => norm(r.courtName) === ct && !r.department
    );
    if (match) return toResolved(match);
  }

  // 3. county-wide (courtName = null, department = null)
  const match = candidates.find((r) => !r.courtName && !r.department);
  return match ? toResolved(match) : null;
}

function toResolved(r: {
  id: string;
  appearanceType: string | null;
  phoneNumber: string | null;
  bridge: string | null;
  password: string | null;
  remoteLink: string | null;
  requestRequired: boolean;
  requestContactEmail: string | null;
  requestNotes: string | null;
  requestDaysBefore: number | null;
}): ResolvedRule {
  return {
    id: r.id,
    appearanceType: r.appearanceType,
    phoneNumber: r.phoneNumber,
    bridge: r.bridge,
    password: r.password,
    remoteLink: r.remoteLink,
    requestRequired: r.requestRequired,
    requestContactEmail: r.requestContactEmail,
    requestNotes: r.requestNotes,
    requestDaysBefore: r.requestDaysBefore,
  };
}

/**
 * Compute the remote appearance task due date.
 * Defaults to 7 calendar days before the event; uses requestDaysBefore if set.
 * Weekend adjustment: Sat/Sun → Friday.
 */
export function computeRemoteAppearanceDueDate(eventDate: Date, daysBefore?: number | null): Date {
  const d = new Date(eventDate);
  d.setDate(d.getDate() - (daysBefore ?? 7));
  const dow = d.getDay();
  if (dow === 0) d.setDate(d.getDate() - 2);
  if (dow === 6) d.setDate(d.getDate() - 1);
  return d;
}
