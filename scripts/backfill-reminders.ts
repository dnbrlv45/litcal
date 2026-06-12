/**
 * Backfill EventReminder rows to match the updated reminder schedules.
 *
 * For every event that has at least one unsent future reminder, this script
 * calls replaceEventReminders() to delete+recreate them under the new config.
 * Already-sent reminders (sent=true) are never touched.
 *
 * Run with: npx tsx scripts/backfill-reminders.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import pg from "pg";
import { replaceEventReminders } from "../lib/reminders";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const now = new Date();

  // Find all events that have at least one unsent future reminder.
  const events = await prisma.event.findMany({
    where: {
      reminders: {
        some: { sent: false, sendAt: { gt: now } },
      },
    },
    select: {
      id: true,
      startTime: true,
      eventType: true,
    },
  });

  console.log(`Found ${events.length} events with unsent future reminders.`);

  let updated = 0;
  let skipped = 0;

  for (const event of events) {
    try {
      await replaceEventReminders(prisma, event.id, event.startTime, event.eventType);
      updated++;
    } catch (err) {
      console.error(`Failed for event ${event.id}:`, err);
      skipped++;
    }
  }

  console.log(`Done. Updated: ${updated}, Skipped/failed: ${skipped}`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
