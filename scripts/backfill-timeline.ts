/**
 * Backfill CaseTimeline entries from existing data.
 * Synthesizes: case.created, event.created, task.created, task.completed
 * Run with: npx tsx scripts/backfill-timeline.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as never);

async function main() {
  console.log("Starting timeline backfill...");

  const cases = await prisma.case.findMany({
    where: { workspaceId: { not: null } },
    select: {
      id: true,
      title: true,
      workspaceId: true,
      userId: true,
      createdAt: true,
      events: { select: { id: true, title: true, eventType: true, caseId: true, createdAt: true, workspaceId: true } },
      tasks:  { select: { id: true, title: true, caseId: true, createdAt: true, completedAt: true, workspaceId: true, status: true } },
    },
  });

  console.log(`Found ${cases.length} cases to backfill.`);

  let total = 0;

  for (const c of cases) {
    if (!c.workspaceId) continue;
    const wid = c.workspaceId;

    const entries: {
      id: string;
      caseId: string;
      workspaceId: string;
      actorUserId: string | null;
      type: string;
      title: string;
      description: string | null;
      metadata: object | null;
      createdAt: Date;
    }[] = [];

    const makeId = () => `ctl_${Math.random().toString(36).slice(2, 12)}`;

    // case.created
    entries.push({
      id: makeId(),
      caseId: c.id,
      workspaceId: wid,
      actorUserId: c.userId,
      type: "case.created",
      title: "Case created",
      description: "(backfilled)",
      metadata: null,
      createdAt: c.createdAt,
    });

    // event.created — one per event
    for (const ev of c.events) {
      entries.push({
        id: makeId(),
        caseId: c.id,
        workspaceId: wid,
        actorUserId: null,
        type: "event.created",
        title: `Event added: ${ev.title}`,
        description: "(backfilled)",
        metadata: { eventId: ev.id, eventType: ev.eventType },
        createdAt: ev.createdAt,
      });
    }

    // task.created + task.completed
    for (const task of c.tasks) {
      entries.push({
        id: makeId(),
        caseId: c.id,
        workspaceId: wid,
        actorUserId: null,
        type: "task.created",
        title: `Task created: ${task.title}`,
        description: "(backfilled)",
        metadata: { taskId: task.id },
        createdAt: task.createdAt,
      });

      if (task.completedAt) {
        entries.push({
          id: makeId(),
          caseId: c.id,
          workspaceId: wid,
          actorUserId: null,
          type: "task.completed",
          title: `Task completed: ${task.title}`,
          description: "(backfilled)",
          metadata: { taskId: task.id },
          createdAt: task.completedAt,
        });
      }
    }

    if (entries.length > 0) {
      await prisma.caseTimeline.createMany({ data: entries as never[], skipDuplicates: false });
      total += entries.length;
    }
  }

  console.log(`Done. Created ${total} timeline entries across ${cases.length} cases.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
