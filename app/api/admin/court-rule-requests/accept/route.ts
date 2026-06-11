import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessToken, patchGoogleEvent } from "@/lib/google-calendar";
import { buildGoogleEventPayload, REMOTE_APPEARANCE_EVENT_TYPES } from "@/lib/google-calendar-payload";
import { addTimelineEntry } from "@/lib/case-timeline";
import type { EventType } from "@prisma/client";
import { sendRuleApprovalEmail } from "@/lib/email-notifications";

// POST /api/admin/court-rule-requests/accept
// Body: { requestId: string }
// Creates a CourtHearingRule from the request, marks it accepted + reviewed.
export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isSuperAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { requestId, overrides } = (await request.json()) as {
    requestId: string;
    overrides?: {
      appearanceType?: string | null;
      remoteLink?: string | null;
      phoneNumber?: string | null;
      bridge?: string | null;
      password?: string | null;
      requestRequired?: boolean;
      requestContactEmail?: string | null;
      notes?: string | null;
    };
  };
  if (!requestId) return NextResponse.json({ error: "Missing requestId" }, { status: 400 });

  const req = await prisma.courtRuleRequest.findUnique({ where: { id: requestId } });
  if (!req) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (req.accepted) return NextResponse.json({ error: "Already accepted" }, { status: 409 });

  const state = req.state.toLowerCase();
  const countyName = req.county.toLowerCase();
  const courtName = req.court?.toLowerCase() ?? null;
  const department = req.department?.toLowerCase() ?? null;

  // Resolve countyId / courtId / departmentId
  const countyRecord = await prisma.county.findFirst({
    where: { state: { equals: state, mode: "insensitive" }, name: { equals: countyName, mode: "insensitive" } },
  });

  let courtId: string | null = null;
  let departmentId: string | null = null;

  if (countyRecord && courtName) {
    const courtRecord = await prisma.court.findFirst({
      where: { countyId: countyRecord.id, name: { equals: courtName, mode: "insensitive" } },
    });
    courtId = courtRecord?.id ?? null;

    if (courtId && department) {
      const deptRecord = await prisma.department.upsert({
        where: { courtId_name: { courtId, name: department } },
        create: { courtId, name: department },
        update: {},
      });
      departmentId = deptRecord.id;
    }
  }

  // Upsert the rule (update if it already exists for this state/county/court/dept combo)
  const existing = await prisma.courtHearingRule.findUnique({
    where: {
      state_countyName_courtName_department: {
        state,
        countyName,
        courtName: courtName ?? "",
        department: department ?? "",
      },
    },
  });

  const o = overrides ?? {};
  const ruleData = {
    state,
    countyId: countyRecord?.id ?? null,
    courtId,
    departmentId,
    countyName,
    courtName,
    department,
    appearanceType:      "appearanceType"      in o ? (o.appearanceType      || null) : (req.appearanceType      || null),
    remoteLink:          "remoteLink"          in o ? (o.remoteLink          || null) : (req.remoteLink          || null),
    phoneNumber:         "phoneNumber"         in o ? (o.phoneNumber         || null) : (req.phoneNumber         || null),
    bridge:              "bridge"              in o ? (o.bridge              || null) : (req.bridge              || null),
    password:            "password"            in o ? (o.password            || null) : (req.password            || null),
    requestRequired:     "requestRequired"     in o ? (o.requestRequired     ?? false) : req.requestRequired,
    requestContactEmail: "requestContactEmail" in o ? (o.requestContactEmail || null) : (req.requestContactEmail || null),
    requestNotes:        "notes"               in o ? (o.notes               || null) : (req.notes               || null),
    active: true,
  };

  if (existing) {
    await prisma.courtHearingRule.update({ where: { id: existing.id }, data: ruleData });
  } else {
    await prisma.courtHearingRule.create({ data: ruleData });
  }

  await prisma.courtRuleRequest.update({
    where: { id: requestId },
    data: { reviewed: true, accepted: true, reviewedAt: new Date() },
  });
  await sendRuleApprovalEmail(requestId);

  // Backfill matching future unmatched events with the new rule data.
  const now = new Date();
  const remoteAppearanceEventTypes = Array.from(REMOTE_APPEARANCE_EVENT_TYPES) as EventType[];
  const where =
    !courtName && !department
      ? {
          courtRuleUnmatched: true,
          eventType: { in: remoteAppearanceEventTypes },
          startTime: { gte: now },
          OR: [
            { countyName: { equals: countyName, mode: "insensitive" as const } },
            { caseRef: { county: { equals: countyName, mode: "insensitive" as const } } },
          ],
        }
      : {
          courtRuleUnmatched: true,
          eventType: { in: remoteAppearanceEventTypes },
          startTime: { gte: now },
          department: department ? { equals: department, mode: "insensitive" as const } : undefined,
        };

  const rule = existing
    ? await prisma.courtHearingRule.findUnique({ where: { id: existing.id } })
    : await prisma.courtHearingRule.findUnique({
        where: {
          state_countyName_courtName_department: {
            state,
            countyName,
            courtName: courtName ?? "",
            department: department ?? "",
          },
        },
      });

  if (rule) {
    const events = await prisma.event.findMany({
      where,
      select: {
        id: true,
        userId: true,
        title: true,
        description: true,
        location: true,
        department: true,
        eventType: true,
        subtype: true,
        subtypeReason: true,
        inPerson: true,
        googleSync: { select: { googleEventId: true, googleCalendarId: true } },
        caseRef: { select: { title: true, caseNumber: true, county: true, court: true } },
        assignedAttorney: { select: { firstName: true, lastName: true } },
      },
    });

    for (const ev of events) {
      // Timeline: rule backfilled
      if (ev.caseRef) {
        const caseIdForTimeline = await prisma.event.findUnique({
          where: { id: ev.id },
          select: { caseId: true, workspaceId: true },
        });
        if (caseIdForTimeline?.caseId && caseIdForTimeline.workspaceId) {
          void addTimelineEntry({
            caseId: caseIdForTimeline.caseId,
            workspaceId: caseIdForTimeline.workspaceId,
            actorUserId: null,
            type: "event.rule_backfilled",
            title: `Remote appearance info added to: ${ev.title}`,
            description: rule.appearanceType ? `Type: ${rule.appearanceType}` : undefined,
            metadata: { eventId: ev.id, ruleId: rule.id },
          });
        }
      }

      await prisma.event.update({
        where: { id: ev.id },
        data: {
          courtHearingRuleId:  rule.id,
          courtRuleUnmatched:  false,
          appearanceType:      rule.appearanceType,
          remoteLink:          rule.remoteLink,
          phoneNumber:         rule.phoneNumber,
          bridge:              rule.bridge,
          remotePassword:      rule.password,
          requestRequired:     rule.requestRequired,
          requestContactEmail: rule.requestContactEmail,
          requestNotes:        rule.requestNotes,
        },
      });

      if (ev.googleSync) {
        try {
          const connection = await prisma.userCalendarConnection.findFirst({
            where: { userId: ev.userId, provider: "GOOGLE", isActive: true },
            select: { refreshToken: true },
          });
          if (connection) {
            const accessToken = await getAccessToken(connection.refreshToken);
            const googlePayload = buildGoogleEventPayload({
              title: ev.title,
              eventType: ev.eventType,
              subtype: ev.subtype,
              subtypeReason: ev.subtypeReason,
              description: ev.description,
              location: ev.location,
              department: ev.department,
              inPerson: ev.inPerson,
              caseName: ev.caseRef?.title ?? null,
              caseNumber: ev.caseRef?.caseNumber ?? null,
              countyName: ev.caseRef?.county ?? countyName,
              courtName: ev.caseRef?.court ?? courtName,
              appearanceType: rule.appearanceType,
              remoteLink: rule.remoteLink,
              phoneNumber: rule.phoneNumber,
              bridge: rule.bridge,
              password: rule.password,
              requestRequired: rule.requestRequired,
              attorneyName: ev.assignedAttorney
                ? [ev.assignedAttorney.firstName, ev.assignedAttorney.lastName].filter(Boolean).join(" ") || null
                : null,
            });
            await patchGoogleEvent(
              accessToken,
              ev.googleSync.googleCalendarId,
              ev.googleSync.googleEventId,
              {
                summary: googlePayload.summary,
                description: googlePayload.description,
                location: googlePayload.location,
                colorId: googlePayload.colorId,
              }
            );
          }
        } catch (err) {
          console.error(`Google patch failed for event ${ev.id}:`, err);
        }
      }
    }
  }

  return NextResponse.json({ ok: true, eventsUpdated: rule ? (await prisma.event.count({ where })) : 0 });
}
