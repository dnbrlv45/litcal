import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspaces";
import { askLitCal } from "@/lib/ai/askLitCal";
import type { EventIntent, CaseIntent } from "@/lib/ai/askLitCal";
import { getFullCaseContext, getGlobalContext, searchCases } from "@/lib/ai/askLitCalData";
import { detectConflicts } from "@/lib/conflicts";
import { findCourtHearingRule } from "@/lib/court-hearing-rules";
import { HEARING_SUBTYPES } from "@/lib/google-calendar-payload";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspace } = await getCurrentWorkspace(user.id);
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 403 });

  const body = await request.json() as {
    question: string;
    activeCaseId?: string;
    history?: { role: "user" | "assistant"; content: string }[];
    pendingEvent?: EventIntent;
    pendingCase?: CaseIntent;
  };

  const { question, activeCaseId, history, pendingEvent, pendingCase } = body;
  if (!question?.trim()) return NextResponse.json({ error: "Question is required" }, { status: 400 });
  if (question.length > 1000) return NextResponse.json({ error: "Question too long (max 1000 characters)" }, { status: 400 });

  // Rate limit: 10 per minute
  const oneMinuteAgo = new Date(Date.now() - 60_000);
  const recentCount = await prisma.askLitCalLog.count({
    where: { userId: user.id, createdAt: { gte: oneMinuteAgo } },
  });
  if (recentCount >= 10) {
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
  const result = await askLitCal({ question, contextText, history });

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
          answer: `I found multiple cases matching "${intent.caseQuery}". Which one did you mean?\n\n${numbered}\n\nYou can type the number, case name, or case number.`,
          activeCaseId: finalActiveCaseId ?? null,
          caseMatches: eventCaseMatches,
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

    // All required fields present — build proposed event
    const eventDate = new Date(`${intent.date}T00:00:00`);
    let startISO: string;
    let endISO: string;

    if (intent.allDay) {
      startISO = `${intent.date}T00:00:00`;
      endISO = `${intent.date}T23:59:59`;
    } else {
      startISO = `${intent.date}T${intent.startTime}:00`;
      if (intent.endTime) {
        endISO = `${intent.date}T${intent.endTime}:00`;
      } else {
        // Default to 1 hour after start
        const [h, m] = intent.startTime!.split(":").map(Number);
        const endH = (h + 1) % 24;
        endISO = `${intent.date}T${String(endH).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
      }
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
        const startDate = new Date(startISO);
        const endDate = new Date(endISO);
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
      endTime: intent.allDay ? null : (intent.endTime ?? null),
      startISO,
      endISO,
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

    const CASE_TYPE_VALUES = ["AUTO_ACCIDENT","SLIP_AND_FALL","GOVERNMENT_CLAIM","DOG_BITE","PREMISES_LIABILITY","MEDICAL_MALPRACTICE","WRONGFUL_DEATH","PRODUCT_LIABILITY","OTHER"];
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
      finalAnswer = `I found ${matches.length} cases matching "${result.searchQuery}". Which one did you mean?\n\n${numbered}\n\nYou can type the number, case name, or case number.`;
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
