/**
 * Discovery Tracker helpers — date calculation, event/task creation,
 * Google Calendar sync, notifications, and timeline entries.
 */

import { prisma } from "@/lib/prisma";
import { getAccessToken, createGoogleEvent, patchGoogleEvent } from "@/lib/google-calendar";
import { addTimelineEntry } from "@/lib/case-timeline";
import type { DiscoveryType, DiscoveryDirection, DiscoveryStatus, ExtensionAppliesTo } from "@prisma/client";

export { DiscoveryType, DiscoveryDirection, DiscoveryStatus, ExtensionAppliesTo };

// Re-export labels from the client-safe constants file so server code can import from one place.
export {
  DISCOVERY_TYPE_LABELS,
  DISCOVERY_DIRECTION_LABELS,
  DISCOVERY_STATUS_LABELS,
  EXTENSION_APPLIES_TO_LABELS,
} from "@/lib/discovery-constants";

import {
  DISCOVERY_TYPE_LABELS,
  DISCOVERY_DIRECTION_LABELS,
  DISCOVERY_STATUS_LABELS,
} from "@/lib/discovery-constants";

// ─── Date calculation ────────────────────────────────────────────────────────

/** Discovery deadlines are +31 calendar days, moving FORWARD to next Monday for weekends. */
export function calcDiscoveryDueDate(servedOrReceivedDate: Date): Date {
  const base = new Date(Date.UTC(
    servedOrReceivedDate.getUTCFullYear(),
    servedOrReceivedDate.getUTCMonth(),
    servedOrReceivedDate.getUTCDate(),
  ));
  const raw = new Date(base.getTime() + 31 * 24 * 60 * 60 * 1000);
  const day = raw.getUTCDay();
  if (day === 6) raw.setUTCDate(raw.getUTCDate() + 2); // Sat → Mon
  if (day === 0) raw.setUTCDate(raw.getUTCDate() + 1); // Sun → Mon
  return raw;
}

// ─── Google Calendar sync ────────────────────────────────────────────────────

function buildGCalDescription(params: {
  caseName: string;
  caseNumber: string | null;
  direction: DiscoveryDirection;
  servedOrReceivedDate: Date;
  originalDueDate: Date;
  currentDueDate: Date;
  extensionCount: number;
  status: DiscoveryStatus;
}): string {
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  return [
    `Case: ${params.caseName}${params.caseNumber ? ` (#${params.caseNumber})` : ""}`,
    `Direction: ${DISCOVERY_DIRECTION_LABELS[params.direction]}`,
    `${params.direction === "RECEIVED" ? "Received" : "Served"}: ${fmt(params.servedOrReceivedDate)}`,
    `Original Due: ${fmt(params.originalDueDate)}`,
    `Current Due: ${fmt(params.currentDueDate)}`,
    params.extensionCount > 0 ? `Extensions: ${params.extensionCount}` : null,
    `Status: ${DISCOVERY_STATUS_LABELS[params.status]}`,
  ].filter(Boolean).join("\n");
}

async function syncDiscoveryEventToGoogle(params: {
  userId: string;
  eventId: string;
  title: string;
  currentDueDate: Date;
  description: string;
}): Promise<void> {
  const connection = await prisma.userCalendarConnection.findFirst({
    where: { userId: params.userId, provider: "GOOGLE", isActive: true },
  });
  if (!connection?.providerCalendarId) return;

  try {
    const accessToken = await getAccessToken(connection.refreshToken);
    const dateStr = params.currentDueDate.toISOString().slice(0, 10);

    const existing = await prisma.googleCalendarSync.findUnique({ where: { eventId: params.eventId } });

    if (existing) {
      await patchGoogleEvent(accessToken, existing.googleCalendarId, existing.googleEventId, {
        summary: params.title,
        description: params.description,
      });
      // Also update start/end date via a direct PATCH
      await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(existing.googleCalendarId)}/events/${encodeURIComponent(existing.googleEventId)}`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            start: { date: dateStr },
            end:   { date: dateStr },
          }),
        }
      );
      await prisma.googleCalendarSync.update({
        where: { eventId: params.eventId },
        data: { syncedAt: new Date(), syncStatus: "SYNCED", lastError: null },
      });
    } else {
      const gEvent = await createGoogleEvent(
        accessToken,
        {
          summary: params.title,
          description: params.description,
          colorId: 5, // Banana = deadline
          start: dateStr,
          end: dateStr,
          timeZone: "UTC",
          allDay: true,
        },
        connection.providerCalendarId,
      );
      await prisma.googleCalendarSync.create({
        data: {
          eventId: params.eventId,
          googleEventId: gEvent.id,
          googleCalendarId: connection.providerCalendarId,
          syncStatus: "SYNCED",
        },
      });
    }
  } catch (err) {
    console.error("[Discovery] Google Calendar sync failed:", err);
    await prisma.googleCalendarSync.upsert({
      where: { eventId: params.eventId },
      update: { syncStatus: "FAILED", lastError: String(err) },
      create: {
        eventId: params.eventId,
        googleEventId: "",
        googleCalendarId: "",
        syncStatus: "FAILED",
        lastError: String(err),
      },
    });
  }
}

// ─── Create discovery item + all side-effects ────────────────────────────────

export interface CreateDiscoveryInput {
  caseId: string;
  workspaceId: string;
  createdBy: string;
  direction: DiscoveryDirection;
  servedOrReceivedDate: Date;
  notes?: string | null;
}

export async function createDiscoveryItem(input: CreateDiscoveryInput) {
  const { caseId, workspaceId, createdBy, direction, servedOrReceivedDate, notes } = input;
  const discoveryType: DiscoveryType = "OTHER";

  const dueDate = calcDiscoveryDueDate(servedOrReceivedDate);
  const title = direction === "RECEIVED"
    ? "Our Discovery Responses Due"
    : "Opposing Discovery Responses Due";

  // Load case to get name, number, and staff
  const caseRow = await prisma.case.findUniqueOrThrow({
    where: { id: caseId },
    include: {
      staff: { include: { user: true } },
    },
  });

  const attorney  = caseRow.staff.find((s) => s.role === "ATTORNEY");
  const paralegal = caseRow.staff.find((s) => s.role === "PARALEGAL");

  const description = buildGCalDescription({
    caseName:            caseRow.title,
    caseNumber:          caseRow.caseNumber,
    direction,
    servedOrReceivedDate,
    originalDueDate:     dueDate,
    currentDueDate:      dueDate,
    extensionCount:      0,
    status:              "AWAITING_RESPONSE",
  });

  // Create Event + DiscoveryItem in one transaction
  const { discoveryItem, event } = await prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        userId:             createdBy,
        workspaceId,
        caseId,
        title,
        description,
        eventType:          "DEADLINE",
        allDay:             true,
        startTime:          dueDate,
        endTime:            dueDate,
        status:             "SCHEDULED",
        assignedAttorneyId: attorney?.userId ?? null,
      },
    });

    const discoveryItem = await tx.discoveryItem.create({
      data: {
        caseId,
        workspaceId,
        createdBy,
        discoveryType,
        direction,
        servedOrReceivedDate,
        originalDueDate:  dueDate,
        currentDueDate:   dueDate,
        notes:            notes ?? null,
        linkedEventId:    event.id,
        status:           "AWAITING_RESPONSE",
      },
    });

    return { discoveryItem, event };
  });

  // Google Calendar sync (best-effort, outside transaction)
  await syncDiscoveryEventToGoogle({
    userId:         createdBy,
    eventId:        event.id,
    title,
    currentDueDate: dueDate,
    description,
  });

  // Notifications
  const notifTargets = [attorney, paralegal].filter(Boolean);
  if (notifTargets.length > 0) {
    const caseLabel = caseRow.caseNumber
      ? `#${caseRow.caseNumber} · ${caseRow.title}`
      : caseRow.title;
    await prisma.notification.createMany({
      data: notifTargets.map((s) => ({
        userId:      s!.userId,
        workspaceId,
        type:        "TASK_ASSIGNED" as never,
        title:       `Discovery Deadline`,
        body:        `${title}\nCase: ${caseLabel}\nDue: ${dueDate.toLocaleDateString("en-US", { timeZone: "UTC" })}`,
        eventId:     event.id,
        caseId,
      })),
      skipDuplicates: true,
    });
  }

  // Timeline entries
  const dirLabel = direction === "RECEIVED" ? "received from opposing party" : "served on opposing party";
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

  await addTimelineEntry({
    caseId,
    workspaceId,
    actorUserId:  createdBy,
    type:         "discovery.created" as never,
    title:        `Discovery ${dirLabel}`,
    description:  `Served/Received: ${fmt(servedOrReceivedDate)}`,
    importance:   "HIGH",
  });

  await addTimelineEntry({
    caseId,
    workspaceId,
    actorUserId:  createdBy,
    type:         "discovery.deadline_generated" as never,
    title:        title,
    description:  `Due: ${fmt(dueDate)}`,
    importance:   "HIGH",
  });

  return discoveryItem;
}

// ─── Grant extension + all side-effects ──────────────────────────────────────

export interface GrantExtensionInput {
  discoveryItemId: string;
  grantedDate: Date;
  newDueDate: Date;
  mutual: boolean;
  appliesTo: ExtensionAppliesTo;
  notes?: string | null;
  createdBy: string;
}

export async function grantDiscoveryExtension(input: GrantExtensionInput) {
  const { discoveryItemId, grantedDate, newDueDate, notes, createdBy } = input;
  // Mutual always means both deadlines move.
  const mutual    = input.mutual;
  const appliesTo: ExtensionAppliesTo = mutual ? "BOTH" : input.appliesTo;

  const item = await prisma.discoveryItem.findUniqueOrThrow({
    where: { id: discoveryItemId },
    include: {
      caseRef: { include: { staff: { include: { user: true } } } },
      extensions: { select: { id: true } },
    },
  });

  const extensionNumber = item.extensions.length + 1;
  const previousDueDate = item.currentDueDate;

  // Determine which items to update
  const itemsToUpdate: typeof item[] = [];

  const shouldUpdateThis =
    appliesTo === "BOTH" ||
    (appliesTo === "OUR_DEADLINE"      && item.direction === "RECEIVED") ||
    (appliesTo === "OPPOSING_DEADLINE" && item.direction === "SERVED");

  if (shouldUpdateThis) itemsToUpdate.push(item);

  // When mutual (= BOTH), also find the companion item (same case, opposite direction)
  if (appliesTo === "BOTH") {
    const companion = await prisma.discoveryItem.findFirst({
      where: {
        caseId:    item.caseId,
        direction: item.direction === "RECEIVED" ? "SERVED" : "RECEIVED",
        id:        { not: discoveryItemId },
      },
      include: {
        caseRef: { include: { staff: { include: { user: true } } } },
        extensions: { select: { id: true } },
      },
    });
    if (companion && !itemsToUpdate.find((i) => i.id === companion.id)) {
      itemsToUpdate.push(companion as never);
    }
  }

  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

  // Process each item that needs updating
  for (const target of itemsToUpdate) {
    const prevDue = target.id === discoveryItemId ? previousDueDate : target.currentDueDate;
    const extNum  = target.id === discoveryItemId ? extensionNumber : target.extensions.length + 1;

    await prisma.$transaction(async (tx) => {
      await tx.discoveryExtension.create({
        data: {
          discoveryItemId: target.id,
          extensionNumber: extNum,
          grantedDate,
          previousDueDate: prevDue,
          newDueDate,
          mutual,
          appliesTo,
          notes: notes ?? null,
          createdBy,
        },
      });

      await tx.discoveryItem.update({
        where: { id: target.id },
        data: { currentDueDate: newDueDate, status: "EXTENSION_GRANTED" },
      });

      // Update linked event dates
      if (target.linkedEventId) {
        await tx.event.update({
          where: { id: target.linkedEventId },
          data: { startTime: newDueDate, endTime: newDueDate },
        });
      }
    });

    // Reload to build updated description
    const updatedItem = await prisma.discoveryItem.findUniqueOrThrow({
      where: { id: target.id },
      include: { extensions: { select: { id: true } } },
    });

    const caseRow = target.caseRef;
    const description = buildGCalDescription({
      caseName:             caseRow.title,
      caseNumber:           caseRow.caseNumber,
      direction:            target.direction,
      servedOrReceivedDate: target.servedOrReceivedDate,
      originalDueDate:      target.originalDueDate,
      currentDueDate:       newDueDate,
      extensionCount:       updatedItem.extensions.length,
      status:               "EXTENSION_GRANTED",
    });

    const eventTitle = target.direction === "RECEIVED"
      ? "Our Discovery Responses Due"
      : "Opposing Discovery Responses Due";

    // Google Calendar: update date + description
    if (target.linkedEventId) {
      await syncDiscoveryEventToGoogle({
        userId:         createdBy,
        eventId:        target.linkedEventId,
        title:          eventTitle,
        currentDueDate: newDueDate,
        description,
      });
    }

    // Timeline
    await addTimelineEntry({
      caseId:      target.caseId,
      workspaceId: target.workspaceId,
      actorUserId: createdBy,
      type:        "discovery.extension_granted" as never,
      title:       `Extension ${extNum} Granted — ${eventTitle}`,
      description: `Previous due: ${fmt(prevDue)} → New due: ${fmt(newDueDate)}${mutual ? " (Mutual)" : ""}`,
      importance:  "HIGH",
    });
  }

  return extensionNumber;
}

// ─── Mark responses received ──────────────────────────────────────────────────

export async function markDiscoveryResponsesReceived(discoveryItemId: string, actorUserId: string) {
  const item = await prisma.discoveryItem.findUniqueOrThrow({
    where: { id: discoveryItemId },
    select: { caseId: true, workspaceId: true, direction: true, linkedEventId: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.discoveryItem.update({
      where: { id: discoveryItemId },
      data: { status: "COMPLETED" },
    });
    if (item.linkedEventId) {
      await tx.event.update({
        where: { id: item.linkedEventId },
        data: { status: "COMPLETED" },
      });
    }
  });

  const dirLabel = item.direction === "RECEIVED" ? "Responses Submitted" : "Responses Received";
  await addTimelineEntry({
    caseId:      item.caseId,
    workspaceId: item.workspaceId,
    actorUserId,
    type:        "discovery.responses_received" as never,
    title:       dirLabel,
    importance:  "HIGH",
  });
}
