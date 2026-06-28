import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspaces";
import { askLitCal } from "@/lib/ai/askLitCal";
import { getFullCaseContext, getGlobalContext, searchCases } from "@/lib/ai/askLitCalData";

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
  };

  const { question, activeCaseId, history } = body;
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
    // Verify case belongs to workspace
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

  // Call Gemini
  const result = await askLitCal({ question, contextText, history });

  // Handle search routing — Gemini wants to look up a case by name
  let caseMatches: { id: string; title: string; caseNumber: string | null }[] | undefined;
  let finalActiveCaseId = activeCaseId;
  let finalAnswer = result.answer;

  if (result.searchQuery) {
    const matches = await searchCases(result.searchQuery, workspace.id);
    if (matches.length === 1) {
      // Single match — fetch case context and re-ask
      finalActiveCaseId = matches[0].id;
      const caseContext = await getFullCaseContext(matches[0].id, workspace.id);
      const retryResult = await askLitCal({ question, contextText: caseContext, history });
      finalAnswer = retryResult.answer;
      finalActiveCaseId = retryResult.activeCaseId ?? matches[0].id;
    } else if (matches.length > 1) {
      caseMatches = matches.slice(0, 5);
      finalAnswer = `I found ${matches.length} cases matching "${result.searchQuery}". Which one did you mean?\n\n` +
        matches.slice(0, 5).map((m) => `- **${m.title}**${m.caseNumber ? ` (#${m.caseNumber})` : ""}`).join("\n");
    } else {
      finalAnswer = `I couldn't find a case matching "${result.searchQuery}" in your workspace. Try using the full case name, case number, or a party name.`;
    }
  } else if (result.activeCaseId) {
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
