import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canManageWorkspace, getCurrentWorkspace } from "@/lib/workspaces";

export const runtime = "nodejs";

type ImportRow = {
  rowNumber: number;
  plaintiff: string | null;
  defendants: string | null;
  caseNumber: string | null;
  county: string | null;
  court: string | null;
  defenseAttorney: string | null;
  defenseFirm: string | null;
  dateFiled: string | null;
  servedDate: string | null;
  status: string | null;
  dateOfLoss: string | null;
  caseType: string | null;
  attorney: string | null;
};

type ImportCase = {
  importKey: string;
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
  sourceRows: number[];
  warnings: string[];
  duplicateCaseId: string | null;
};

const COLUMN_ALIASES: Record<keyof Omit<ImportRow, "rowNumber">, string[]> = {
  plaintiff: ["plaintiff", "plaintiffs", "claimant", "client", "case"],
  defendants: ["defendant", "defendants", "defendant(s)", "defendant s"],
  caseNumber: ["case number", "case no", "case #", "caseno", "docket", "docket number", "court case number"],
  county: ["county", "venue county"],
  court: ["court", "court name", "venue", "superior court", "courthouse"],
  defenseAttorney: ["defense attorney", "defense counsel"],
  defenseFirm: ["defense firm", "defense law firm", "firm"],
  dateFiled: ["date filed", "filed", "filing date", "file date"],
  servedDate: ["served date", "date served", "service date", "date of service"],
  status: ["status", "case status"],
  dateOfLoss: ["date of loss", "dol", "doi", "loss date", "incident date"],
  caseType: ["case type", "type", "matter type"],
  attorney: ["atty", "attorney", "assigned attorney", "lead attorney"],
};

const STATUS_ALIASES: Record<string, ImportCase["status"]> = {
  active: "ACTIVE",
  open: "ACTIVE",
  pending: "PENDING",
  closed: "CLOSED",
  archived: "ARCHIVED",
  settled: "SETTLED",
  discovery: "DISCOVERY",
  arbitration: "ARBITRATION",
  "uim arbitration": "UIM_ARBITRATION",
  "um arbitration": "UM_ARBITRATION",
  litigation: "ACTIVE",
  trial: "ACTIVE",
  served: "SERVED",
  "partially served": "PARTIALLY_SERVED",
  "pending service": "PENDING_SERVICE",
  "sent for service": "SENT_FOR_SERVICE",
  "service postponed": "SERVICE_POSTPONED",
  "pending rfd": "PENDING_RFD",
  disbursement: "DISBURSEMENT",
  "lien negotiations": "LIEN_NEGOTIATIONS",
  "dismissal filed": "DISMISSAL_FILED",
  "pre-litigation": "PENDING",
  "pre litigation": "PENDING",
};

const CASE_TYPE_ALIASES: Record<string, string> = {
  auto: "AUTO_ACCIDENT",
  "auto accident": "AUTO_ACCIDENT",
  "motor vehicle": "AUTO_ACCIDENT",
  "slip and fall": "SLIP_AND_FALL",
  "slip/fall": "SLIP_AND_FALL",
  "slip / fall": "SLIP_AND_FALL",
  "government claim": "GOVERNMENT_CLAIM",
  "dog bite": "DOG_BITE",
  "premises liability": "PREMISES_LIABILITY",
  "medical malpractice": "MEDICAL_MALPRACTICE",
  "wrongful death": "WRONGFUL_DEATH",
  "product liability": "PRODUCT_LIABILITY",
};

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[._-]+/g, " ")
    .trim();
}


function parseDate(value: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function isInvalidDateValue(original: string | null, parsed: string | null) {
  return Boolean(original?.trim()) && parsed === null;
}

function normalizeStatus(value: string | null): ImportCase["status"] {
  if (!value) return "ACTIVE";
  return STATUS_ALIASES[value.trim().toLowerCase()] ?? "ACTIVE";
}

function normalizeCaseType(value: string | null): string | null {
  if (!value) return null;
  return CASE_TYPE_ALIASES[value.trim().toLowerCase()] ?? null;
}

function parseNameFromCaseColumn(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/^(.+?)\s*-\s*(?:\d{1,2}\/\d{1,2}\/\d{2,4}|DOL\b)/i);
  if (match) return match[1].trim();
  const plusMatch = value.match(/^(.+?)\s*\+\s*\d+$/);
  if (plusMatch) return plusMatch[1].trim();
  return value.trim();
}

function normalizeCounty(value: string | null): string | null {
  if (!value) return null;
  return value.replace(/_/g, " ").trim() || null;
}

function compactNameList(names: string[]) {
  const seen = new Set<string>();
  return names
    .map((name) => name.trim())
    .filter(Boolean)
    .filter((name) => {
      const key = name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function buildTitle(plaintiffs: string[], defendants: string | null) {
  const plaintiffTitle = plaintiffs.length > 1 ? `${plaintiffs[0]} et al.` : plaintiffs[0] ?? "Unknown Plaintiff";
  return defendants ? `${plaintiffTitle} v. ${defendants}` : plaintiffTitle;
}

function groupKey(row: ImportRow) {
  const caseNumber = row.caseNumber?.toLowerCase().trim();
  if (caseNumber) {
    return [caseNumber, row.county?.toLowerCase().trim() ?? "", row.court?.toLowerCase().trim() ?? ""].join("|");
  }
  return [
    row.plaintiff?.toLowerCase().trim() ?? "",
    row.defendants?.toLowerCase().trim() ?? "",
    row.dateOfLoss ?? "",
  ].join("|");
}

async function resolveDuplicate(workspaceId: string, item: ImportCase) {
  if (!item.caseNumber) return null;
  const duplicate = await prisma.case.findFirst({
    where: {
      workspaceId,
      caseNumber: { equals: item.caseNumber, mode: "insensitive" },
    },
    select: { id: true },
  });
  return duplicate?.id ?? null;
}

export async function POST(request: NextRequest) {
  try {
  const currentUser = await requireUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspace, membership } = await getCurrentWorkspace(currentUser.id);
  if (!workspace || !membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  if (!canManageWorkspace(membership.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json() as { rawRows?: string[][] };
  const rawRows = body.rawRows ?? [];
  if (rawRows.length === 0) return NextResponse.json({ error: "No rows found." }, { status: 400 });

  const headers = new Map<string, number>();
  rawRows[0].forEach((value, index) => {
    headers.set(normalizeHeader(value), index);
  });

  const columns = Object.fromEntries(
    Object.entries(COLUMN_ALIASES).map(([key, aliases]) => [
      key,
      aliases.map(normalizeHeader).map((alias) => headers.get(alias)).find((index) => index !== undefined) ?? null,
    ]),
  ) as Record<keyof Omit<ImportRow, "rowNumber">, number | null>;

  if (columns.plaintiff === null && columns.caseNumber === null) {
    return NextResponse.json({ error: "The file needs at least a Plaintiff/Case or Case Number column." }, { status: 400 });
  }

  const rows: ImportRow[] = [];
  rawRows.slice(1).forEach((row, index) => {
    const rowNumber = index + 2;
    const get = (key: keyof Omit<ImportRow, "rowNumber">) => {
      const col = columns[key];
      return col !== null ? row[col] || null : null;
    };
    const plaintiffValue = parseNameFromCaseColumn(get("plaintiff"));
    const rawDateFiled = get("dateFiled");
    const rawDateOfLoss = get("dateOfLoss");
    const rawServedDate = get("servedDate");
    const item: ImportRow = {
      rowNumber,
      plaintiff: plaintiffValue,
      defendants: get("defendants"),
      caseNumber: get("caseNumber"),
      county: normalizeCounty(get("county")),
      court: get("court"),
      defenseAttorney: get("defenseAttorney"),
      defenseFirm: get("defenseFirm"),
      dateFiled: parseDate(rawDateFiled),
      servedDate: parseDate(rawServedDate),
      status: get("status"),
      dateOfLoss: parseDate(rawDateOfLoss),
      caseType: get("caseType"),
      attorney: get("attorney"),
    };
    if (isInvalidDateValue(rawDateFiled, item.dateFiled)) item.dateFiled = "INVALID_DATE";
    if (isInvalidDateValue(rawDateOfLoss, item.dateOfLoss)) item.dateOfLoss = "INVALID_DATE";
    if (isInvalidDateValue(rawServedDate, item.servedDate)) item.servedDate = "INVALID_DATE";
    if (Object.entries(item).some(([key, value]) => key !== "rowNumber" && value)) rows.push(item);
  });

  const grouped = new Map<string, ImportCase>();
  for (const row of rows) {
    const key = groupKey(row);
    const existing = grouped.get(key);
    if (existing) {
      existing.plaintiffs = compactNameList([...existing.plaintiffs, row.plaintiff ?? ""]);
      existing.sourceRows.push(row.rowNumber);
      continue;
    }

    const plaintiffs = compactNameList([row.plaintiff ?? ""]);
    const warnings: string[] = [];
    if (!row.plaintiff) warnings.push("Missing plaintiff");
    if (!row.caseNumber) warnings.push("Missing case number");
    if (!row.defendants) warnings.push("Missing defendant");
    if (row.dateFiled === "INVALID_DATE") warnings.push("Invalid filing date");
    if (row.dateOfLoss === "INVALID_DATE") warnings.push("Invalid date of loss");
    if (row.servedDate === "INVALID_DATE") warnings.push("Invalid served date");

    grouped.set(key, {
      importKey: key,
      title: buildTitle(plaintiffs, row.defendants),
      plaintiffs,
      defendants: row.defendants,
      caseNumber: row.caseNumber,
      county: row.county,
      court: row.court,
      defenseAttorney: row.defenseAttorney,
      defenseFirm: row.defenseFirm,
      filingDate: row.dateFiled === "INVALID_DATE" ? null : row.dateFiled,
      servedDate: row.servedDate === "INVALID_DATE" ? null : row.servedDate,
      dateOfLoss: row.dateOfLoss === "INVALID_DATE" ? null : row.dateOfLoss,
      caseType: normalizeCaseType(row.caseType),
      attorney: row.attorney,
      status: normalizeStatus(row.status),
      sourceRows: [row.rowNumber],
      warnings,
      duplicateCaseId: null,
    });
  }

  const cases = await Promise.all(
    Array.from(grouped.values()).map(async (item) => ({
      ...item,
      title: buildTitle(item.plaintiffs, item.defendants),
      duplicateCaseId: await resolveDuplicate(workspace.id, item),
    })),
  );

  return NextResponse.json({
    rowsFound: rows.length,
    casesFound: cases.length,
    mergedPlaintiffRows: Math.max(0, rows.length - cases.length),
    cases,
  });
  } catch (err) {
    console.error("Import preview error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
