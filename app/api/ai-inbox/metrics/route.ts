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
    },
  } as never) as {
    status: string;
    userAction: string | null;
    duplicateOfId: string | null;
    correctedFields: unknown;
    finalApprovedJson: unknown;
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
    },
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
