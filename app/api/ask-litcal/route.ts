import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canEdit, getCurrentWorkspace } from "@/lib/workspaces";
import { askLitCal, askLitCalStream } from "@/lib/ai/askLitCal";
import type { EventIntent, CaseIntent, EditEventIntent, TaskIntent } from "@/lib/ai/askLitCal";
import { getFullCaseContext, getGlobalContext, searchCases } from "@/lib/ai/askLitCalData";
import { detectConflicts } from "@/lib/conflicts";
import { findCourtHearingRule } from "@/lib/court-hearing-rules";
import { HEARING_SUBTYPES, buildGoogleEventPayload } from "@/lib/google-calendar-payload";
import { getAccessToken, patchGoogleEvent } from "@/lib/google-calendar";
import { replaceEventReminders } from "@/lib/reminders";
import { cascadeDeadlineDateChange } from "@/lib/deadline-rules";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (request.headers.get("accept")?.includes("text/x-litcal-stream")) {
    return streamAskLitCalResponse(request);
  }

  return handleAskLitCalRequest(request);
}

function streamAskLitCalResponse(request: NextRequest) {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      async start(controller) {
        const send = (payload: unknown) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
        };

        try {
          const response = await handleAskLitCalRequest(request, {
            onAnswerChunk: (text) => send({ type: "delta", text }),
          });
          const data = await response.clone().json().catch(() => ({ error: "Something went wrong." }));
          send({ type: "final", status: response.status, data });
        } catch (err) {
          console.error("Ask LitCal stream failed:", err);
          send({ type: "final", status: 500, data: { error: "Something went wrong." } });
        } finally {
          controller.close();
        }
      },
    }),
    {
      headers: {
        "Content-Type": "text/x-litcal-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    },
  );
}

async function handleAskLitCalRequest(
  request: NextRequest,
  options: { onAnswerChunk?: (text: string) => void } = {},
) {
  const user = await requireUser();
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  const { workspace, membership } = await getCurrentWorkspace(user.id);
  if (!workspace || !membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const isViewer = !canEdit(membership.role);

  const body = await request.json() as {
    question: string;
    activeCaseId?: string;
    history?: { role: "user" | "assistant"; content: string }[];
    pendingEvent?: EventIntent;
    pendingCase?: CaseIntent;
    activeDraft?: {
      title: string;
      eventType: string;
      subtype?: string | null;
      date: string;
      startTime?: string | null;
      endTime?: string | null;
      allDay: boolean;
      department?: string | null;
      location?: string | null;
      description?: string | null;
      inPerson: boolean;
      caseId?: string | null;
      caseName?: string | null;
    };
  };

  const { question, activeCaseId, history, pendingEvent, pendingCase } = body;
  const activeDraft = body.activeDraft;
  if (!question?.trim()) return NextResponse.json({ error: "Question is required" }, { status: 400 });
  if (question.length > 1000) return NextResponse.json({ error: "Question too long (max 1000 characters)" }, { status: 400 });

  // Rate limit: 10 per minute
  const oneMinuteAgo = new Date(Date.now() - 60_000);
  const recentCount = await prisma.askLitCalLog.count({
    where: { userId: user.id, createdAt: { gte: oneMinuteAgo } },
  });
  if (recentCount >= 25) {
    return NextResponse.json({ error: "Rate limit exceeded. Please wait a moment." }, { status: 429 });
  }

  // Build context based on whether we have an active case
  let contextText: string;
  if (activeCaseId) {
    const caseExists = await prisma.case.findFirst({
      where: { id: activeCaseId, workspaceId: workspace.id },
      select: { id: true },
    });
    if (caseExists) {
      contextText = await getFullCaseContext(activeCaseId, workspace.id);
    } else {
      contextText = await getGlobalContext(workspace.id);
    }
  } else {
    contextText = await getGlobalContext(workspace.id);
  }

  // Tell the AI which case is active so it doesn't re-search
  if (activeCaseId) {
    contextText += `\n\nACTIVE CASE ID: ${activeCaseId}\nThe user has an active case in context. If they say "this case", "the case", or refer to the current case without naming a different one, use this case. Do NOT search for it again.`;
  }

  // Append pending event/case context so the AI can merge new info with existing fields
  if (pendingEvent && Object.keys(pendingEvent).length > 0) {
    const fields = Object.entries(pendingEvent)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    contextText += `\n\nPENDING EVENT (user is filling in details — merge new info with these):\n${fields}`;
  }
  if (pendingCase && Object.keys(pendingCase).length > 0) {
    const fields = Object.entries(pendingCase)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    contextText += `\n\nPENDING CASE (user is filling in details — merge new info with these):\n${fields}`;
  }

  // Include active draft context so the AI knows there's a pending proposal
  if (activeDraft) {
    const draftFields = [
      `Title: ${activeDraft.title}`,
      `Event Type: ${activeDraft.eventType}`,
      activeDraft.subtype ? `Subtype: ${activeDraft.subtype}` : null,
      `Date: ${activeDraft.date}`,
      activeDraft.startTime ? `Start: ${activeDraft.startTime}` : null,
      activeDraft.endTime ? `End: ${activeDraft.endTime}` : null,
      activeDraft.allDay ? `All Day: yes` : null,
      activeDraft.department ? `Department: ${activeDraft.department}` : null,
      activeDraft.location ? `Location: ${activeDraft.location}` : null,
      activeDraft.inPerson ? `In Person: yes` : `In Person: no`,
      activeDraft.caseName ? `Case: ${activeDraft.caseName}` : null,
      activeDraft.description ? `Notes: ${activeDraft.description}` : null,
    ].filter(Boolean).join("\n");
    contextText += `\n\nACTIVE DRAFT (event proposal awaiting confirmation — user may want to edit this):\n${draftFields}`;
  }

  // Include workspace members so the AI can reference staff by name
  const workspaceMembers = await prisma.workspaceMember.findMany({
    where: { workspaceId: workspace.id },
    include: { user: { select: { id: true, firstName: true, lastName: true } } },
  });
  if (workspaceMembers.length > 0) {
    const memberLines = workspaceMembers.map((m) =>
      `- ${[m.user.firstName, m.user.lastName].filter(Boolean).join(" ") || "Unknown"} (role: ${m.role})`
    );
    contextText += `\n\nWORKSPACE MEMBERS:\n${memberLines.join("\n")}`;
  }

  // Call Gemini
  const result = options.onAnswerChunk
    ? await askLitCalStream({ question, contextText, history }, options.onAnswerChunk)
    : await askLitCal({ question, contextText, history });

  // Viewers can read/search but not create or edit
  if (isViewer && (result.editDraftIntent || result.editEventIntent || result.eventIntent || result.caseIntent || result.taskIntent)) {
    return NextResponse.json({
      answer: "You have view-only access and cannot create or edit events or cases. You can ask me to summarize cases, find events, or answer questions about your calendar.",
      activeCaseId,
    });
  }

  // Handle task creation intent
  if (result.taskIntent) {
    const intent: TaskIntent = result.taskIntent;

    let taskCaseId: string | null = activeCaseId ?? null;

    if (intent.caseQuery) {
      const matches = await searchCases(intent.caseQuery, workspace.id);
      if (matches.length === 1) taskCaseId = matches[0].id;
    }

    const resolveStaffMember = async (name: string | undefined) => {
      if (!name) return null;
      const nameLower = name.toLowerCase().trim();
      const members = await prisma.workspaceMember.findMany({
        where: { workspaceId: workspace.id },
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
      });
      const match = members.find((m) => {
        const full = [m.user.firstName, m.user.lastName].filter(Boolean).join(" ").toLowerCase();
        return full === nameLower || (m.user.firstName ?? "").toLowerCase() === nameLower || (m.user.lastName ?? "").toLowerCase() === nameLower;
      });
      return match ?? null;
    };

    const assigneeMember = await resolveStaffMember(intent.assignedToName);

    const VALID_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];
    const priority = VALID_PRIORITIES.includes(intent.priority ?? "") ? intent.priority! : "MEDIUM";

    const task = await prisma.task.create({
      data: {
        workspaceId: workspace.id,
        title: intent.title,
        description: intent.description ?? null,
        status: "TODO",
        priority: priority as never,
        dueDate: intent.dueDate ? new Date(intent.dueDate) : null,
        caseId: taskCaseId,
        assignees: assigneeMember
          ? { create: [{ memberId: assigneeMember.id }] }
          : undefined,
      },
      include: { caseRef: { select: { title: true } } },
    });

    if (task.caseId) {
      void prisma.caseTimeline.create({
        data: {
          id: `ct_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          caseId: task.caseId,
          workspaceId: workspace.id,
          actorUserId: user.id,
          type: "task.created",
          title: `Task created via Ask LitCal: ${task.title}`,
        },
      });
    }

    await prisma.askLitCalLog.create({
      data: {
        id: `alc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        workspaceId: workspace.id, userId: user.id,
        caseId: taskCaseId,
        question: question.slice(0, 1000),
        answer: `Task created: ${task.title}`,
        model: result.model,
      },
    });

    return NextResponse.json({
      answer: result.answer,
      activeCaseId: taskCaseId ?? activeCaseId ?? null,
      createdTask: { id: task.id, title: task.title, caseTitle: task.caseRef?.title ?? null },
    });
  }

  // Handle draft edit intent
  if (result.editDraftIntent && activeDraft) {
    const edits = result.editDraftIntent;

    await prisma.askLitCalLog.create({
      data: {
        id: `alc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        workspaceId: workspace.id, userId: user.id,
        caseId: activeDraft.caseId ?? activeCaseId ?? null,
        question: question.slice(0, 1000),
        answer: `Draft edit: ${JSON.stringify(edits)}. ${result.answer}`,
        model: result.model,
      },
    });

    return NextResponse.json({
      answer: result.answer,
      activeCaseId: activeCaseId ?? null,
      draftEdits: edits,
    });
  }

  // Handle existing event edit intent
  if (result.editEventIntent) {
    const intent: EditEventIntent = result.editEventIntent;

    const existing = await prisma.event.findFirst({
      where: {
        id: intent.eventId,
        OR: [{ workspaceId: workspace.id }, { userId: user.id, workspaceId: null }],
      },
    });

    if (!existing) {
      return NextResponse.json({ answer: "I couldn't find that event in your workspace.", activeCaseId });
    }

    // Build updated times using user's timezone
    const userRecord = await prisma.user.findUnique({ where: { id: user.id }, select: { timeZone: true } });
    const tz = userRecord?.timeZone ?? "America/Los_Angeles";

    // Interpret a local date+time string as wall-clock time in `tz`, return UTC Date
    function localToUTC(dateStr: string, timeStr: string, timezone: string): Date {
      const candidate = new Date(`${dateStr}T${timeStr}Z`);
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
      }).formatToParts(candidate);
      const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
      const localForCandidate = `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
      const diffMs = new Date(`${dateStr}T${timeStr}:00`).getTime() - new Date(localForCandidate).getTime();
      return new Date(candidate.getTime() + diffMs);
    }

    const fmtDate = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    const fmtTime = new Intl.DateTimeFormat("en-CA", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false });
    const existingDate = fmtDate.format(existing.startTime);
    const existingStart = fmtTime.format(existing.startTime).replace(/^24:/, "00:");
    const existingEnd = fmtTime.format(existing.endTime).replace(/^24:/, "00:");

    const newDate = intent.date ?? existingDate;
    const newStartTime = (intent.startTime ?? existingStart).replace(/^24:/, "00:");
    let newEndTime = (intent.endTime ?? existingEnd).replace(/^24:/, "00:");

    // If only the start time moved, shift the end time to preserve the original duration
    if (intent.startTime !== undefined && intent.endTime === undefined) {
      const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
      const toStr = (mins: number) => {
        const norm = ((mins % 1440) + 1440) % 1440;
        return `${String(Math.floor(norm / 60)).padStart(2, "0")}:${String(norm % 60).padStart(2, "0")}`;
      };
      const duration = toMin(existingEnd) - toMin(existingStart);
      if (duration > 0) newEndTime = toStr(toMin(newStartTime) + duration);
    }

    let newStart: Date;
    let newEnd: Date;
    try {
      newStart = localToUTC(newDate, newStartTime, tz);
      newEnd = localToUTC(newDate, newEndTime, tz);
      if (isNaN(newStart.getTime()) || isNaN(newEnd.getTime())) throw new Error("Invalid date");
    } catch {
      return NextResponse.json({ answer: "I couldn't parse the new time. Please try again with a clearer time like '9 AM' or '14:00'.", activeCaseId });
    }

    const timingChanged = intent.date !== undefined || intent.startTime !== undefined || intent.endTime !== undefined;
    // A specific time given on a previously all-day event makes it a timed event
    const becomesTimed = existing.allDay && (intent.startTime !== undefined || intent.endTime !== undefined);

    const validTypes = ["DEADLINE","HEARING","DEPOSITION","TRIAL","CONFERENCE","MEETING","MEDIATION","COURT_CALL","CASE_MANAGEMENT_CONFERENCE","REMINDER","OTHER"];
    const updatedEvent = await prisma.event.update({
      where: { id: intent.eventId },
      data: {
        ...(intent.title !== undefined && { title: intent.title }),
        ...(intent.department !== undefined && { department: intent.department }),
        ...(intent.location !== undefined && { location: intent.location }),
        ...(intent.description !== undefined && { description: intent.description }),
        ...(intent.eventType && validTypes.includes(intent.eventType) && { eventType: intent.eventType as never }),
        ...(intent.subtype !== undefined && { subtype: intent.subtype }),
        ...(becomesTimed && { allDay: false }),
        startTime: newStart,
        endTime: newEnd,
      },
      include: {
        googleSync: true,
        caseRef: { select: { title: true, caseNumber: true, county: true, court: true } },
        assignedAttorney: { select: { firstName: true, lastName: true } },
      },
    });

    // Cascade deadline date changes and refresh reminders when timing changed
    if (timingChanged) {
      try {
        await replaceEventReminders(prisma, intent.eventId, newStart, updatedEvent.eventType);
        await cascadeDeadlineDateChange(intent.eventId, newStart);
      } catch (err) {
        console.error("Deadline cascade / reminder refresh failed on Ask LitCal edit:", err);
      }
    }

    // Mirror the edit to Google Calendar
    if (updatedEvent.googleSync) {
      try {
        const connection = await prisma.userCalendarConnection.findFirst({
          where: { userId: user.id, provider: "GOOGLE", isActive: true },
          select: { refreshToken: true },
        });
        if (connection) {
          const accessToken = await getAccessToken(connection.refreshToken);
          const payload = buildGoogleEventPayload({
            title: updatedEvent.title,
            eventType: updatedEvent.eventType,
            subtype: updatedEvent.subtype,
            subtypeReason: updatedEvent.subtypeReason,
            description: updatedEvent.description,
            location: updatedEvent.location,
            department: updatedEvent.department,
            inPerson: updatedEvent.inPerson,
            caseName: updatedEvent.caseRef?.title ?? null,
            caseNumber: updatedEvent.caseRef?.caseNumber ?? null,
            countyName: updatedEvent.caseRef?.county ?? null,
            courtName: updatedEvent.caseRef?.court ?? null,
            appearanceType: updatedEvent.appearanceType,
            remoteLink: updatedEvent.remoteLink,
            phoneNumber: updatedEvent.phoneNumber,
            bridge: updatedEvent.bridge,
            password: updatedEvent.remotePassword,
            requestRequired: updatedEvent.requestRequired,
            attorneyName: updatedEvent.assignedAttorney
              ? [updatedEvent.assignedAttorney.firstName, updatedEvent.assignedAttorney.lastName].filter(Boolean).join(" ") || null
              : null,
          });
          await patchGoogleEvent(
            accessToken,
            updatedEvent.googleSync.googleCalendarId,
            updatedEvent.googleSync.googleEventId,
            {
              summary: payload.summary,
              description: payload.description,
              location: payload.location,
              colorId: payload.colorId,
              start: updatedEvent.allDay
                ? { date: newStart.toISOString().slice(0, 10) }
                : { dateTime: newStart.toISOString(), timeZone: tz },
              end: updatedEvent.allDay
                ? { date: newEnd.toISOString().slice(0, 10) }
                : { dateTime: newEnd.toISOString(), timeZone: tz },
            }
          );
        }
      } catch (err) {
        console.error("Google Calendar patch failed on Ask LitCal edit:", err);
      }
    }

    if (existing.caseId) {
      void prisma.caseTimeline.create({
        data: {
          id: `ct_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          caseId: existing.caseId,
          workspaceId: workspace.id,
          actorUserId: user.id,
          type: "event.edited",
          title: `Event updated via Ask LitCal: ${existing.title}`,
        },
      });
    }

    await prisma.askLitCalLog.create({
      data: {
        id: `alc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        workspaceId: workspace.id, userId: user.id,
        caseId: existing.caseId ?? activeCaseId ?? null,
        question: question.slice(0, 1000),
        answer: result.answer,
        model: result.model,
      },
    });

    return NextResponse.json({ answer: result.answer, activeCaseId: existing.caseId ?? activeCaseId ?? null });
  }

  // Handle event creation intent
  if (result.eventIntent) {
    const intent: EventIntent = { ...pendingEvent, ...result.eventIntent };
    let finalActiveCaseId = activeCaseId;

    // Resolve case from caseQuery
    let resolvedCase: { id: string; title: string; caseNumber: string | null; county: string | null; court: string | null } | null = null;
    let eventCaseMatches: { id: string; title: string; caseNumber: string | null }[] | undefined;

    if (intent.caseQuery) {
      const matches = await searchCases(intent.caseQuery, workspace.id);
      if (matches.length === 1) {
        const full = await prisma.case.findUnique({
          where: { id: matches[0].id },
          select: { id: true, title: true, caseNumber: true, county: true, court: true, status: true },
        });
        if (full && full.status !== "ARCHIVED" && full.status !== "CLOSED") {
          resolvedCase = full;
          finalActiveCaseId = full.id;
        }
      } else if (matches.length > 1) {
        eventCaseMatches = matches.slice(0, 8);
        const numbered = matches.slice(0, 8).map((m, i) =>
          `${i + 1}. **${m.title}**${m.caseNumber ? ` (#${m.caseNumber})` : ""}`
        ).join("\n");

        await prisma.askLitCalLog.create({
          data: {
            id: `alc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            workspaceId: workspace.id, userId: user.id, caseId: null,
            question: question.slice(0, 1000),
            answer: "Multiple case matches — asking user to select.",
            model: result.model,
          },
        });

        return NextResponse.json({
          answer: `I found multiple cases matching "${intent.caseQuery}". Which one did you mean?\n\n${numbered}\n\nClick a case below to select it.`,
          activeCaseId: finalActiveCaseId ?? null,
          caseMatches: eventCaseMatches,
          pendingEvent: intent,
        });
      } else {
        // No matches found — tell the user
        await prisma.askLitCalLog.create({
          data: {
            id: `alc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            workspaceId: workspace.id, userId: user.id, caseId: null,
            question: question.slice(0, 1000),
            answer: `No case found matching "${intent.caseQuery}".`,
            model: result.model,
          },
        });

        return NextResponse.json({
          answer: `I couldn't find a case matching "${intent.caseQuery}" in LitCal. Please try the full case name, case number, or plaintiff/defendant name.`,
          activeCaseId: finalActiveCaseId ?? null,
          pendingEvent: intent,
        });
      }
    } else if (activeCaseId) {
      const full = await prisma.case.findFirst({
        where: { id: activeCaseId, workspaceId: workspace.id },
        select: { id: true, title: true, caseNumber: true, county: true, court: true, status: true },
      });
      if (full && full.status !== "ARCHIVED" && full.status !== "CLOSED") {
        resolvedCase = full;
      }
    }

    // Check what's missing
    const missingFields: string[] = [];
    if (!intent.eventType) missingFields.push("event type");
    if (intent.eventType === "CONFERENCE" && !intent.subtype) missingFields.push("conference subtype (e.g. CMC, MSC, OSC)");
    if (!intent.date) missingFields.push("date");
    if (!intent.allDay && !intent.startTime) missingFields.push("start time");

    if (missingFields.length > 0) {
      await prisma.askLitCalLog.create({
        data: {
          id: `alc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          workspaceId: workspace.id, userId: user.id,
          caseId: resolvedCase?.id ?? finalActiveCaseId ?? null,
          question: question.slice(0, 1000),
          answer: `Missing fields: ${missingFields.join(", ")}. ${result.answer}`,
          model: result.model,
        },
      });

      return NextResponse.json({
        answer: result.answer,
        activeCaseId: finalActiveCaseId ?? null,
        pendingEvent: intent,
      });
    }

    // Compute default end time if not specified (1 hour after start)
    let effectiveEndTime = intent.endTime ?? null;
    if (!intent.allDay && !effectiveEndTime && intent.startTime) {
      const [h, m] = intent.startTime.split(":").map(Number);
      const endH = (h + 1) % 24;
      effectiveEndTime = `${String(endH).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }

    // Map eventType for API
    let apiEventType = intent.eventType!;
    if (apiEventType === "CONFERENCE") {
      if (intent.subtype === "CMC" || intent.subtype === "Further CMC") {
        apiEventType = "CASE_MANAGEMENT_CONFERENCE";
      } else {
        apiEventType = "CONFERENCE";
      }
    }

    // Auto-generate title
    const subtypeLabel = intent.subtype
      ? (HEARING_SUBTYPES.find((s) => s.value === intent.subtype)?.label.replace(/ \([A-Z/ ]+\)$/, "") ?? intent.subtype)
      : null;
    const eventTypeLabels: Record<string, string> = {
      CONFERENCE: "Conference", DEPOSITION: "Deposition", TRIAL: "Trial",
      MEDIATION: "Mediation", DEADLINE: "Deadline", MEETING: "Meeting",
      REMINDER: "Reminder", CASE_MANAGEMENT_CONFERENCE: "Case Management Conference",
      OTHER: "Other",
    };
    const typeLabel = eventTypeLabels[apiEventType] ?? apiEventType;
    const title = resolvedCase
      ? `${resolvedCase.title} — ${subtypeLabel ?? typeLabel}`
      : subtypeLabel ?? typeLabel;

    // Check conflicts
    let conflicts: { eventId: string; title: string; startTime: string; endTime: string; attorneyName: string }[] = [];
    if (resolvedCase) {
      const caseData = await prisma.case.findUnique({
        where: { id: resolvedCase.id },
        select: { staff: { where: { role: "ATTORNEY" }, select: { userId: true }, take: 1 } },
      });
      const attorneyId = caseData?.staff[0]?.userId;
      if (attorneyId && !intent.allDay) {
        const startDate = new Date(`${intent.date}T${intent.startTime}:00-07:00`);
        const endDate = new Date(`${intent.date}T${effectiveEndTime}:00-07:00`);
        const found = await detectConflicts(attorneyId, startDate, endDate);
        conflicts = found.map((c) => ({
          eventId: c.eventId,
          title: c.title,
          startTime: c.startTime.toISOString(),
          endTime: c.endTime.toISOString(),
          attorneyName: c.attorneyName,
        }));
      }
    }

    // Look up court hearing rule for preview
    let rulePreview: { appearanceType: string | null; requestRequired: boolean } | null = null;
    const supportsRemote = ["CONFERENCE", "CASE_MANAGEMENT_CONFERENCE", "COURT_CALL"].includes(apiEventType);
    if (supportsRemote && intent.inPerson !== true && resolvedCase) {
      const rule = await findCourtHearingRule({
        state: null,
        countyName: resolvedCase.county,
        courtName: resolvedCase.court,
        department: intent.department,
      });
      if (rule) {
        rulePreview = { appearanceType: rule.appearanceType, requestRequired: rule.requestRequired };
      }
    }

    // Format time for display
    const formatTime12 = (t: string) => {
      const [h, m] = t.split(":").map(Number);
      const ampm = h >= 12 ? "PM" : "AM";
      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
    };

    const proposedEvent = {
      title,
      eventType: apiEventType,
      subtype: intent.subtype ?? null,
      subtypeReason: intent.subtypeReason ?? null,
      date: intent.date!,
      startTime: intent.allDay ? null : intent.startTime!,
      endTime: intent.allDay ? null : effectiveEndTime,
      allDay: intent.allDay ?? false,
      department: intent.department ?? null,
      location: intent.location ?? null,
      description: intent.description ?? null,
      inPerson: intent.inPerson ?? false,
      caseId: resolvedCase?.id ?? null,
      caseName: resolvedCase?.title ?? null,
      caseNumber: resolvedCase?.caseNumber ?? null,
      county: resolvedCase?.county ?? null,
      court: resolvedCase?.court ?? null,
      conflicts,
      rulePreview,
      displayTime: intent.allDay
        ? "All Day"
        : `${formatTime12(intent.startTime!)}${intent.endTime ? ` – ${formatTime12(intent.endTime)}` : ""}`,
    };

    await prisma.askLitCalLog.create({
      data: {
        id: `alc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        workspaceId: workspace.id, userId: user.id,
        caseId: resolvedCase?.id ?? finalActiveCaseId ?? null,
        question: question.slice(0, 1000),
        answer: `Proposed event: ${title}. Awaiting confirmation.`,
        model: result.model,
      },
    });

    return NextResponse.json({
      answer: result.answer,
      activeCaseId: finalActiveCaseId ?? null,
      proposedEvent,
    });
  }

  // Handle case creation intent
  if (result.caseIntent) {
    const intent: CaseIntent = { ...pendingCase, ...result.caseIntent };

    // Check required fields: plaintiff, defendant, caseType, countyName
    const missingRequired: string[] = [];
    if (!intent.plaintiff) missingRequired.push("Plaintiff");
    if (!intent.defendant) missingRequired.push("Defendant");
    if (!intent.caseType) missingRequired.push("Case Type (e.g. auto accident, slip and fall, dog bite)");
    if (!intent.countyName) missingRequired.push("County");

    if (missingRequired.length > 0) {
      await prisma.askLitCalLog.create({
        data: {
          id: `alc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          workspaceId: workspace.id, userId: user.id, caseId: null,
          question: question.slice(0, 1000),
          answer: `Missing required: ${missingRequired.join(", ")}. ${result.answer}`,
          model: result.model,
        },
      });

      return NextResponse.json({
        answer: result.answer,
        activeCaseId: activeCaseId ?? null,
        pendingCase: intent,
      });
    }

    // Smart optional fields: ask about case number and date of loss if not known and not pre-lit skipped
    const needsOptionalPrompt = !intent.preLitigation && !intent.caseNumber && !intent.dateOfLoss
      && !(pendingCase as Record<string, unknown> | undefined)?.optionalFieldsAsked;

    if (needsOptionalPrompt) {
      await prisma.askLitCalLog.create({
        data: {
          id: `alc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          workspaceId: workspace.id, userId: user.id, caseId: null,
          question: question.slice(0, 1000),
          answer: "Asking for optional fields before case creation.",
          model: result.model,
        },
      });

      const optionalQuestions: string[] = [];
      if (!intent.caseNumber) optionalQuestions.push("Do you have the **case number**?");
      if (!intent.dateOfLoss) optionalQuestions.push("Do you know the **date of loss**?");

      const prompt = optionalQuestions.length > 0
        ? `Before I create the case:\n\n${optionalQuestions.join("\n\n")}\n\nYou can answer with both, or say "no" to skip.`
        : result.answer;

      return NextResponse.json({
        answer: prompt,
        activeCaseId: activeCaseId ?? null,
        pendingCase: { ...intent, optionalFieldsAsked: true } as CaseIntent,
      });
    }

    // Generate title
    const title = `${intent.plaintiff} v. ${intent.defendant}`;

    // Resolve staff names to user IDs
    const resolveStaffByName = async (name: string | undefined) => {
      if (!name) return null;
      const nameLower = name.toLowerCase().trim();
      const member = workspaceMembers.find((m) => {
        const full = [m.user.firstName, m.user.lastName].filter(Boolean).join(" ").toLowerCase();
        const first = (m.user.firstName ?? "").toLowerCase();
        const last = (m.user.lastName ?? "").toLowerCase();
        return full === nameLower || first === nameLower || last === nameLower;
      });
      return member?.user.id ?? null;
    };

    const attorneyId = await resolveStaffByName(intent.attorneyName);
    const paralegalId = await resolveStaffByName(intent.paralegalName);
    const assistantId = await resolveStaffByName(intent.assistantName);

    const CASE_TYPE_VALUES = ["AUTO_ACCIDENT","SLIP_AND_FALL","GOVERNMENT_CLAIM","DOG_BITE","PREMISES_LIABILITY","MEDICAL_MALPRACTICE","WRONGFUL_DEATH","PRODUCT_LIABILITY","UIM_ARBITRATION","OTHER"];
    const caseType = CASE_TYPE_VALUES.includes(intent.caseType ?? "") ? intent.caseType! : "AUTO_ACCIDENT";

    const caseTypeLabels: Record<string, string> = {
      AUTO_ACCIDENT: "Auto Accident", SLIP_AND_FALL: "Slip and Fall",
      GOVERNMENT_CLAIM: "Government Claim", DOG_BITE: "Dog Bite",
      PREMISES_LIABILITY: "Premises Liability", MEDICAL_MALPRACTICE: "Medical Malpractice",
      WRONGFUL_DEATH: "Wrongful Death", PRODUCT_LIABILITY: "Product Liability", OTHER: "Other",
    };

    const proposedCase = {
      title,
      plaintiff: intent.plaintiff!,
      defendant: intent.defendant!,
      caseNumber: intent.caseNumber ?? null,
      countyName: intent.countyName!,
      courtName: intent.courtName ?? null,
      department: intent.department ?? null,
      judge: intent.judge ?? null,
      caseType,
      caseTypeLabel: caseTypeLabels[caseType] ?? caseType,
      filingDate: intent.filingDate ?? null,
      dateOfLoss: intent.dateOfLoss ?? null,
      defenseFirm: intent.defenseFirm ?? null,
      defenseAttorney: intent.defenseAttorney ?? null,
      description: intent.description ?? null,
      attorneyId,
      attorneyName: intent.attorneyName ?? null,
      paralegalId,
      paralegalName: intent.paralegalName ?? null,
      assistantId,
      assistantName: intent.assistantName ?? null,
    };

    await prisma.askLitCalLog.create({
      data: {
        id: `alc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        workspaceId: workspace.id, userId: user.id, caseId: null,
        question: question.slice(0, 1000),
        answer: `Proposed case: ${title}. Awaiting confirmation.`,
        model: result.model,
      },
    });

    return NextResponse.json({
      answer: result.answer,
      activeCaseId: activeCaseId ?? null,
      proposedCase,
    });
  }

  // Handle search routing — Gemini wants to look up a case by name
  let caseMatches: { id: string; title: string; caseNumber: string | null }[] | undefined;
  let finalActiveCaseId = activeCaseId;
  let finalAnswer = result.answer;

  // Check if user is selecting from a previous multi-match list (e.g. "1", "2", or a case number)
  const trimmedQ = question.trim();
  const isNumberSelection = /^\d{1,2}$/.test(trimmedQ);
  const lastAssistantMsg = history?.filter((m) => m.role === "assistant").slice(-1)[0];
  const hadCaseMatches = lastAssistantMsg?.content.includes("Which one did you mean?");

  if (hadCaseMatches && (isNumberSelection || trimmedQ.length < 30)) {
    // Try to resolve the selection against workspace cases
    const selectionMatches = await searchCases(trimmedQ, workspace.id);
    if (selectionMatches.length === 1) {
      finalActiveCaseId = selectionMatches[0].id;
      const caseContext = await getFullCaseContext(selectionMatches[0].id, workspace.id);
      const retryResult = await askLitCal({
        question: `Tell me about this case.`,
        contextText: caseContext,
        history,
      });
      finalAnswer = retryResult.answer;
      finalActiveCaseId = retryResult.activeCaseId ?? selectionMatches[0].id;
    }
  }

  if (finalAnswer === result.answer && result.searchQuery) {
    const matches = await searchCases(result.searchQuery, workspace.id);
    if (matches.length === 1) {
      finalActiveCaseId = matches[0].id;
      const caseContext = await getFullCaseContext(matches[0].id, workspace.id);
      const retryResult = await askLitCal({ question, contextText: caseContext, history });
      finalAnswer = retryResult.answer;
      finalActiveCaseId = retryResult.activeCaseId ?? matches[0].id;
    } else if (matches.length > 1) {
      caseMatches = matches.slice(0, 8);
      const numbered = matches.slice(0, 8).map((m, i) =>
        `${i + 1}. **${m.title}**${m.caseNumber ? ` (#${m.caseNumber})` : ""}`
      ).join("\n");
      finalAnswer = `I found ${matches.length} cases matching "${result.searchQuery}". Which one did you mean?\n\n${numbered}\n\nClick a case below to select it.`;
    } else {
      finalAnswer = `I couldn't find a case matching "${result.searchQuery}" in LitCal. Try the full case name, case number, plaintiff name, or defendant name.`;
    }
  } else if (finalAnswer === result.answer && result.activeCaseId) {
    finalActiveCaseId = result.activeCaseId;
  }

  // Log
  await prisma.askLitCalLog.create({
    data: {
      id: `alc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      workspaceId: workspace.id,
      userId: user.id,
      caseId: finalActiveCaseId ?? null,
      question: question.slice(0, 1000),
      answer: finalAnswer.slice(0, 10000),
      model: result.model,
    },
  });

  return NextResponse.json({
    answer: finalAnswer,
    activeCaseId: finalActiveCaseId ?? null,
    caseMatches: caseMatches ?? null,
  });
}
