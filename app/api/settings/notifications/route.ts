import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const PREF_FIELDS = [
  "taskAssignedEmails",
  "taskDueEmails",
  "eventReminderEmails",
  "deadlineReminderEmails",
  "discoveryReminderEmails",
  "remoteAppearanceReminderEmails",
  "ruleApprovalEmails",
] as const;

type PrefField = (typeof PREF_FIELDS)[number];

function serializePreferences(preferences: Record<PrefField, boolean>) {
  return Object.fromEntries(PREF_FIELDS.map((field) => [field, preferences[field]]));
}

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const preferences = await prisma.userNotificationPreference.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
  });

  return NextResponse.json({ preferences: serializePreferences(preferences) });
}

export async function PATCH(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as Partial<Record<PrefField, boolean>>;
  const data: Partial<Record<PrefField, boolean>> = {};
  for (const field of PREF_FIELDS) {
    if (typeof body[field] === "boolean") data[field] = body[field];
  }

  const preferences = await prisma.userNotificationPreference.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data },
    update: data,
  });

  return NextResponse.json({ preferences: serializePreferences(preferences) });
}
