import { addTimelineEntry } from "@/lib/case-timeline";
import { getAccessToken, patchGoogleEvent } from "@/lib/google-calendar";
import { buildGoogleEventPayload, REMOTE_APPEARANCE_EVENT_TYPES } from "@/lib/google-calendar-payload";
import { prisma } from "@/lib/prisma";
import type { CourtHearingRule, EventType, Prisma } from "@prisma/client";

type RuleForBackfill = Pick<
  CourtHearingRule,
  | "id"
  | "countyId"
  | "courtId"
  | "countyName"
  | "courtName"
  | "department"
  | "appearanceType"
  | "remoteLink"
  | "phoneNumber"
  | "bridge"
  | "password"
  | "requestRequired"
  | "requestContactEmail"
  | "requestNotes"
>;

export type CourtRuleBackfillResult = {
  eventsUpdated: number;
  googleEventsPatched: number;
  googlePatchFailures: number;
};

function insensitiveEquals(value: string): Prisma.StringFilter {
  return { equals: value, mode: "insensitive" };
}

export function buildCourtRuleEventWhere(
  rule: RuleForBackfill,
  opts: { unmatchedOnly?: boolean } = {}
): Prisma.EventWhereInput {
  const remoteAppearanceEventTypes = Array.from(REMOTE_APPEARANCE_EVENT_TYPES) as EventType[];
  const caseFilters: Prisma.CaseWhereInput[] = [];

  if (rule.countyId) {
    caseFilters.push({
      OR: [
        { countyId: rule.countyId },
        { county: insensitiveEquals(rule.countyName) },
      ],
    });
  } else {
    caseFilters.push({ county: insensitiveEquals(rule.countyName) });
  }

  if (rule.courtName) {
    if (rule.courtId) {
      caseFilters.push({
        OR: [
          { courtId: rule.courtId },
          { court: insensitiveEquals(rule.courtName) },
        ],
      });
    } else {
      caseFilters.push({ court: insensitiveEquals(rule.courtName) });
    }
  }

  const caseMatch: Prisma.EventWhereInput = {
    caseRef: { is: { AND: caseFilters } },
  };

  if (rule.department) {
    caseMatch.department = insensitiveEquals(rule.department);
  }

  const matchers: Prisma.EventWhereInput[] = [
    { courtHearingRuleId: rule.id },
    caseMatch,
  ];

  return {
    ...(opts.unmatchedOnly ? { courtRuleUnmatched: true } : {}),
    eventType: { in: remoteAppearanceEventTypes },
    inPerson: false,
    startTime: { gte: new Date() },
    OR: matchers,
  };
}

export async function backfillEventsForCourtRule(
  rule: RuleForBackfill,
  opts: { unmatchedOnly?: boolean } = {}
): Promise<CourtRuleBackfillResult> {
  const where = buildCourtRuleEventWhere(rule, opts);
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
      caseId: true,
      workspaceId: true,
      googleSync: { select: { googleEventId: true, googleCalendarId: true } },
      userGoogleSyncs: { select: { userId: true, googleEventId: true, googleCalendarId: true } },
      caseRef: { select: { title: true, caseNumber: true, county: true, court: true } },
      assignedAttorney: { select: { firstName: true, lastName: true } },
    },
  });

  let googleEventsPatched = 0;
  let googlePatchFailures = 0;

  for (const ev of events) {
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

    if (ev.caseId && ev.workspaceId) {
      void addTimelineEntry({
        caseId: ev.caseId,
        workspaceId: ev.workspaceId,
        actorUserId: null,
        type: "event.rule_backfilled",
        title: `Remote appearance info updated: ${ev.title}`,
        description: rule.appearanceType ? `Type: ${rule.appearanceType}` : undefined,
        metadata: { eventId: ev.id, ruleId: rule.id },
      });
    }

    const googleTargets = [
      ...(ev.googleSync ? [{ userId: ev.userId, ...ev.googleSync }] : []),
      ...ev.userGoogleSyncs,
    ];
    const seenTargets = new Set<string>();

    for (const target of googleTargets) {
      const key = `${target.googleCalendarId}:${target.googleEventId}`;
      if (seenTargets.has(key)) continue;
      seenTargets.add(key);

      try {
        const connection = await prisma.userCalendarConnection.findFirst({
          where: { userId: target.userId, provider: "GOOGLE", isActive: true },
          select: { refreshToken: true },
        });
        if (!connection) continue;

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
          countyName: ev.caseRef?.county ?? rule.countyName,
          courtName: ev.caseRef?.court ?? rule.courtName,
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
          target.googleCalendarId,
          target.googleEventId,
          {
            summary: googlePayload.summary,
            description: googlePayload.description,
            location: googlePayload.location,
            colorId: googlePayload.colorId,
          }
        );
        googleEventsPatched++;
      } catch (err) {
        googlePatchFailures++;
        console.error(`Google patch failed for event ${ev.id}:`, err);
      }
    }
  }

  return {
    eventsUpdated: events.length,
    googleEventsPatched,
    googlePatchFailures,
  };
}
