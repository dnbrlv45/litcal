import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), override: true });

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter } as never);

function norm(s: string | null | undefined): string {
  return (s ?? "").trim();
}
function normKey(s: string | null | undefined): string {
  return norm(s).toLowerCase();
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const values: string[] = [];
    let cur = ""; let inQuote = false;
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === "," && !inQuote) { values.push(cur.trim()); cur = ""; }
      else { cur += ch; }
    }
    values.push(cur.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ""; });
    return row;
  });
}

async function main() {
  const csvPath = "/Users/dylanbarlava/Desktop/Court Hearings - Sheet1.csv";
  const text = fs.readFileSync(csvPath, "utf-8");
  const rows = parseCSV(text);
  console.log(`Importing ${rows.length} rows…`);

  let created = 0, updated = 0, skipped = 0;

  for (const raw of rows) {
    const countyName = norm(raw["county"]);
    if (!countyName) { skipped++; continue; }

    const state = normKey(raw["state"]) || "ca";
    const courtName      = norm(raw["court_name"])   || null;
    const department     = norm(raw["department"])   || null;
    const appearanceType = norm(raw["appearance_type"]) || null;
    const phoneNumber    = norm(raw["phone_number"]) || null;
    const bridge         = norm(raw["bridge"])        || null;
    const password       = norm(raw["password"])      || null;
    const remoteLink     = norm(raw["remote_link"])   || null;
    const requestRequired     = normKey(raw["request_required_bool"]) === "yes";
    const requestContactEmail = norm(raw["request_contact_email"]) || null;
    const requestNotes        = norm(raw["request_notes"])          || null;
    const requestDaysRaw      = parseInt(norm(raw["reqest_task_days_before"]), 10);
    const requestDaysBefore   = isNaN(requestDaysRaw) ? null : requestDaysRaw;

    // Upsert County
    let countyRecord = await prisma.county.findFirst({
      where: { state: { equals: state, mode: "insensitive" }, name: { equals: countyName, mode: "insensitive" } },
    });
    if (!countyRecord) {
      countyRecord = await prisma.county.create({ data: { state: state.toLowerCase(), name: countyName } });
      console.log(`  Created county: ${countyName} (${state.toUpperCase()})`);
    }

    // Upsert Court
    let courtRecord = null;
    if (courtName) {
      courtRecord = await prisma.court.findFirst({
        where: { countyId: countyRecord.id, name: { equals: courtName, mode: "insensitive" } },
      });
      if (!courtRecord) {
        courtRecord = await prisma.court.create({
          data: { countyId: countyRecord.id, name: courtName },
        });
      }
    }

    // Upsert Department
    let departmentRecord = null;
    if (courtRecord && department) {
      departmentRecord = await prisma.department.upsert({
        where: { courtId_name: { courtId: courtRecord.id, name: department } },
        create: { courtId: courtRecord.id, name: department },
        update: {},
      });
    }

    const countyKey = countyName.toLowerCase();
    const courtKey  = courtName?.toLowerCase() ?? null;
    const deptKey   = department?.toLowerCase() ?? null;

    const data = {
      state: state.toLowerCase(),
      countyId: countyRecord.id,
      courtId: courtRecord?.id ?? null,
      departmentId: departmentRecord?.id ?? null,
      countyName: countyKey,
      courtName: courtKey,
      department: deptKey,
      appearanceType,
      phoneNumber,
      bridge,
      password,
      remoteLink,
      requestRequired,
      requestContactEmail,
      requestNotes,
      requestDaysBefore,
      active: true,
    };

    try {
      const existing = await prisma.courtHearingRule.findUnique({
        where: {
          state_countyName_courtName_department: {
            state: state.toLowerCase(),
            countyName: countyKey,
            courtName: courtKey ?? "",
            department: deptKey ?? "",
          },
        },
      });

      if (existing) {
        await prisma.courtHearingRule.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await prisma.courtHearingRule.create({ data });
        created++;
      }
    } catch (e) {
      console.error(`  Skipped (${countyName} / ${courtName} / ${department}):`, e);
      skipped++;
    }
  }

  console.log(`\nDone: ${created} created, ${updated} updated, ${skipped} skipped`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
