import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isSuperAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const suggestions = await prisma.aISuggestion.findMany({
    select: {
      status: true,
      userAction: true,
      duplicateOfId: true,
      correctedFields: true,
      finalApprovedJson: true,
      classification: true,
      confidence: true,
    },
  } as never) as {
    status: string;
    userAction: string | null;
    duplicateOfId: string | null;
    correctedFields: unknown;
    finalApprovedJson: unknown;
    classification: string;
    confidence: number | null;
  }[];

  const total = suggestions.length;
  const approved = suggestions.filter((s) => s.status === "APPROVED").length;
  const ignored = suggestions.filter((s) => s.userAction === "IGNORED" || (s.status === "IGNORED" && !s.userAction)).length;
  const duplicates = suggestions.filter((s) => s.duplicateOfId || s.userAction === "DUPLICATE" || s.status === "DUPLICATE").length;
  const editedBeforeApproval = suggestions.filter((s) =>
    s.finalApprovedJson != null && correctedFieldList(s.correctedFields).length > 0
  ).length;

  const correctedCounts = new Map<string, number>();
  for (const suggestion of suggestions) {
    for (const field of correctedFieldList(suggestion.correctedFields)) {
      correctedCounts.set(field, (correctedCounts.get(field) ?? 0) + 1);
    }
  }

  const mostCommonlyCorrectedFields = Array.from(correctedCounts.entries())
    .map(([field, count]) => ({ field, count }))
    .sort((a, b) => b.count - a.count || a.field.localeCompare(b.field))
    .slice(0, 10);

  // Per-classification breakdown
  const classificationBreakdown: Record<string, { total: number; approved: number; ignored: number; duplicates: number }> = {};
  const confidenceSums: Record<string, { sum: number; count: number }> = {};

  for (const s of suggestions) {
    const cls = s.classification;
    if (!classificationBreakdown[cls]) classificationBreakdown[cls] = { total: 0, approved: 0, ignored: 0, duplicates: 0 };
    classificationBreakdown[cls].total++;
    if (s.status === "APPROVED") classificationBreakdown[cls].approved++;
    if (s.status === "IGNORED") classificationBreakdown[cls].ignored++;
    if (s.status === "DUPLICATE") classificationBreakdown[cls].duplicates++;

    if (s.confidence != null) {
      if (!confidenceSums[cls]) confidenceSums[cls] = { sum: 0, count: 0 };
      confidenceSums[cls].sum += s.confidence;
      confidenceSums[cls].count++;
    }
  }

  const avgConfidenceByClassification: Record<string, number> = {};
  for (const [cls, { sum, count }] of Object.entries(confidenceSums)) {
    avgConfidenceByClassification[cls] = count > 0 ? sum / count : 0;
  }

  const rescanCount = suggestions.filter((s) => s.userAction === "RESCANNED").length;
  const updateCount = suggestions.filter((s) => s.userAction === "UPDATED_EXISTING_RECORD").length;
  const cancelCount = suggestions.filter((s) => s.userAction === "CANCELLED_EXISTING_RECORD").length;

  return NextResponse.json({
    totalSuggestions: total,
    approvalRate: rate(approved, total),
    ignoreRate: rate(ignored, total),
    duplicateRate: rate(duplicates, total),
    editBeforeApprovalRate: rate(editedBeforeApproval, approved),
    counts: {
      approved,
      ignored,
      duplicates,
      editedBeforeApproval,
      rescans: rescanCount,
      updates: updateCount,
      cancellations: cancelCount,
    },
    classificationBreakdown,
    avgConfidenceByClassification,
    mostCommonlyCorrectedFields,
  });
}

function rate(numerator: number, denominator: number) {
  if (denominator === 0) return 0;
  return numerator / denominator;
}

function correctedFieldList(value: unknown) {
  return Array.isArray(value) ? value.filter((field): field is string => typeof field === "string") : [];
}
