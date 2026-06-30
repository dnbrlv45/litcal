import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageWorkspace, getCurrentWorkspace } from "@/lib/workspaces";
import { addTimelineEntry } from "@/lib/case-timeline";

export const runtime = "nodejs";

const VALID_STATUSES = new Set([
  "ACTIVE","CLOSED","ARCHIVED","PENDING","DISCOVERY","ARBITRATION",
  "UIM_ARBITRATION","UM_ARBITRATION","SERVED","PARTIALLY_SERVED",
  "PENDING_SERVICE","SENT_FOR_SERVICE","SERVICE_POSTPONED","PENDING_RFD",
  "SETTLED","DISBURSEMENT","LIEN_NEGOTIATIONS","DISMISSAL_FILED",
]);

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
  servedDate: string | null;
  dateOfLoss: string | null;
  caseType: string | null;
  attorney: string | null;
  status: string;
  duplicateCaseId: string | null;
};

type CountyCourtResult = {
  countyId: string | null;
  courtId: string | null;
  county: string | null;
  court: string | null;
};

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

  const { workspace, membership } = await getCurrentWorkspace(currentUser.id);
  if (!workspace || !membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  if (!canManageWorkspace(membership.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json() as { cases?: ImportCase[]; skipDuplicates?: boolean };
  const importCases = body.cases ?? [];
  if (!importCases.length) return NextResponse.json({ error: "No cases to import." }, { status: 400 });
  if (importCases.length > 500) return NextResponse.json({ error: "Import is limited to 500 grouped cases at a time." }, { status: 400 });

  const toImport = body.skipDuplicates !== false
    ? importCases.filter((item) => !item.duplicateCaseId)
    : importCases;
  const skippedCount = importCases.length - toImport.length;

  const validCases = toImport.filter((item) => {
    const plaintiffs = item.plaintiffs.map((n) => n.trim()).filter(Boolean);
    return item.title?.trim() && plaintiffs.length > 0;
  });
  const failedValidation = toImport.length - validCases.length;

  // Batch-resolve all unique county/court combos
  const countyCourtKeys = [...new Set(validCases.map((c) => `${c.county ?? ""}|||${c.court ?? ""}`))];
  const countyCourtMap = new Map<string, CountyCourtResult>();

  const uniqueCounties = [...new Set(validCases.map((c) => c.county?.trim()).filter(Boolean))] as string[];
  const uniqueCourts = [...new Set(validCases.map((c) => c.court?.trim()).filter(Boolean))] as string[];

  const [counties, courts] = await Promise.all([
    uniqueCounties.length > 0
      ? prisma.county.findMany({ where: { name: { in: uniqueCounties, mode: "insensitive" } } })
      : [],
    uniqueCourts.length > 0
      ? prisma.court.findMany({
          where: { name: { in: uniqueCourts, mode: "insensitive" } },
          select: { id: true, name: true, countyId: true },
        })
      : [],
  ]);

  const countyByName = new Map(counties.map((c) => [c.name.toLowerCase(), c]));
  const courtsByCounty = new Map<string, Map<string, { id: string; name: string }>>();
  for (const c of courts) {
    let m = courtsByCounty.get(c.countyId);
    if (!m) { m = new Map(); courtsByCounty.set(c.countyId, m); }
    m.set(c.name.toLowerCase(), c);
  }

  for (const key of countyCourtKeys) {
    const [countyName, courtName] = key.split("|||");
    if (!countyName) {
      countyCourtMap.set(key, { countyId: null, courtId: null, county: null, court: courtName || null });
      continue;
    }
    const county = countyByName.get(countyName.toLowerCase());
    if (!county) {
      countyCourtMap.set(key, { countyId: null, courtId: null, county: countyName, court: courtName || null });
      continue;
    }
    let courtId: string | null = null;
    let courtDisplay: string | null = courtName || null;
    if (courtName) {
      const courtRow = courtsByCounty.get(county.id)?.get(courtName.toLowerCase());
      courtId = courtRow?.id ?? null;
      courtDisplay = courtRow?.name ?? courtName;
    }
    countyCourtMap.set(key, { countyId: county.id, courtId, county: county.name, court: courtDisplay });
  }

  // Create cases in batches to avoid transaction timeout
  const failed: { title: string; error: string }[] = [];
  const created: string[] = [];
  const BATCH_SIZE = 20;
  const allResults: { id: string; title: string; caseNumber: string | null }[] = [];

  for (let i = 0; i < validCases.length; i += BATCH_SIZE) {
    const batch = validCases.slice(i, i + BATCH_SIZE);
    const batchResult = await prisma.$transaction(
      batch.map((item) => {
        const ccKey = `${item.county ?? ""}|||${item.court ?? ""}`;
        const cc = countyCourtMap.get(ccKey)!;
        const plaintiffs = item.plaintiffs.map((n) => n.trim()).filter(Boolean);

        return prisma.case.create({
          data: {
            userId: currentUser.id,
            workspaceId: workspace.id,
            orgId: null,
            title: item.title.trim(),
            caseNumber: clean(item.caseNumber),
            caseType: (item.caseType as any) || "AUTO_ACCIDENT",
            status: (VALID_STATUSES.has(item.status) ? item.status : "ACTIVE") as any,
            county: cc.county,
            court: cc.court,
            countyId: cc.countyId,
            courtId: cc.courtId,
            filingDate: dateOrNull(item.filingDate),
            servedDate: dateOrNull(item.servedDate),
            dateOfLoss: dateOrNull(item.dateOfLoss),
            defendant: clean(item.defendants),
            defenseFirm: clean(item.defenseFirm),
            defenseAttorney: clean(item.defenseAttorney),
            parties: {
              create: plaintiffs.map((name) => ({ name, role: "PLAINTIFF" as const })),
            },
          } as Prisma.CaseUncheckedCreateInput,
          select: { id: true, title: true, caseNumber: true },
        });
      }),
    );
    allResults.push(...batchResult);
  }

  for (const newCase of allResults) {
    created.push(newCase.id);
  }

  // Fire timeline entries in parallel (non-blocking)
  void Promise.all(
    allResults.map((newCase) =>
      addTimelineEntry({
        caseId: newCase.id,
        workspaceId: workspace.id,
        actorUserId: currentUser.id,
        type: "case.created",
        title: "Case imported",
        description: newCase.caseNumber ? `Case #${newCase.caseNumber}` : "Imported from spreadsheet",
      }),
    ),
  );

  return NextResponse.json({
    createdCount: created.length,
    skippedCount,
    failedCount: failedValidation + failed.length,
    created,
    skipped: [] as string[],
    failed,
  });
}
