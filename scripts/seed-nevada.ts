/**
 * Seeds Nevada counties and their District Courts.
 * Run with: npx tsx scripts/seed-nevada.ts
 *
 * This does NOT add CourtHearingRules — import those separately via CSV
 * once you have remote appearance info for NV courts.
 */

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), override: true });

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter } as never);

const NV_COUNTIES = [
  "Carson City",
  "Churchill County",
  "Clark County",
  "Douglas County",
  "Elko County",
  "Esmeralda County",
  "Eureka County",
  "Humboldt County",
  "Lander County",
  "Lincoln County",
  "Lyon County",
  "Mineral County",
  "Nye County",
  "Pershing County",
  "Storey County",
  "Washoe County",
  "White Pine County",
];

async function main() {
  let countiesCreated = 0;
  let courtsCreated = 0;

  for (const countyName of NV_COUNTIES) {
    const county = await prisma.county.upsert({
      where: { state_name: { state: "NV", name: countyName } },
      create: { state: "NV", name: countyName },
      update: {},
    });

    const courtName = "District Court";
    const existing = await prisma.court.findUnique({
      where: { countyId_name: { countyId: county.id, name: courtName } },
    });

    if (!existing) {
      await prisma.court.create({ data: { countyId: county.id, name: courtName } });
      courtsCreated++;
    }

    countiesCreated++;
  }

  console.log(`Done. ${NV_COUNTIES.length} counties upserted, ${courtsCreated} courts created.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
