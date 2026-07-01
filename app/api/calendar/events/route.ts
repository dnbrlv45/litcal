import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessToken, createGoogleEvent, createLitCalCalendar } from "@/lib/google-calendar";
import type { GoogleCalEvent } from "@/lib/google-calendar";
import { buildGoogleEventPayload, eventSupportsRemoteAppearance, getGoogleColorId } from "@/lib/google-calendar-payload";
import { addTimelineEntry } from "@/lib/case-timeline";
import { computeReminders, googleReminderOverrides } from "@/lib/reminders";
import { canEdit, getCurrentWorkspace } from "@/lib/workspaces";
import { detectConflicts, getConflictedEventIds } from "@/lib/conflicts";
import { applyDeadlineRules } from "@/lib/deadline-rules";
import { findCourtHearingRule, computeRemoteAppearanceDueDate } from "@/lib/court-hearing-rules";
import { upsertCoverageAlert } from "@/lib/court-coverage-alerts";
import { sendTaskAssignedEmails } from "@/lib/email-notifications";

function googleAllDayEnd(date: Date): string {
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  end.setUTCDate(end.getUTCDate() + 1);
  return end.toISOString().slice(0, 10);
}

async function recordUserGoogleSync(input: {
  eventId: string;
  userId: string;
  googleEventId: string;
  googleCalendarId: string;
}) {
  await prisma.$executeRaw`
    INSERT INTO "UserGoogleCalendarSync" (
      "id", "eventId", "userId", "googleEventId", "googleCalendarId", "updatedAt", "syncStatus", "lastError"
    )
    VALUES (
      ${`ugcs_${input.eventId}_${input.userId}`},
      ${input.eventId},
      ${input.userId},
      ${input.googleEventId},
      ${input.googleCalendarId},
      NOW(),
      'SYNCED'::"SyncStatus",
      NULL
    )
    ON CONFLICT ("eventId", "userId") DO UPDATE SET
      "googleEventId" = EXCLUDED."googleEventId",
      "googleCalendarId" = EXCLUDED."googleCalendarId",
      "syncStatus" = 'SYNCED'::"SyncStatus",
      "lastError" = NULL,
      "syncedAt" = NOW(),
      "updatedAt" = NOW()
  `;
}

// GET /api/calendar/events?start=ISO&end=ISO
export async function GET(request: NextRequest) {
  const currentUser = await requireUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = currentUser.id;
  const { workspace } = await getCurrentWorkspace(userId);
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const q = searchParams.get("q")?.trim();

  // Search mode: no date range, full-text match across all events
  if (q) {
    const events = await prisma.event.findMany({
      where: {
        status: { notIn: ["CANCELLED", "COMPLETED"] },
        OR: [{ workspaceId: workspace.id }, { userId, workspaceId: null }],
        AND: [{
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { caseRef: { title: { contains: q, mode: "insensitive" } } },
          ],
        }],
      },
      include: {
        caseRef: { select: { id: true, title: true, status: true, county: true, court: true, caseNumber: true } },
        assignedAttorney: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { startTime: "asc" },
      take: 20,
    });
    return NextResponse.json({
      events: events.map((e) => ({
        id: e.id,
        title: e.title,
        start: e.startTime.toISOString(),
        end: e.endTime.toISOString(),
        allDay: e.allDay,
        eventType: e.eventType,
        caseId: e.caseId,
        caseTitle: e.caseRef?.title ?? null,
        caseStatus: e.caseRef?.status ?? null,
        assignedAttorneyId: e.assignedAttorney?.id ?? null,
        assignedAttorneyName: e.assignedAttorney
          ? [e.assignedAttorney.firstName, e.assignedAttorney.lastName].filter(Boolean).join(" ") || null
          : null,
        hasConflict: false,
        caseCounty: e.caseRef?.county ?? null,
        caseCourt: e.caseRef?.court ?? null,
        inPerson: e.inPerson,
        appearanceType: null, remoteLink: null, phoneNumber: null, bridge: null,
        remotePassword: null, requestRequired: null, requestContactEmail: null, requestNotes: null,
        department: e.department, location: e.location, description: e.description,
        subtype: e.subtype, subtypeReason: e.subtypeReason, caseNumber: e.caseRef?.caseNumber ?? null,
      })),
    });
  }

  if (!start || !end) return NextResponse.json({ error: "Missing start/end" }, { status: 400 });

  const rangeStart = new Date(start);
  const rangeEnd   = new Date(end);

  const [events, connection, conflictedIds] = await Promise.all([
    prisma.event.findMany({
      where: {
        // Overlap query: event starts before range ends AND event ends after range starts.
        // This ensures multi-day events that begin before the view window are still returned.
        AND: [
          { startTime: { lte: rangeEnd } },
          { endTime:   { gte: rangeStart } },
        ],
        status: { notIn: ["CANCELLED", "COMPLETED"] },
        OR: [
          { workspaceId: workspace.id },
          { userId, workspaceId: null },
        ],
      },
      include: {
        googleSync: true,
        caseRef: { select: { id: true, title: true, status: true, county: true, court: true, caseNumber: true } },
        assignedAttorney: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { startTime: "asc" },
    }),
    prisma.userCalendarConnection.findFirst({
      where: { userId, provider: "GOOGLE", isActive: true },
    }),
    getConflictedEventIds(workspace.id),
  ]);

  return NextResponse.json({
    events: events.map((e: (typeof events)[number]) => {
      const supportsRemoteAppearance = eventSupportsRemoteAppearance(e.eventType);
      return {
      id: e.id,
      title: e.title,
      description: e.description,
      start: e.startTime.toISOString(),
      end: e.endTime.toISOString(),
      allDay: e.allDay,
      eventType: e.eventType,
      subtype: e.subtype,
      subtypeReason: e.subtypeReason,
      location: e.location,
      department: e.department,
      caseId: e.caseId,
      caseTitle: e.caseRef?.title ?? null,
      caseNumber: e.caseRef?.caseNumber ?? null,
      caseStatus: e.caseRef?.status ?? null,
      assignedAttorneyId: e.assignedAttorney?.id ?? null,
      assignedAttorneyName: e.assignedAttorney
        ? [e.assignedAttorney.firstName, e.assignedAttorney.lastName].filter(Boolean).join(" ") || null
        : null,
      hasConflict: conflictedIds.has(e.id),
      caseCounty: e.caseRef?.county ?? null,
      caseCourt:  e.caseRef?.court  ?? null,
      inPerson: e.inPerson,
      appearanceType: supportsRemoteAppearance ? e.appearanceType : null,
      remoteLink: supportsRemoteAppearance ? e.remoteLink : null,
      phoneNumber: supportsRemoteAppearance ? e.phoneNumber : null,
      bridge: supportsRemoteAppearance ? e.bridge : null,
      remotePassword: supportsRemoteAppearance ? e.remotePassword : null,
      requestRequired: supportsRemoteAppearance ? e.requestRequired : null,
      requestContactEmail: supportsRemoteAppearance ? e.requestContactEmail : null,
      requestNotes: supportsRemoteAppearance ? e.requestNotes : null,
    };
    }),
    connected: !!connection,
  });
}

// POST /api/calendar/events  body: { title, description?, start, end, timeZone }
export async function POST(request: NextRequest) {
  const currentUser = await requireUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = currentUser.id;
  const { workspace, membership } = await getCurrentWorkspace(userId);
  if (!workspace || !membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  if (!canEdit(membership.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const {
    title, description, start, end, timeZone, eventType,
    location, department, departmentId, caseId, allDay,
    inPerson, countyName, courtName, subtype, subtypeReason,
  } = body as {
    title: string;
    description?: string;
    start: string;
    end: string;
    timeZone: string;
    eventType?: string;
    location?: string;
    department?: string;
    departmentId?: string;
    caseId?: string;
    allDay?: boolean;
    inPerson?: boolean;
    countyName?: string;
    courtName?: string;
    subtype?: string;
    subtypeReason?: string;
  };

  if (!title?.trim() || !start || !end)
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

  let inheritedAttorneyId: string | null = null;
  let caseCountyName: string | null = null;
  let caseCourtName: string | null = null;
  let caseStaffForTask: { userId: string; role: string }[] = [];
  let caseTitleForGoogle: string | null = null;
  let caseNumberForGoogle: string | null = null;
  let attorneyNameForGoogle: string | null = null;
  let paralegalNameForGoogle: string | null = null;

  let caseState: string | null = null;
  if (caseId) {
    const linkedCase = await prisma.case.findUnique({
      where: { id: caseId },
      select: {
        status: true,
        title: true,
        caseNumber: true,
        county: true,
        court: true,
        countyId: true,
        staff: {
          where: { role: { in: ["ATTORNEY", "PARALEGAL", "ASSISTANT"] } },
          select: { userId: true, role: true, user: { select: { firstName: true, lastName: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!linkedCase) return NextResponse.json({ error: "Case not found" }, { status: 404 });
    if (linkedCase.status === "ARCHIVED" || linkedCase.status === "CLOSED")
      return NextResponse.json({ error: "Cannot add events to an archived or closed case" }, { status: 422 });
    inheritedAttorneyId = linkedCase.staff.find((s) => s.role === "ATTORNEY")?.userId ?? null;
    caseCountyName = linkedCase.county ?? null;
    caseCourtName = linkedCase.court ?? null;
    caseStaffForTask = linkedCase.staff;
    caseTitleForGoogle = linkedCase.title ?? null;
    caseNumberForGoogle = linkedCase.caseNumber ?? null;
    const atty = linkedCase.staff.find((s) => s.role === "ATTORNEY");
    const para = linkedCase.staff.find((s) => s.role === "PARALEGAL");
    attorneyNameForGoogle  = atty ? [atty.user.firstName, atty.user.lastName].filter(Boolean).join(" ") || null : null;
    paralegalNameForGoogle = para ? [para.user.firstName, para.user.lastName].filter(Boolean).join(" ") || null : null;
    // Resolve state from the case's county record
    if (linkedCase.countyId) {
      const countyRecord = await prisma.county.findUnique({
        where: { id: linkedCase.countyId },
        select: { state: true },
      });
      caseState = countyRecord?.state ?? null;
    }
  }

  const validTypes = ["DEADLINE","HEARING","DEPOSITION","TRIAL","CONFERENCE","MEETING","MEDIATION","COURT_CALL","CASE_MANAGEMENT_CONFERENCE","REMINDER","OTHER"];
  const safeEventType = validTypes.includes(eventType ?? "") ? eventType as never : "OTHER";
  const supportsRemoteAppearance = eventSupportsRemoteAppearance(safeEventType as string);

  // Resolve court hearing rule (remote appearance only)
  const isInPerson = inPerson === true;
  let hearingRule = null;
  let courtRuleUnmatched = false;
  const resolvedCounty = countyName || caseCountyName;
  const resolvedCourt  = courtName  || caseCourtName;
  if (!isInPerson && supportsRemoteAppearance) {
    hearingRule = await findCourtHearingRule({
      state: caseState,  // null = auto-derived from county name lookup
      countyName: resolvedCounty,
      courtName: resolvedCourt,
      department: department,
    });
    if (!hearingRule && resolvedCounty && workspace) {
      const { resolveStateForCounty } = await import("@/lib/court-hearing-rules");
      const resolvedState = caseState ?? await resolveStateForCounty(resolvedCounty);
      courtRuleUnmatched = true;
      await upsertCoverageAlert({
        state: resolvedState,
        countyName: resolvedCounty,
        courtName: resolvedCourt,
        department: department,
        workspaceId: workspace.id,
      });
    }
  }

  // Check conflicts before creating (non-blocking)
  const startDate = new Date(start);
  let endDate = new Date(end);
  let effectiveAllDay = allDay ?? false;

  // Trials default to a 7-day all-day block unless an explicit multi-day span
  // was provided (e.g. from the event modal). This keeps Ask LitCal / AI Inbox
  // trials consistent with manually-created ones.
  if ((safeEventType as string) === "TRIAL") {
    const spanMs = endDate.getTime() - startDate.getTime();
    const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
    if (isNaN(spanMs) || spanMs < twoDaysMs) {
      effectiveAllDay = true;
      endDate = new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    }
  }

  const preConflicts = inheritedAttorneyId
    ? await detectConflicts(inheritedAttorneyId, startDate, endDate)
    : [];

  // Create the event in Supabase (source of truth)
  const event = await prisma.event.create({
    data: {
      userId,
      workspaceId: workspace.id,
      orgId: null,
      title: title.trim(),
      description: description || null,
      startTime: startDate,
      endTime: endDate,
      timeZone: timeZone ?? "UTC",
      allDay: effectiveAllDay,
      eventType: safeEventType,
      subtype: subtype?.trim() || null,
      subtypeReason: subtypeReason?.trim() || null,
      location: location || null,
      department: department?.trim() || null,
      departmentId: departmentId || null,
      caseId: caseId || null,
      assignedAttorneyId: inheritedAttorneyId,
      inPerson: isInPerson,
      courtRuleUnmatched,
      courtHearingRuleId: hearingRule?.id ?? null,
      appearanceType: hearingRule?.appearanceType ?? null,
      remoteLink: hearingRule?.remoteLink ?? null,
      phoneNumber: hearingRule?.phoneNumber ?? null,
      bridge: hearingRule?.bridge ?? null,
      remotePassword: hearingRule?.password ?? null,
      requestRequired: hearingRule?.requestRequired ?? null,
      requestContactEmail: hearingRule?.requestContactEmail ?? null,
      requestNotes: hearingRule?.requestNotes ?? null,
    },
  });

  // Store reminder schedule
  const reminderRows = computeReminders(startDate, safeEventType as string);
  if (reminderRows.length > 0) {
    await prisma.eventReminder.createMany({
      data: reminderRows.map((r) => ({
        eventId: event.id,
        minutesBefore: r.minutesBefore,
        sendAt: r.sendAt,
      })),
    });
  }

  // Remote appearance task — only when requestRequired = true and not in-person
  if (!isInPerson && supportsRemoteAppearance && hearingRule?.requestRequired) {
    const existingRemoteTask = await prisma.generatedDeadline.findUnique({
      where: { triggerEventId_ruleKey: { triggerEventId: event.id, ruleKey: "REMOTE_APPEARANCE_REQUEST" } },
    });

    if (!existingRemoteTask) {
      const dueDate = computeRemoteAppearanceDueDate(startDate, hearingRule?.requestDaysBefore);

      // Resolve workspace member IDs for attorney + paralegal
      const staffUserIds = caseStaffForTask.map((s) => s.userId);
      const memberRows = staffUserIds.length > 0
        ? await prisma.workspaceMember.findMany({
            where: { workspaceId: workspace.id, userId: { in: staffUserIds } },
            select: { id: true, userId: true },
          })
        : [];
      const memberIds = memberRows.map((m) => m.id);

      const taskDesc = [
        hearingRule?.requestContactEmail ? `Email: ${hearingRule.requestContactEmail}` : null,
        hearingRule?.requestNotes ?? null,
      ].filter(Boolean).join("\n") || null;

      const remoteTask = await prisma.task.create({
        data: {
          workspaceId: workspace.id,
          caseId: caseId || null,
          eventId: event.id,
          title: `Request Remote Appearance — ${event.title}`,
          description: taskDesc,
          isAutoGenerated: true,
          dueDate,
          assignees: memberIds.length > 0
            ? { create: memberIds.map((memberId) => ({ memberId })) }
            : undefined,
        },
      });

      if (memberRows.length > 0) {
        await prisma.notification.createMany({
          data: memberRows.map((m) => ({
            userId: m.userId,
            workspaceId: workspace.id,
            type: "TASK_ASSIGNED" as never,
            title: `Task Assigned: Request Remote Appearance`,
            body: `${event.title}\nAuto-generated task`,
            taskId: remoteTask.id,
            eventId: event.id,
            caseId: caseId || null,
          })),
          skipDuplicates: true,
        });
        await sendTaskAssignedEmails(remoteTask.id);
      }

      await prisma.generatedDeadline.create({
        data: {
          workspaceId: workspace.id,
          triggerEventId: event.id,
          ruleKey: "REMOTE_APPEARANCE_REQUEST",
          generatedTaskId: remoteTask.id,
        },
      });
    }
  }

  // Apply deadline automation rules (idempotent, handles CMC + Trial + future rules)
  const deadlineResult = await applyDeadlineRules({
    id: event.id,
    eventType: safeEventType as string,
    subtype: event.subtype ?? null,
    startTime: startDate,
    caseId: caseId || null,
    userId,
    workspaceId: workspace.id,
    assignedAttorneyId: inheritedAttorneyId,
    timeZone: timeZone ?? "UTC",
  });

  // Timeline entries (fire-and-forget, caseId required)
  if (caseId) {
    const highImportanceTypes = new Set(["TRIAL", "HEARING", "CASE_MANAGEMENT_CONFERENCE", "DEPOSITION", "MEDIATION"]);
    void addTimelineEntry({
      caseId,
      workspaceId: workspace.id,
      actorUserId: userId,
      type: "event.created",
      title: `Event added: ${event.title}`,
      description: safeEventType !== "OTHER" ? safeEventType as string : undefined,
      metadata: { eventId: event.id, eventType: safeEventType },
      importance: highImportanceTypes.has(safeEventType as string) ? "HIGH" : "NORMAL",
    });

    if (hearingRule) {
      void addTimelineEntry({
        caseId,
        workspaceId: workspace.id,
        actorUserId: null,
        type: "event.rule_applied",
        title: "Remote appearance rule applied",
        description: hearingRule.appearanceType ? `Type: ${hearingRule.appearanceType}` : undefined,
        metadata: { eventId: event.id, ruleId: hearingRule.id },
      });
    }

    if (deadlineResult.createdEventIds.length > 0) {
      const isTrialType = (safeEventType as string) === "TRIAL";
      void addTimelineEntry({
        caseId,
        workspaceId: workspace.id,
        actorUserId: null,
        type: isTrialType ? "event.trial_deadlines_generated" : "event.cmc_task_generated",
        title: isTrialType
          ? `${deadlineResult.createdEventIds.length} trial deadline${deadlineResult.createdEventIds.length > 1 ? "s" : ""} generated`
          : "CMS task generated",
        metadata: { eventId: event.id, generatedEventIds: deadlineResult.createdEventIds },
      });
    }

    if (deadlineResult.createdTaskIds.length > 0 && (safeEventType as string) === "CASE_MANAGEMENT_CONFERENCE") {
      void addTimelineEntry({
        caseId,
        workspaceId: workspace.id,
        actorUserId: null,
        type: "event.cmc_task_generated",
        title: "Case Management Statement task generated",
        metadata: { eventId: event.id, taskIds: deadlineResult.createdTaskIds },
      });
    }

    if (!isInPerson && hearingRule?.requestRequired) {
      void addTimelineEntry({
        caseId,
        workspaceId: workspace.id,
        actorUserId: null,
        type: "event.remote_task_generated",
        title: "Remote appearance request task generated",
        metadata: { eventId: event.id },
      });
    }
  }

  // Push to Google Calendar if connected
  let googlePush: { ok: boolean; error?: string | null } = { ok: false, error: "Google not connected" };

  const connection = await prisma.userCalendarConnection.findFirst({
    where: { userId, provider: "GOOGLE", isActive: true },
  });

  if (connection) {
    try {
      const accessToken = await getAccessToken(connection.refreshToken);

      // Resolve the dedicated LitCal calendar, creating it if missing or deleted
      let litCalId = connection.providerCalendarId;
      if (litCalId) {
        // Verify the calendar still exists; if not, clear and recreate
        const checkRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(litCalId)}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!checkRes.ok) litCalId = null;
      }
      if (!litCalId) {
        litCalId = await createLitCalCalendar(accessToken);
        await prisma.userCalendarConnection.update({
          where: { id: connection.id },
          data: { providerCalendarId: litCalId },
        });
      }

      const reminderOverrides = googleReminderOverrides(safeEventType as string);
      const googlePayload = buildGoogleEventPayload({
        title: event.title,
        eventType: safeEventType as string,
        subtype: event.subtype,
        subtypeReason: event.subtypeReason,
        description: event.description,
        location: event.location,
        department: event.department,
        inPerson: isInPerson,
        caseName: caseTitleForGoogle,
        caseNumber: caseNumberForGoogle,
        countyName: caseCountyName ?? countyName,
        courtName: caseCourtName ?? courtName,
        appearanceType: hearingRule?.appearanceType,
        remoteLink: hearingRule?.remoteLink,
        phoneNumber: hearingRule?.phoneNumber,
        bridge: hearingRule?.bridge,
        password: hearingRule?.password,
        requestRequired: hearingRule?.requestRequired ?? null,
        requestTaskCreated: !!(hearingRule?.requestRequired),
        attorneyName: attorneyNameForGoogle,
        paralegalName: paralegalNameForGoogle,
      });
      const gEvent: GoogleCalEvent = await createGoogleEvent(
        accessToken,
        {
          summary: googlePayload.summary,
          description: googlePayload.description,
          location: googlePayload.location,
          colorId: googlePayload.colorId,
          start: event.allDay ? event.startTime.toISOString().slice(0, 10) : start,
          end: event.allDay ? googleAllDayEnd(event.startTime) : end,
          allDay: event.allDay,
          timeZone: timeZone ?? "UTC",
          reminderOverrides,
        },
        litCalId
      );
      await prisma.googleCalendarSync.create({
        data: {
          eventId: event.id,
          googleEventId: gEvent.id,
          googleCalendarId: litCalId,
          syncStatus: "SYNCED",
        },
      });
      await recordUserGoogleSync({
        eventId: event.id,
        userId,
        googleEventId: gEvent.id,
        googleCalendarId: litCalId,
      });
      if (caseId) {
        void addTimelineEntry({
          caseId,
          workspaceId: workspace.id,
          actorUserId: null,
          type: "event.google_synced",
          title: "Synced to Google Calendar",
          metadata: { eventId: event.id, googleEventId: gEvent.id },
        });
      }

      // Push any generated deadline events to Google Calendar too
      if (deadlineResult.createdEventIds.length > 0) {
        const generatedEvents = await prisma.event.findMany({
          where: { id: { in: deadlineResult.createdEventIds } },
          include: { caseRef: { select: { title: true, county: true, court: true } } },
        });
        for (const ge of generatedEvents) {
          try {
            const dayStr = ge.startTime.toISOString().slice(0, 10);
            const endDayStr = googleAllDayEnd(ge.startTime);
            const ggEvent: GoogleCalEvent = await createGoogleEvent(
              accessToken,
              {
                summary: ge.title,
                description: ge.description ?? undefined,
                colorId: getGoogleColorId(ge.eventType),
                start: dayStr,
                end: endDayStr,
                allDay: true,
                timeZone: timeZone ?? "UTC",
                reminderOverrides: [{ method: "popup", minutes: 1440 }],
              },
              litCalId
            );
            await prisma.googleCalendarSync.create({
              data: {
                eventId: ge.id,
                googleEventId: ggEvent.id,
                googleCalendarId: litCalId,
                syncStatus: "SYNCED",
              },
            });
            await recordUserGoogleSync({
              eventId: ge.id,
              userId,
              googleEventId: ggEvent.id,
              googleCalendarId: litCalId,
            });
          } catch (err) {
            console.error(`Google push failed for generated event ${ge.id}:`, err);
          }
        }
      }

      googlePush = { ok: true };
    } catch (err) {
      console.error("Google Calendar push failed (event saved to DB):", err);
      googlePush = { ok: false, error: String(err) };
    }
  }

  return NextResponse.json({
    event: {
      id: event.id,
      title: event.title,
      description: event.description,
      start: event.startTime.toISOString(),
      end: event.endTime.toISOString(),
      allDay: event.allDay,
      eventType: event.eventType,
      location: event.location,
      department: event.department,
      caseId: event.caseId,
      inPerson: event.inPerson,
      appearanceType: event.appearanceType,
      remoteLink: event.remoteLink,
      phoneNumber: event.phoneNumber,
      bridge: event.bridge,
      remotePassword: event.remotePassword,
      requestRequired: event.requestRequired,
      requestContactEmail: event.requestContactEmail,
      requestNotes: event.requestNotes,
    },
    googlePush,
    conflicts: preConflicts.map((c) => ({
      eventId: c.eventId,
      title: c.title,
      startTime: c.startTime.toISOString(),
      endTime: c.endTime.toISOString(),
      attorneyName: c.attorneyName,
    })),
  });
}
