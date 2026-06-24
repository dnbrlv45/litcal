import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspaces";
import { addTimelineEntry } from "@/lib/case-timeline";

export const runtime = "nodejs";

type ImportCase = {
  title: string;
  plaintiffs: string[];
  defendants: string | null;
  caseNumber: string | null;
  county: string | null;
  court: string | null;
  defenseAttorney: string | null;
  defenseFirm: string | null;
  filingDate: string | null;
  dateOfLoss: string | null;
  status: "ACTIVE" | "PENDING" | "CLOSED" | "ARCHIVED";
  duplicateCaseId: string | null;
};

async function resolveCountyCourt(countyName?: string | null, courtName?: string | null) {
  if (!countyName) return { countyId: null, courtId: null, county: null, court: courtName ?? null };
  const county = await prisma.county.findFirst({ where: { name: { equals: countyName, mode: "insensitive" } } });
  if (!county) return { countyId: null, courtId: null, county: countyName, court: courtName ?? null };
  let courtId: string | null = null;
  let court: string | null = courtName ?? null;
  if (courtName) {
    const courtRow = await prisma.court.findFirst({
      where: { countyId: county.id, name: { equals: courtName, mode: "insensitive" } },
    });
    courtId = courtRow?.id ?? null;
    court = courtRow?.name ?? courtName;
  }
  return { countyId: county.id, courtId, county: county.name, court };
}

function clean(value: string | null | undefined) {
  return value?.trim() || null;
}

function dateOrNull(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function POST(request: NextRequest) {
  const currentUser = await requireUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspace } = await getCurrentWorkspace(currentUser.id);
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 403 });

  const body = await request.json() as { cases?: ImportCase[]; skipDuplicates?: boolean };
  const importCases = body.cases ?? [];
  if (!importCases.length) return NextResponse.json({ error: "No cases to import." }, { status: 400 });
  if (importCases.length > 500) return NextResponse.json({ error: "Import is limited to 500 grouped cases at a time." }, { status: 400 });

  const created: string[] = [];
  const skipped: string[] = [];
  const failed: { title: string; error: string }[] = [];

  for (const item of importCases) {
    try {
      if (body.skipDuplicates !== false && item.duplicateCaseId) {
        skipped.push(item.title);
        continue;
      }

      const countyCourt = await resolveCountyCourt(item.county, item.court);
      const plaintiffs = item.plaintiffs.map((name) => name.trim()).filter(Boolean);
      if (!item.title?.trim() || plaintiffs.length === 0) {
        failed.push({ title: item.title || item.caseNumber || "Untitled row", error: "Missing title or plaintiff." });
        continue;
      }

      const newCase = await prisma.case.create({
        data: {
          userId: currentUser.id,
          workspaceId: workspace.id,
          orgId: null,
          title: item.title.trim(),
          caseNumber: clean(item.caseNumber),
          caseType: "AUTO_ACCIDENT",
          status: item.status,
          county: countyCourt.county,
          court: countyCourt.court,
          countyId: countyCourt.countyId,
          courtId: countyCourt.courtId,
          filingDate: dateOrNull(item.filingDate),
          dateOfLoss: dateOrNull(item.dateOfLoss),
          defendant: clean(item.defendants),
          defenseFirm: clean(item.defenseFirm),
          defenseAttorney: clean(item.defenseAttorney),
          parties: {
            create: plaintiffs.map((name) => ({
              name,
              role: "PLAINTIFF" as const,
            })),
          },
        } as Prisma.CaseUncheckedCreateInput,
        select: { id: true, title: true, caseNumber: true },
      });

      created.push(newCase.id);
      void addTimelineEntry({
        caseId: newCase.id,
        workspaceId: workspace.id,
        actorUserId: currentUser.id,
        type: "case.created",
        title: "Case imported",
        description: newCase.caseNumber ? `Case #${newCase.caseNumber}` : "Imported from spreadsheet",
      });
    } catch (error) {
      failed.push({ title: item.title || item.caseNumber || "Untitled row", error: error instanceof Error ? error.message : "Import failed." });
    }
  }

  return NextResponse.json({
    createdCount: created.length,
    skippedCount: skipped.length,
    failedCount: failed.length,
    created,
    skipped,
    failed,
  });
}
