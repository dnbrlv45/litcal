import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), override: true });

import { COUNTIES_AND_COURTS } from "../lib/counties-courts";
import { prisma } from "../lib/prisma";

async function main() {
  console.log("Seeding counties and courts…");

  for (const entry of COUNTIES_AND_COURTS) {
    const county = await prisma.county.upsert({
      where: { state_name: { state: "CA", name: entry.name } },
      update: {},
      create: { state: "CA", name: entry.name },
    });

    for (const court of entry.courts) {
      await prisma.court.upsert({
        where: { countyId_name: { countyId: county.id, name: court.name } },
        update: {},
        create: { name: court.name, countyId: county.id },
      });
    }
  }

  // Best-effort backfill: match existing case text fields → IDs
  const cases = await prisma.case.findMany({
    where: { countyId: null, county: { not: null } },
    select: { id: true, county: true, court: true },
  });

  let backfilled = 0;
  for (const c of cases) {
    const county = await prisma.county.findFirst({
      where: { name: { equals: c.county!, mode: "insensitive" } },
    });
    if (!county) continue;

    let courtId: string | null = null;
    if (c.court) {
      const court = await prisma.court.findFirst({
        where: {
          countyId: county.id,
          name: { equals: c.court, mode: "insensitive" },
        },
      });
      courtId = court?.id ?? null;
    }

    await prisma.case.update({
      where: { id: c.id },
      data: { countyId: county.id, courtId },
    });
    backfilled++;
  }

  const countyCount = await prisma.county.count();
  const courtCount  = await prisma.court.count();
  console.log(`Done. ${countyCount} counties, ${courtCount} courts. ${backfilled} cases backfilled.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect().catch(() => {}));
