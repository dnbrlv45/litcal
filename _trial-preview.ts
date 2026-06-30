import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const TWO_DAYS = 2 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

async function main() {
  const trials = await prisma.event.findMany({
    where: { eventType: "TRIAL" },
    select: { id: true, title: true, startTime: true, endTime: true, allDay: true,
      caseRef: { select: { title: true, caseNumber: true } } },
    orderBy: { startTime: "asc" },
  });

  let needUpdate = 0;
  for (const t of trials) {
    const span = t.endTime.getTime() - t.startTime.getTime();
    const willUpdate = span < TWO_DAYS;
    if (willUpdate) needUpdate++;
    const days = (span / (24 * 60 * 60 * 1000)).toFixed(1);
    console.log(
      `${willUpdate ? "UPDATE" : "skip  "} | ${t.startTime.toISOString().slice(0,10)} | span=${days}d allDay=${t.allDay} | ${t.caseRef?.title ?? "(no case)"} | ${t.title}`
    );
  }
  console.log(`\nTotal trials: ${trials.length}. Will update (span < 2d): ${needUpdate}.`);
  await prisma.$disconnect();
}
main();
