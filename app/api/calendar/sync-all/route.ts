import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessToken, createGoogleEvent, createLitCalCalendar, GoogleReauthRequiredError } from "@/lib/google-calendar";
import { buildGoogleEventPayload, getGoogleColorId } from "@/lib/google-calendar-payload";
import { getCurrentWorkspace } from "@/lib/workspaces";
import { googleAllDayExclusiveEndDate } from "@/lib/all-day-dates";

async function syncedEventIdsForUser(userId: string): Promise<Set<string>> {
  const rows = await prisma.$queryRaw<Array<{ eventId: string }>>`
    SELECT "eventId" FROM "UserGoogleCalendarSync" WHERE "userId" = ${userId}
  `;
  return new Set(rows.map((row) => row.eventId));
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

export async function POST() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Any workspace member can sync — it only pushes to the caller's own
  // connected Google Calendar and only reads events they can already see.
  const { workspace, membership } = await getCurrentWorkspace(user.id);
  if (!workspace || !membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });

  const connection = await prisma.userCalendarConnection.findFirst({
    where: { userId: user.id, provider: "GOOGLE", isActive: true },
  });
  if (!connection) return NextResponse.json({ error: "Google Calendar not connected" }, { status: 400 });

  let accessToken: string;
  try {
    accessToken = await getAccessToken(connection.refreshToken);
  } catch (err) {
    if (err instanceof GoogleReauthRequiredError) {
      await prisma.userCalendarConnection.update({
        where: { id: connection.id },
        data: { isActive: false },
      });
      return NextResponse.json(
        { error: "google_reconnect_required", message: "Your Google Calendar connection expired — reconnect it and try again." },
        { status: 409 },
      );
    }
    throw err;
  }

  // Resolve/recreate LitCal calendar
  let litCalId = connection.providerCalendarId;
  if (litCalId) {
    const check = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(litCalId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!check.ok) litCalId = null;
  }
  if (!litCalId) {
    litCalId = await createLitCalCalendar(accessToken);
    await prisma.userCalendarConnection.update({
      where: { id: connection.id },
      data: { providerCalendarId: litCalId },
    });
  }

  // Find all events not yet synced to this user's Google Calendar.
  const syncedIds = await syncedEventIdsForUser(user.id);
  const events = await prisma.event.findMany({
    where: {
      OR: [
        { workspaceId: workspace.id },
        { userId: user.id, workspaceId: null },
      ],
      ...(syncedIds.size > 0 ? { id: { notIn: [...syncedIds] } } : {}),
    },
    include: {
      caseRef: { select: { title: true, caseNumber: true, county: true, court: true } },
      assignedAttorney: { select: { firstName: true, lastName: true } },
    },
  });

  // Clean up Google events for LitCal events that are completed, cancelled, or deleted
  let deleted = 0;
  let deleteFailed = 0;
  const allSyncRecords = await prisma.$queryRaw<
    Array<{ id: string; eventId: string; googleEventId: string; googleCalendarId: string }>
  >`
    SELECT s."id", s."eventId", s."googleEventId", s."googleCalendarId"
    FROM "UserGoogleCalendarSync" s
    WHERE s."userId" = ${user.id}
      AND s."googleCalendarId" != 'ics-import'
  `;

  for (const sync of allSyncRecords) {
    const event = await prisma.event.findUnique({
      where: { id: sync.eventId },
      select: { status: true },
    });
    const shouldDelete = !event || event.status === "COMPLETED" || event.status === "CANCELLED";
    if (!shouldDelete) continue;

    try {
      const delRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(sync.googleCalendarId)}/events/${encodeURIComponent(sync.googleEventId)}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (delRes.ok || delRes.status === 404 || delRes.status === 410) {
        await prisma.$executeRaw`
          DELETE FROM "UserGoogleCalendarSync" WHERE "id" = ${sync.id}
        `;
        // Also clean up GoogleCalendarSync if it exists
        await prisma.googleCalendarSync.deleteMany({
          where: { eventId: sync.eventId, googleEventId: sync.googleEventId },
        });
        deleted++;
      } else {
        deleteFailed++;
      }
    } catch {
      deleteFailed++;
    }
  }

  let synced = 0;
  let failed = 0;

  for (const event of events) {
    try {
      const isInPerson = event.inPerson ?? false;
      const payload = buildGoogleEventPayload({
        title: event.title,
        eventType: event.eventType,
        subtype: event.subtype ?? undefined,
        subtypeReason: event.subtypeReason ?? undefined,
        description: event.description ?? undefined,
        location: event.location ?? undefined,
        department: event.department ?? undefined,
        inPerson: isInPerson,
        caseName: event.caseRef?.title ?? null,
        caseNumber: event.caseRef?.caseNumber ?? null,
        countyName: event.caseRef?.county ?? null,
        courtName: event.caseRef?.court ?? null,
        appearanceType: event.appearanceType ?? undefined,
        remoteLink: event.remoteLink ?? undefined,
        phoneNumber: event.phoneNumber ?? undefined,
        bridge: event.bridge ?? undefined,
        password: event.remotePassword ?? undefined,
        requestRequired: event.requestRequired ?? null,
        requestTaskCreated: false,
        attorneyName: event.assignedAttorney
          ? [event.assignedAttorney.firstName, event.assignedAttorney.lastName].filter(Boolean).join(" ")
          : undefined,
      });

      const timeZone = "America/Los_Angeles";
      const startField = event.allDay
        ? event.startTime.toISOString().slice(0, 10)
        : event.startTime.toISOString();
      const endField = event.allDay
        ? googleAllDayExclusiveEndDate(event.endTime)
        : event.endTime.toISOString();

      const gEvent = await createGoogleEvent(
        accessToken,
        {
          summary: payload.summary,
          description: payload.description,
          location: payload.location,
          colorId: payload.colorId ?? getGoogleColorId(event.eventType),
          start: startField,
          end: endField,
          allDay: event.allDay,
          timeZone,
        },
        litCalId
      );

      await recordUserGoogleSync({
        eventId: event.id,
        userId: user.id,
        googleEventId: gEvent.id,
        googleCalendarId: litCalId,
      });
      synced++;
    } catch (err) {
      console.error(`Backfill failed for event ${event.id}:`, err);
      failed++;
    }
  }

  // Sync tasks with due dates to Google Calendar — tracked per user, so a
  // task already pushed to one member's calendar still backfills for others.
  const syncedTaskIdsForUser = await prisma.userTaskGoogleSync.findMany({
    where: { userId: user.id },
    select: { taskId: true },
  });
  const syncedTaskIdSet = new Set(syncedTaskIdsForUser.map((s) => s.taskId));
  const unsyncedTasks = await prisma.task.findMany({
    where: {
      workspaceId: workspace.id,
      dueDate: { not: null },
      status: { not: "DONE" },
      ...(syncedTaskIdSet.size > 0 ? { id: { notIn: [...syncedTaskIdSet] } } : {}),
    },
    include: {
      caseRef: { select: { title: true } },
    },
  });

  let tasksSynced = 0;
  let tasksFailed = 0;

  for (const task of unsyncedTasks) {
    try {
      const dateStr = task.dueDate!.toISOString().slice(0, 10);
      const endDateStr = new Date(task.dueDate!.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const summary = task.caseRef?.title
        ? `${task.title} — ${task.caseRef.title}`
        : task.title;

      const gEvent = await createGoogleEvent(
        accessToken,
        {
          summary,
          colorId: getGoogleColorId("DEADLINE"),
          start: dateStr,
          end: endDateStr,
          allDay: true,
          timeZone: "America/Los_Angeles",
        },
        litCalId
      );

      await prisma.userTaskGoogleSync.upsert({
        where: { taskId_userId: { taskId: task.id, userId: user.id } },
        create: {
          taskId: task.id,
          userId: user.id,
          googleEventId: gEvent.id,
          googleCalendarId: litCalId,
          syncStatus: "SYNCED",
        },
        update: {
          googleEventId: gEvent.id,
          googleCalendarId: litCalId,
          syncStatus: "SYNCED",
          lastError: null,
        },
      });
      tasksSynced++;
    } catch (err) {
      console.error(`Google push failed for task ${task.id}:`, err);
      tasksFailed++;
    }
  }

  return NextResponse.json({ synced, failed, total: events.length, deleted, deleteFailed, tasksSynced, tasksFailed });
}
