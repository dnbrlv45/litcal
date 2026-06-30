import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspaces";
import { Prisma } from "@prisma/client";
import { google } from "googleapis";
import { createDiscoveryItem, grantDiscoveryExtension } from "@/lib/discovery";
import { getInboxRefreshToken, makeOAuth2Client } from "@/lib/ai/processGmailMessages";
import { extractEmailSuggestion } from "@/lib/ai/extractEmailSuggestion";
import { toTitleCaseName } from "@/lib/utils";
import { getAccessToken, patchGoogleEvent, deleteGoogleEvent } from "@/lib/google-calendar";
import { addTimelineEntry } from "@/lib/case-timeline";

// Convert a local date+time string to UTC using the given IANA timezone
function localToUTC(dateStr: string, timeStr: string, tz: string): Date {
  const candidate = new Date(`${dateStr}T${timeStr}Z`);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(candidate);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  const localForCandidate = `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
  const diffMs = new Date(`${dateStr}T${timeStr}:00`).getTime() - new Date(localForCandidate).getTime();
  return new Date(candidate.getTime() + diffMs);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspace } = await getCurrentWorkspace(user.id);
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const userRecord = await prisma.user.findUnique({ where: { id: user.id }, select: { timeZone: true } });
  const userTz = userRecord?.timeZone ?? "America/Los_Angeles";

  const { id } = await params;

  const suggestion = await prisma.aISuggestion.findFirst({
    where: { id, workspaceId: workspace.id },
  });
  if (!suggestion) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const suggestionFeedback = suggestion as typeof suggestion & {
    originalExtractedJson?: Prisma.JsonValue | null;
  };

  const body = await request.json() as { action: string; extractedData?: Record<string, unknown>; notes?: string; matchedEventId?: string };
  const { action, extractedData, notes } = body;
  const reviewedAt = new Date();


  if (action === "ignore") {
    const updated = await prisma.aISuggestion.update({
      where: { id },
      data: {
        status: "IGNORED",
        userAction: "IGNORED",
        reviewedBy: user.id,
        reviewedAt,
        notes: notes ?? null,
      } as Prisma.AISuggestionUncheckedUpdateInput,
    });
    return NextResponse.json({ suggestion: updated });
  }

  if (action === "approve" || action === "create_anyway") {
    const data = (extractedData ?? suggestion.extractedData) as {
      case?: Record<string, string | null>;
      event?: Record<string, string | null>;
      discovery?: Record<string, string | null>;
      discoveryExtension?: Record<string, string | boolean | null>;
    };
    const classification = suggestion.classification;
    const originalJson = (suggestionFeedback.originalExtractedJson ?? suggestion.extractedData) as Prisma.JsonValue;

    // Normalize extracted names to Title Case so cases, parties, and the
    // saved suggestion read like names instead of "ALL CAPS" / "camelCase".
    // Mutating data.case here also normalizes the value persisted below,
    // since `data` aliases the extractedData object we save.
    if (data.case) {
      data.case.plaintiff       = toTitleCaseName(data.case.plaintiff);
      data.case.defendant       = toTitleCaseName(data.case.defendant);
      data.case.defenseFirm     = toTitleCaseName(data.case.defenseFirm);
      data.case.defenseAttorney = toTitleCaseName(data.case.defenseAttorney);
      data.case.county          = toTitleCaseName(data.case.county);
      data.case.court           = toTitleCaseName(data.case.court);
    }

    if (classification === "CALENDAR_EVENT") {
      const event    = data.event;
      const caseData = data.case ?? {};

      if (!event?.date) {
        return NextResponse.json({ error: "Missing event date in extracted data" }, { status: 400 });
      }

      const startTime = localToUTC(event.date, event.startTime ?? "09:00", userTz);
      const endTime = event.endTime
        ? localToUTC(event.date, event.endTime, userTz)
        : new Date(startTime.getTime() + 60 * 60 * 1000);

      // Find or create the case so the event can be linked to it
      let caseId: string | undefined;
      // Use pre-matched case from ingestion if available
      const preMatchedCaseId = (data as Record<string, unknown>).matchedCaseId as string | undefined;
      if (preMatchedCaseId) {
        const preMatched = await prisma.case.findFirst({ where: { id: preMatchedCaseId, workspaceId: workspace.id } });
        if (preMatched) caseId = preMatched.id;
      }
      if (!caseId && (caseData.caseNumber || caseData.plaintiff || caseData.defendant)) {
        // 1. Try exact case number match
        let matchingCase = caseData.caseNumber
          ? await prisma.case.findFirst({
              where: { workspaceId: workspace.id, caseNumber: caseData.caseNumber },
            })
          : null;

        // 2. Try plaintiff/defendant name match against case titles and parties
        //    Handles: "Lugo Bernal", "Barsisa", "Martinez, Vidal", "VIDAL MARTINEZ"
        if (!matchingCase && (caseData.plaintiff || caseData.defendant)) {
          const allCases = await prisma.case.findMany({
            where: { workspaceId: workspace.id, status: { notIn: ["ARCHIVED", "CLOSED"] } },
            include: { parties: { select: { name: true, role: true } } },
          });

          function extractNameParts(raw: string): string[] {
            const cleaned = raw.replace(/,\s*/g, " ").trim().toLowerCase();
            return cleaned.split(/\s+/).filter((p) => p.length >= 2);
          }

          function nameMatches(searchName: string, target: string): boolean {
            const searchParts = extractNameParts(searchName);
            const targetLower = target.toLowerCase();
            // All name parts must appear in the target
            if (searchParts.length > 0 && searchParts.every((p) => targetLower.includes(p))) return true;
            // Or just the last name (first part for "Last, First" or last part for "First Last")
            const lastName = searchName.includes(",")
              ? searchName.split(",")[0].trim().toLowerCase()
              : searchParts[searchParts.length - 1];
            return !!lastName && lastName.length >= 3 && targetLower.includes(lastName);
          }

          for (const c of allCases) {
            const searchTargets = [c.title, ...c.parties.map((p) => p.name)];
            const plaintiffMatch = caseData.plaintiff &&
              searchTargets.some((t) => nameMatches(caseData.plaintiff!, t));
            const defendantMatch = caseData.defendant &&
              searchTargets.some((t) => nameMatches(caseData.defendant!, t));
            if (plaintiffMatch || defendantMatch) {
              matchingCase = c;
              break;
            }
          }
        }

        if (!matchingCase) {
          matchingCase = await prisma.case.create({
            data: {
              userId:          user.id,
              workspaceId:     workspace.id,
              title:           [caseData.plaintiff, "v.", caseData.defendant].filter(Boolean).join(" ") || "New Case",
              caseNumber:      caseData.caseNumber ?? undefined,
              county:          caseData.county ?? undefined,
              court:           caseData.court ?? undefined,
              defenseFirm:     caseData.defenseFirm ?? undefined,
              defenseAttorney: caseData.defenseAttorney ?? undefined,
              filingDate:      caseData.dateFiled ? new Date(caseData.dateFiled) : undefined,
              status:          "ACTIVE",
              parties: {
                create: [
                  ...(caseData.plaintiff ? [{ name: caseData.plaintiff, role: "PLAINTIFF" as const }] : []),
                  ...(caseData.defendant ? [{ name: caseData.defendant, role: "DEFENDANT" as const }] : []),
                ],
              },
            },
          });
        } else {
          // Fill in any fields that are missing on the existing case
          const updates: Record<string, unknown> = {};
          if (!matchingCase.county      && caseData.county)      updates.county      = caseData.county;
          if (!matchingCase.court       && caseData.court)       updates.court       = caseData.court;
          if (!matchingCase.defenseFirm && caseData.defenseFirm) updates.defenseFirm = caseData.defenseFirm;
          if (!matchingCase.defenseAttorney && caseData.defenseAttorney) updates.defenseAttorney = caseData.defenseAttorney;
          if (!matchingCase.filingDate  && caseData.dateFiled)   updates.filingDate  = new Date(caseData.dateFiled);

          if (Object.keys(updates).length > 0) {
            await prisma.case.update({ where: { id: matchingCase.id }, data: updates });
          }

          // Add plaintiff/defendant parties if not already present
          const existingParties = await prisma.caseParty.findMany({
            where: { caseId: matchingCase.id },
            select: { role: true },
          });
          const existingRoles = new Set(existingParties.map((p) => p.role));
          const newParties = [
            ...(caseData.plaintiff && !existingRoles.has("PLAINTIFF") ? [{ name: caseData.plaintiff, role: "PLAINTIFF" as const }] : []),
            ...(caseData.defendant && !existingRoles.has("DEFENDANT") ? [{ name: caseData.defendant, role: "DEFENDANT" as const }] : []),
          ];
          if (newParties.length > 0) {
            await prisma.caseParty.createMany({
              data: newParties.map((p) => ({ ...p, caseId: matchingCase!.id })),
            });
          }
        }

        caseId = matchingCase.id;
      }

      // Skip if a matching event already exists (same case, date, and event type)
      const duplicateEvent = caseId
        ? await prisma.event.findFirst({
            where: {
              workspaceId: workspace.id,
              caseId,
              startTime,
              eventType: mapEventType(event.eventType),
            },
          })
        : null;

      if (!duplicateEvent) {
        await prisma.event.create({
          data: {
            userId:      user.id,
            workspaceId: workspace.id,
            caseId,
            title:       event.title ?? suggestion.subject ?? "AI Inbox Event",
            description: event.description ?? undefined,
            startTime,
            endTime,
            location:    event.location ?? undefined,
            eventType:   mapEventType(event.eventType),
            status:      "SCHEDULED",
          },
        });
      }
    }

    if (classification === "DISCOVERY") {
      const disc = data.discovery ?? {};
      const caseData = data.case ?? {};

      let matchingCase = await prisma.case.findFirst({
        where: {
          workspaceId: workspace.id,
          ...(caseData.caseNumber ? { caseNumber: caseData.caseNumber } : {}),
        },
      });

      if (!matchingCase) {
        matchingCase = await prisma.case.create({
          data: {
            userId:          user.id,
            workspaceId:     workspace.id,
            title:           [caseData.plaintiff, "v.", caseData.defendant].filter(Boolean).join(" ") || "New Case",
            caseNumber:      caseData.caseNumber ?? undefined,
            county:          caseData.county ?? undefined,
            court:           caseData.court ?? undefined,
            defenseFirm:     caseData.defenseFirm ?? undefined,
            defenseAttorney: caseData.defenseAttorney ?? undefined,
            filingDate:      caseData.dateFiled ? new Date(caseData.dateFiled) : undefined,
            status:          "ACTIVE",
            parties: {
              create: [
                ...(caseData.plaintiff ? [{ name: caseData.plaintiff, role: "PLAINTIFF" as const }] : []),
                ...(caseData.defendant ? [{ name: caseData.defendant, role: "DEFENDANT" as const }] : []),
              ],
            },
          },
        });
      }

      const servedDate = disc.servedOrReceivedDate ? new Date(disc.servedOrReceivedDate) : new Date();
      const direction = disc.direction === "SERVED" ? "SERVED" : "RECEIVED";

      await createDiscoveryItem({
        caseId:              matchingCase.id,
        workspaceId:         workspace.id,
        createdBy:           user.id,
        direction,
        servedOrReceivedDate: servedDate,
      });
    }

    if (classification === "DISCOVERY_EXTENSION") {
      const ext = data.discoveryExtension ?? {};
      const caseData = data.case ?? {};
      if (ext.newDate) {
        // 1. Try exact case number match
        let matchingCase = caseData.caseNumber
          ? await prisma.case.findFirst({
              where: { workspaceId: workspace.id, caseNumber: caseData.caseNumber },
            })
          : null;

        // 2. Fall back to plaintiff/defendant name match
        if (!matchingCase && (caseData.plaintiff || caseData.defendant)) {
          const candidates = await prisma.case.findMany({
            where: { workspaceId: workspace.id },
            include: { parties: true },
          });
          for (const c of candidates) {
            const pMatch = !caseData.plaintiff || c.parties.some(
              (p) => p.role === "PLAINTIFF" &&
                p.name.toLowerCase().includes((caseData.plaintiff as string).toLowerCase())
            );
            const dMatch = !caseData.defendant || c.parties.some(
              (p) => p.role === "DEFENDANT" &&
                p.name.toLowerCase().includes((caseData.defendant as string).toLowerCase())
            );
            if (pMatch && dMatch) { matchingCase = c; break; }
          }
        }

        if (!matchingCase) {
          return NextResponse.json({
            error: "No matching case found in LitCal. Create the case first.",
          }, { status: 422 });
        }

        const rawNewDue = new Date(ext.newDate as string);
        const newDueDow = rawNewDue.getUTCDay();
        const newDueDaysToMonday = newDueDow === 6 ? 2 : newDueDow === 0 ? 1 : 0;
        const newDue = newDueDaysToMonday > 0
          ? new Date(rawNewDue.getTime() + newDueDaysToMonday * 24 * 60 * 60 * 1000)
          : rawNewDue;

        const mutual = ext.mutual === true || ext.mutual === "true";
        const appliesTo = (ext.appliesTo as string) === "BOTH" ? "BOTH"
          : (ext.appliesTo as string) === "OPPOSING_DEADLINE" ? "OPPOSING_DEADLINE"
          : "OUR_DEADLINE";

        const primaryItem = await prisma.discoveryItem.findFirst({
          where: { caseId: matchingCase.id, status: { notIn: ["COMPLETED"] } },
          orderBy: { updatedAt: "desc" },
        });

        if (!primaryItem) {
          return NextResponse.json({
            error: "No active discovery item found for this case. No changes made.",
          }, { status: 422 });
        }

        await grantDiscoveryExtension({
          discoveryItemId: primaryItem.id,
          grantedDate:     new Date(),
          newDueDate:      newDue,
          mutual,
          appliesTo,
          createdBy:       user.id,
        });
      }
    }

    if (classification === "EVENT_CANCELLATION") {
      const caseData = data.case ?? {};
      const cancellation = (data as Record<string, unknown>).cancellation as {
        eventType?: string | null;
        originalDate?: string | null;
        reason?: string | null;
        newDate?: string | null;
      } | undefined;

      if (cancellation?.originalDate) {
        // Find the matching case
        let matchingCase = caseData.caseNumber
          ? await prisma.case.findFirst({
              where: { workspaceId: workspace.id, caseNumber: caseData.caseNumber },
            })
          : null;

        if (!matchingCase && (caseData.plaintiff || caseData.defendant)) {
          const candidates = await prisma.case.findMany({
            where: { workspaceId: workspace.id },
            include: { parties: true },
          });
          for (const c of candidates) {
            const pMatch = !caseData.plaintiff || c.title.toLowerCase().includes(caseData.plaintiff.toLowerCase());
            const dMatch = !caseData.defendant || c.title.toLowerCase().includes(caseData.defendant.toLowerCase());
            if (pMatch && dMatch) { matchingCase = c; break; }
          }
        }

        if (matchingCase) {
          const originalDate = new Date(cancellation.originalDate);
          const dayStart = new Date(Date.UTC(originalDate.getUTCFullYear(), originalDate.getUTCMonth(), originalDate.getUTCDate()));
          const dayEnd = new Date(Date.UTC(originalDate.getUTCFullYear(), originalDate.getUTCMonth(), originalDate.getUTCDate(), 23, 59, 59, 999));

          const matchingEvents = await prisma.event.findMany({
            where: {
              workspaceId: workspace.id,
              caseId: matchingCase.id,
              startTime: { gte: dayStart, lte: dayEnd },
              status: { notIn: ["CANCELLED", "COMPLETED"] },
            },
          });

          for (const ev of matchingEvents) {
            await prisma.event.update({
              where: { id: ev.id },
              data: { status: "CANCELLED" },
            });
          }

          // If a new date was provided, create the rescheduled event
          if (cancellation.newDate) {
            const newStart = localToUTC(cancellation.newDate, "09:00", userTz);
            const newEnd = new Date(newStart.getTime() + 60 * 60 * 1000);
            const eventType = cancellation.eventType
              ? mapEventType(cancellation.eventType)
              : (matchingEvents[0]?.eventType ?? "OTHER");

            await prisma.event.create({
              data: {
                userId: user.id,
                workspaceId: workspace.id,
                caseId: matchingCase.id,
                title: matchingEvents[0]?.title ?? `${eventType} — ${matchingCase.title}`,
                startTime: newStart,
                endTime: newEnd,
                eventType,
                status: "SCHEDULED",
              },
            });
          }
        }
      }
    }

    if (classification === "NEW_CASE") {
      const caseData = data.case ?? {};
      await prisma.case.create({
        data: {
          userId:          user.id,
          workspaceId:     workspace.id,
          title:           [caseData.plaintiff, "v.", caseData.defendant].filter(Boolean).join(" ") || "New Case",
          caseNumber:      caseData.caseNumber ?? undefined,
          county:          caseData.county ?? undefined,
          court:           caseData.court ?? undefined,
          defenseFirm:     caseData.defenseFirm ?? undefined,
          defenseAttorney: caseData.defenseAttorney ?? undefined,
          filingDate:      caseData.dateFiled ? new Date(caseData.dateFiled) : undefined,
          status:          "ACTIVE",
          parties: {
            create: [
              ...(caseData.plaintiff ? [{ name: caseData.plaintiff, role: "PLAINTIFF" as const }] : []),
              ...(caseData.defendant ? [{ name: caseData.defendant, role: "DEFENDANT" as const }] : []),
            ],
          },
        },
      });
    }

    const finalJson = data as Prisma.InputJsonValue;
    const correctedFields = extractedData ? changedJsonFields(originalJson, data) : [];
    const userAction = action === "create_anyway"
      ? "CREATE_ANYWAY"
      : correctedFields.length > 0
        ? "APPROVED_WITH_EDITS"
        : "APPROVED_WITHOUT_EDITS";

    const updated = await prisma.aISuggestion.update({
      where: { id },
      data: {
        status:                "APPROVED",
        extractedData:         finalJson,
        originalExtractedJson: originalJson as Prisma.InputJsonValue,
        finalApprovedJson:     finalJson,
        correctedFields:       correctedFields as unknown as Prisma.InputJsonValue,
        correctionCount:       correctedFields.length,
        notes:                 notes ?? null,
        userAction,
        reviewedBy:            user.id,
        reviewedAt,
      } as Prisma.AISuggestionUncheckedUpdateInput,
    });

    // Mark the source email as read now that the user has acted on it.
    // (Emails we ignore/decline stay unread for manual review.)
    if (suggestion.gmailMessageId) {
      try {
        const refreshToken = await getInboxRefreshToken();
        if (refreshToken) {
          const gmail = google.gmail({ version: "v1", auth: makeOAuth2Client(refreshToken) });
          await gmail.users.messages.modify({
            userId: "me",
            id: suggestion.gmailMessageId,
            requestBody: { removeLabelIds: ["UNREAD"] },
          });
        }
      } catch (err) {
        console.warn("Failed to mark Gmail message as read on approve:", err);
      }
    }

    return NextResponse.json({ suggestion: updated });
  }

  // ── update_existing: update a matched LitCal event with new extracted data ──
  if (action === "update_existing") {
    const data = (extractedData ?? suggestion.extractedData) as Record<string, Record<string, string | null>>;
    const eventId = body.matchedEventId ?? (suggestion.extractedData as Record<string, unknown>)?.matchedEventId as string | undefined;
    if (!eventId) return NextResponse.json({ error: "No matched event ID" }, { status: 400 });

    const existingEvent = await prisma.event.findFirst({
      where: { id: eventId, workspaceId: workspace.id },
      include: { googleSync: true, caseRef: { select: { id: true, title: true } } },
    });
    if (!existingEvent) return NextResponse.json({ error: "Matched event not found" }, { status: 404 });

    const eventData = data.event ?? {};
    const updateFields: Record<string, unknown> = {};
    if (eventData.date) {
      const newStart = localToUTC(eventData.date, eventData.startTime ?? "09:00", userTz);
      const newEnd = eventData.endTime
        ? localToUTC(eventData.date, eventData.endTime, userTz)
        : new Date(newStart.getTime() + 60 * 60 * 1000);
      updateFields.startTime = newStart;
      updateFields.endTime = newEnd;
    }
    if (eventData.eventType) updateFields.eventType = mapEventType(eventData.eventType);
    if (eventData.title) updateFields.title = eventData.title;
    if (eventData.location) updateFields.location = eventData.location;
    if (eventData.description) updateFields.description = eventData.description;

    const updatedEvent = await prisma.event.update({
      where: { id: eventId },
      data: updateFields,
      include: { googleSync: true },
    });

    // Mirror to Google Calendar
    if (updatedEvent.googleSync) {
      const connection = await prisma.userCalendarConnection.findFirst({
        where: { userId: user.id, provider: "GOOGLE", isActive: true },
      });
      if (connection) {
        try {
          const accessToken = await getAccessToken(connection.refreshToken);
          const patchPayload: Record<string, unknown> = {};
          if (updateFields.title) patchPayload.summary = updateFields.title;
          if (updateFields.startTime) {
            const tz = "America/Los_Angeles";
            patchPayload.start = { dateTime: (updateFields.startTime as Date).toISOString(), timeZone: tz };
            patchPayload.end = { dateTime: (updateFields.endTime as Date).toISOString(), timeZone: tz };
          }
          await patchGoogleEvent(accessToken, updatedEvent.googleSync.googleCalendarId, updatedEvent.googleSync.googleEventId, patchPayload);
        } catch { /* best-effort */ }
      }
    }

    if (existingEvent.caseRef) {
      void addTimelineEntry({
        caseId: existingEvent.caseRef.id,
        workspaceId: workspace.id,
        actorUserId: user.id,
        type: "event.ai_updated",
        title: `Event updated from AI Inbox: ${existingEvent.title}`,
        metadata: { eventId, suggestionId: id },
      });
    }

    const originalJson = suggestion.extractedData as Prisma.InputJsonValue;
    const correctedFields = extractedData ? changedJsonFields(originalJson, data) : [];
    await prisma.aISuggestion.update({
      where: { id },
      data: {
        status: "APPROVED",
        extractedData: data as Prisma.InputJsonValue,
        originalExtractedJson: originalJson,
        finalApprovedJson: data as Prisma.InputJsonValue,
        correctedFields: correctedFields as unknown as Prisma.InputJsonValue,
        correctionCount: correctedFields.length,
        notes: notes ?? null,
        userAction: "UPDATED_EXISTING_RECORD",
        reviewedBy: user.id,
        reviewedAt,
        matchedEventId: eventId,
      } as Prisma.AISuggestionUncheckedUpdateInput,
    });

    return NextResponse.json({ ok: true, action: "updated_existing", eventId });
  }

  // ── cancel_existing: cancel a matched LitCal event ──
  if (action === "cancel_existing") {
    const data = (extractedData ?? suggestion.extractedData) as Record<string, Record<string, string | null>>;
    const eventId = body.matchedEventId ?? (suggestion.extractedData as Record<string, unknown>)?.matchedEventId as string | undefined;
    if (!eventId) return NextResponse.json({ error: "No matched event ID" }, { status: 400 });

    const existingEvent = await prisma.event.findFirst({
      where: { id: eventId, workspaceId: workspace.id },
      include: { googleSync: true, caseRef: { select: { id: true, title: true } } },
    });
    if (!existingEvent) return NextResponse.json({ error: "Matched event not found" }, { status: 404 });

    await prisma.event.update({ where: { id: eventId }, data: { status: "CANCELLED" } });

    // Delete from Google Calendar
    const syncInfo = existingEvent.googleSync;
    const userSync = !syncInfo
      ? await prisma.$queryRaw<Array<{ googleEventId: string; googleCalendarId: string }>>`
          SELECT "googleEventId", "googleCalendarId" FROM "UserGoogleCalendarSync"
          WHERE "eventId" = ${eventId} AND "googleCalendarId" != 'ics-import' LIMIT 1
        `.then((rows) => rows[0] ?? null)
      : null;
    const syncToDelete = userSync ?? syncInfo;
    if (syncToDelete) {
      const connection = await prisma.userCalendarConnection.findFirst({
        where: { userId: user.id, provider: "GOOGLE", isActive: true },
      });
      if (connection) {
        try {
          const accessToken = await getAccessToken(connection.refreshToken);
          await deleteGoogleEvent(accessToken, syncToDelete.googleCalendarId, syncToDelete.googleEventId);
        } catch { /* best-effort */ }
      }
    }

    // Create rescheduled event if new date provided
    const cancellation = (data as Record<string, unknown>).cancellation as Record<string, string | null> | undefined;
    if (cancellation?.newDate) {
      const newStart = localToUTC(cancellation.newDate, "09:00", userTz);
      const newEnd = new Date(newStart.getTime() + 60 * 60 * 1000);
      await prisma.event.create({
        data: {
          userId: user.id,
          workspaceId: workspace.id,
          caseId: existingEvent.caseId,
          title: existingEvent.title,
          startTime: newStart,
          endTime: newEnd,
          eventType: existingEvent.eventType,
          status: "SCHEDULED",
        },
      });
    }

    if (existingEvent.caseRef) {
      void addTimelineEntry({
        caseId: existingEvent.caseRef.id,
        workspaceId: workspace.id,
        actorUserId: user.id,
        type: "event.ai_cancelled",
        title: `Event cancelled from AI Inbox: ${existingEvent.title}`,
        metadata: { eventId, suggestionId: id, newDate: cancellation?.newDate ?? null },
      });
    }

    await prisma.aISuggestion.update({
      where: { id },
      data: {
        status: "APPROVED",
        userAction: "CANCELLED_EXISTING_RECORD",
        notes: notes ?? null,
        reviewedBy: user.id,
        reviewedAt,
        matchedEventId: eventId,
      } as Prisma.AISuggestionUncheckedUpdateInput,
    });

    return NextResponse.json({ ok: true, action: "cancelled_existing", eventId });
  }

  // ── rescan: re-extract from original email ──
  if (action === "rescan") {
    if (!suggestion.gmailMessageId) {
      return NextResponse.json({ error: "No Gmail message to rescan" }, { status: 400 });
    }

    try {
      const refreshToken = await getInboxRefreshToken();
      if (!refreshToken) return NextResponse.json({ error: "Gmail not connected" }, { status: 400 });

      const gmail = google.gmail({ version: "v1", auth: makeOAuth2Client(refreshToken) });
      const msg = await gmail.users.messages.get({ userId: "me", id: suggestion.gmailMessageId, format: "full" });
      const headers = msg.data.payload?.headers ?? [];
      const subject = headers.find((h) => h.name?.toLowerCase() === "subject")?.value ?? "";
      const sender = headers.find((h) => h.name?.toLowerCase() === "from")?.value ?? "";

      // Extract body text
      function getBodyText(payload: typeof msg.data.payload): string {
        if (payload?.body?.data) {
          return Buffer.from(payload.body.data, "base64url").toString("utf-8");
        }
        for (const part of payload?.parts ?? []) {
          if (part.mimeType === "text/plain" && part.body?.data) {
            return Buffer.from(part.body.data, "base64url").toString("utf-8");
          }
        }
        return "";
      }
      const bodyText = getBodyText(msg.data.payload);

      const results = await extractEmailSuggestion({ subject, sender, bodyText, attachmentTexts: [] });
      const newExtraction = results.find((r) => r.classification !== "IGNORE") ?? results[0];

      await prisma.aISuggestion.update({
        where: { id },
        data: {
          extractedData: newExtraction as unknown as Prisma.InputJsonValue,
          originalExtractedJson: suggestion.extractedData as Prisma.InputJsonValue,
          classification: newExtraction.classification,
          confidence: newExtraction.confidence,
          userAction: "RESCANNED",
          status: "PENDING",
        } as Prisma.AISuggestionUncheckedUpdateInput,
      });

      return NextResponse.json({ ok: true, action: "rescanned" });
    } catch (err) {
      console.error("Rescan failed:", err);
      return NextResponse.json({ error: "Rescan failed" }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

function mapDiscoveryType(raw: string | null | undefined): "FORM_INTERROGATORIES" | "SPECIAL_INTERROGATORIES" | "REQUESTS_FOR_PRODUCTION" | "REQUESTS_FOR_ADMISSION" | "DEPOSITION_NOTICE" | "OTHER" {
  if (!raw) return "OTHER";
  const t = raw.toUpperCase();
  if (t.includes("FORM_INTERROG") || (t.includes("FORM") && t.includes("INTERROG"))) return "FORM_INTERROGATORIES";
  if (t.includes("SPECIAL_INTERROG") || (t.includes("SPECIAL") && t.includes("INTERROG"))) return "SPECIAL_INTERROGATORIES";
  if (t.includes("PRODUCTION") || t.includes("RFP")) return "REQUESTS_FOR_PRODUCTION";
  if (t.includes("ADMISSION") || t.includes("RFA")) return "REQUESTS_FOR_ADMISSION";
  if (t.includes("DEPOSITION_NOTICE") || t.includes("DEPO")) return "DEPOSITION_NOTICE";
  return "OTHER";
}

function mapEventType(raw: string | null | undefined): "HEARING" | "DEPOSITION" | "TRIAL" | "CONFERENCE" | "MEDIATION" | "DEADLINE" | "OTHER" {
  if (!raw) return "OTHER";
  const t = raw.toUpperCase();
  if (t.includes("HEAR"))  return "HEARING";
  if (t.includes("DEPO"))  return "DEPOSITION";
  if (t.includes("TRIAL")) return "TRIAL";
  if (t.includes("CONF") || t.includes("CMC") || t.includes("MSC")) return "CONFERENCE";
  if (t.includes("MEDI"))  return "MEDIATION";
  if (t.includes("DEAD") || t.includes("EXTENSION")) return "DEADLINE";
  return "OTHER";
}

function changedJsonFields(original: unknown, finalValue: unknown) {
  const paths = new Set<string>();
  collectChangedPaths(original, finalValue, "", paths);
  return Array.from(paths).sort();
}

function collectChangedPaths(original: unknown, finalValue: unknown, path: string, paths: Set<string>) {
  if (jsonEqual(original, finalValue)) return;

  if (!isRecord(original) || !isRecord(finalValue)) {
    paths.add(path || "$");
    return;
  }

  const keys = new Set([...Object.keys(original), ...Object.keys(finalValue)]);
  for (const key of keys) {
    collectChangedPaths(original[key], finalValue[key], path ? `${path}.${key}` : key, paths);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonEqual(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}
