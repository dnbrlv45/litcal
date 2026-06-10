import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findCourtHearingRule } from "@/lib/court-hearing-rules";
import { getAccessToken, patchGoogleEvent } from "@/lib/google-calendar";

// POST /api/admin/court-coverage/resolve
// Body: { alertId: string; updateEvents: boolean }
// Marks the alert resolved and optionally updates matching future events.
export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isSuperAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { alertId, updateEvents } = (await request.json()) as {
    alertId: string;
    updateEvents: boolean;
  };

  const alert = await prisma.courtCoverageAlert.findUnique({ where: { id: alertId } });
  if (!alert) return NextResponse.json({ error: "Alert not found" }, { status: 404 });
  if (alert.resolved) return NextResponse.json({ error: "Already resolved" }, { status: 409 });

  let eventsUpdated = 0;

  if (updateEvents) {
    const rule = await findCourtHearingRule({
      state: alert.state,
      countyName: alert.county,
      courtName: alert.court || null,
      department: alert.department || null,
    });

    if (rule) {
      const now = new Date();
      const where =
        alert.alertType === "COUNTY"
          ? {
              courtRuleUnmatched: true,
              startTime: { gte: now },
              OR: [
                { countyName: { equals: alert.county, mode: "insensitive" as const } },
                { caseRef: { county: { equals: alert.county, mode: "insensitive" as const } } },
              ],
            }
          : {
              courtRuleUnmatched: true,
              startTime: { gte: now },
              department: { equals: alert.department, mode: "insensitive" as const },
            };

      const events = await prisma.event.findMany({
        where,
        select: {
          id: true,
          userId: true,
          department: true,
          description: true,
          googleSync: { select: { googleEventId: true, googleCalendarId: true } },
        },
      });

      for (const ev of events) {
        // Update only auto-populated rule fields; never touch user-authored fields.
        await prisma.event.update({
          where: { id: ev.id },
          data: {
            courtHearingRuleId: rule.id,
            courtRuleUnmatched: false,
            appearanceType: rule.appearanceType,
            remoteLink: rule.remoteLink,
            phoneNumber: rule.phoneNumber,
            bridge: rule.bridge,
            remotePassword: rule.password,
            requestRequired: rule.requestRequired,
            requestContactEmail: rule.requestContactEmail,
            requestNotes: rule.requestNotes,
          },
        });

        // Push description update to Google Calendar if synced.
        if (ev.googleSync) {
          try {
            const connection = await prisma.userCalendarConnection.findFirst({
              where: { userId: ev.userId, provider: "GOOGLE", isActive: true },
              select: { refreshToken: true },
            });
            if (connection) {
              const accessToken = await getAccessToken(connection.refreshToken);
              const googleDescription = [
                ev.department ? `Department: ${ev.department}` : null,
                ev.description,
              ]
                .filter(Boolean)
                .join("\n\n") || undefined;
              await patchGoogleEvent(
                accessToken,
                ev.googleSync.googleCalendarId,
                ev.googleSync.googleEventId,
                { description: googleDescription }
              );
            }
          } catch (err) {
            console.error(`Google patch failed for event ${ev.id}:`, err);
          }
        }

        eventsUpdated++;
      }
    }
  }

  await prisma.courtCoverageAlert.update({
    where: { id: alertId },
    data: { resolved: true, resolvedAt: new Date() },
  });

  return NextResponse.json({ ok: true, eventsUpdated });
}
