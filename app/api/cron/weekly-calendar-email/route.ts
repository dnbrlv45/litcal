import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendLitCalEmailWithAttachment } from "@/lib/google-mail";
import { getEventDisplayName, formatCsvDate, formatCsvTime } from "@/lib/event-display";
import { buildXlsx, type CalendarDay } from "@/lib/excel";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const HEADERS = ["Event", "Date", "Time", "Case Name", "Attorney"];
const COL_WIDTHS = [36, 14, 12, 32, 24];

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface DayGroup {
  day: string;       // full name, used by the plain-text version
  dayAbbr: string;   // "Mon" — column header in the grid
  dateNum: number;   // day-of-month shown under the column header
  isWeekend: boolean;
  events: { event: string; time: string; caseName: string; attorney: string }[];
}

/** Returns Monday 00:00 UTC and Sunday 23:59:59 UTC of the next calendar week. */
function nextWeekBounds(): { start: Date; end: Date; label: string } {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun
  const daysUntilMonday = day === 0 ? 1 : 8 - day;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + daysUntilMonday);
  monday.setUTCHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  sunday.setUTCHours(23, 59, 59, 999);

  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  return { start: monday, end: sunday, label: `${fmt(monday)} – ${fmt(sunday)}` };
}

function escapeHtml(v: string) {
  return v.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function buildEventChip(e: { event: string; time: string; caseName: string; attorney: string }): string {
  const meta = [e.caseName, e.attorney].filter(Boolean).map(escapeHtml).join(" · ");
  return `<div style="margin:0 0 5px;padding:5px 6px;background:#f0fdfa;border-left:3px solid #0f766e;border-radius:4px;">
    <div style="font-size:10px;font-weight:700;color:#0f766e;line-height:1.3;">${escapeHtml(e.time)}</div>
    <div style="font-size:11px;font-weight:600;color:#1e293b;line-height:1.3;">${escapeHtml(e.event)}</div>
    ${meta ? `<div style="font-size:10px;color:#64748b;line-height:1.3;">${meta}</div>` : ""}
  </div>`;
}

function buildEmailHtml(recipientName: string, weekLabel: string, dayGroups: DayGroup[]): string {
  const hasEvents = dayGroups.some((g) => g.events.length > 0);

  const headerCells = dayGroups
    .map(
      (g) => `<th style="width:14.28%;padding:8px 4px;background:${g.isWeekend ? "#e2e8f0" : "#f1f5f9"};border:1px solid #cbd5e1;text-align:center;">
        <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.3px;">${escapeHtml(g.dayAbbr)}</div>
        <div style="font-size:16px;font-weight:700;color:#0f172a;">${g.dateNum}</div>
      </th>`
    )
    .join("");

  const bodyCells = dayGroups
    .map(
      (g) => `<td style="width:14.28%;padding:6px 5px;border:1px solid #e2e8f0;vertical-align:top;background:${g.isWeekend ? "#fafafa" : "#ffffff"};">
        ${g.events.length > 0 ? g.events.map(buildEventChip).join("") : `<div style="font-size:11px;color:#cbd5e1;text-align:center;padding-top:6px;">—</div>`}
      </td>`
    )
    .join("");

  const grid = `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;table-layout:fixed;border:1px solid #cbd5e1;border-radius:8px;overflow:hidden;">
    <tr>${headerCells}</tr>
    <tr style="height:96px;">${bodyCells}</tr>
  </table>`;

  const safeRecipientName = escapeHtml(recipientName);
  const safeWeekLabel = escapeHtml(weekLabel);

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;">
    <tr><td align="center">
      <table width="720" cellpadding="0" cellspacing="0" style="max-width:720px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:#0f766e;padding:28px 30px;">
            <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">LitCal</p>
            <p style="margin:6px 0 0;font-size:14px;color:#99f6e4;">Weekly Calendar</p>
          </td>
        </tr>

        <!-- Intro -->
        <tr>
          <td style="padding:24px 30px 16px;">
            <p style="margin:0 0 6px;font-size:15px;font-weight:600;color:#0f172a;">Hi ${safeRecipientName},</p>
            <p style="margin:0;font-size:14px;line-height:1.6;color:#475569;">
              Here's your week at a glance for <strong>${safeWeekLabel}</strong>.
              The full schedule is attached as an Excel file.
            </p>
          </td>
        </tr>

        <!-- Week grid -->
        <tr>
          <td style="padding:0 24px 24px;">
            ${
              hasEvents
                ? grid
                : `<p style="margin:0;font-size:14px;color:#64748b;font-style:italic;">No events scheduled for this week.</p>`
            }
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:18px 30px 28px;border-top:1px solid #e2e8f0;">
            <p style="margin:0;font-size:12px;color:#94a3b8;">
              You're receiving this because you're a member of a LitCal workspace. The full Excel schedule is attached.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildEmailText(recipientName: string, weekLabel: string, dayGroups: DayGroup[]): string {
  const lines = [`Hi ${recipientName},`, ``, `Your weekly calendar for ${weekLabel}:`, ``];
  const hasEvents = dayGroups.some((g) => g.events.length > 0);
  if (hasEvents) {
    for (const g of dayGroups.filter((gr) => gr.events.length > 0)) {
      lines.push(`${g.day}`);
      for (const e of g.events) {
        lines.push(`  • ${e.event} — ${e.time}${e.caseName ? ` | ${e.caseName}` : ""}${e.attorney ? ` | ${e.attorney}` : ""}`);
      }
      lines.push(``);
    }
  } else {
    lines.push(`No events scheduled for this week.`);
  }
  lines.push(`The full schedule is attached as an Excel file.`);
  return lines.join("\n");
}

export async function GET(_request: NextRequest) {
  const { start, end, label: weekLabel } = nextWeekBounds();

  const workspaces = await prisma.workspace.findMany({
    include: {
      members: {
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true, timeZone: true } },
        },
      },
    },
  });

  let sent = 0;
  let failed = 0;

  for (const workspace of workspaces) {
    const [events, tasks] = await Promise.all([
      prisma.event.findMany({
        where: {
          workspaceId: workspace.id,
          status: { not: "CANCELLED" },
          startTime: { gte: start, lte: end },
        },
        include: {
          assignedAttorney: { select: { firstName: true, lastName: true } },
          caseRef: { select: { title: true } },
          generatedDeadline: { select: { ruleKey: true } },
        },
        orderBy: { startTime: "asc" },
      }),
      prisma.task.findMany({
        where: {
          workspaceId: workspace.id,
          status: { not: "DONE" },
          dueDate: { gte: start, lte: end },
        },
        include: {
          caseRef: { select: { title: true } },
          assignees: { include: { user: { select: { firstName: true, lastName: true } } } },
        },
        orderBy: { dueDate: "asc" },
      }),
    ]);

    // Normalize events and tasks into a common shape for the calendar
    type CalItem = { date: Date; event: string; time: string; caseName: string; attorney: string };

    const eventItems: CalItem[] = events.map((ev) => ({
      date: ev.startTime,
      event: getEventDisplayName({
        title: ev.title,
        eventType: ev.eventType,
        subtype: ev.subtype,
        subtypeReason: ev.subtypeReason,
        generatedDeadlineRuleKey: ev.generatedDeadline?.ruleKey,
      }),
      time: formatCsvTime(ev.startTime, ev.allDay, "America/Los_Angeles"),
      caseName: ev.caseRef?.title ?? "",
      attorney: ev.assignedAttorney
        ? [ev.assignedAttorney.firstName, ev.assignedAttorney.lastName].filter(Boolean).join(" ")
        : "",
    }));

    const taskItems: CalItem[] = tasks.map((t) => ({
      date: t.dueDate!,
      event: `Task: ${t.title}`,
      time: "Due",
      caseName: t.caseRef?.title ?? "",
      attorney: t.assignees
        .map((a) => [a.user.firstName, a.user.lastName].filter(Boolean).join(" "))
        .join(", "),
    }));

    const allItems = [...eventItems, ...taskItems].sort(
      (a, b) => a.date.getTime() - b.date.getTime()
    );

    // Group by day of week for the email body and calendar tab
    const dayMap = new Map<number, CalItem[]>();
    for (const item of allItems) {
      const dow = new Date(item.date.toLocaleString("en-US", { timeZone: "America/Los_Angeles" })).getDay();
      if (!dayMap.has(dow)) dayMap.set(dow, []);
      dayMap.get(dow)!.push(item);
    }

    // Build ordered day groups (Mon–Sun)
    const dayGroups: DayGroup[] = [1, 2, 3, 4, 5, 6, 0].map((dow, i) => {
      const dayItems = dayMap.get(dow) ?? [];
      const dayDate = new Date(start);
      dayDate.setUTCDate(start.getUTCDate() + i);
      return {
        day: DAY_NAMES[dow],
        dayAbbr: DAY_ABBR[dow],
        dateNum: dayDate.getUTCDate(),
        isWeekend: dow === 0 || dow === 6,
        events: dayItems.map((item) => ({
          event: item.event,
          time: item.time,
          caseName: item.caseName,
          attorney: item.attorney,
        })),
      };
    });

    // Build xlsx with both the events/tasks list and the calendar tab
    const xlsxRows = allItems.map((item) => ({
      Event: item.event,
      Date: formatCsvDate(item.date, "America/Los_Angeles"),
      Time: item.time,
      "Case Name": item.caseName,
      Attorney: item.attorney,
    }));

    const calendarDays: CalendarDay[] = dayGroups.map((g) => ({
      label: `${g.dayAbbr} ${g.dateNum}`,
      events: g.events,
      isWeekend: g.isWeekend,
    }));

    const xlsxBlob = await buildXlsx("Events", HEADERS, xlsxRows, COL_WIDTHS, undefined, calendarDays);
    const xlsxBuffer = Buffer.from(await xlsxBlob.arrayBuffer());
    const s = start.toISOString().slice(0, 10);
    const e = end.toISOString().slice(0, 10);
    const xlsxFilename = `litcal-weekly-calendar-${s}-to-${e}.xlsx`;

    for (const member of workspace.members) {
      const { user } = member;
      if (!user.email) continue;

      const recipientName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
      const subject = `Your Week Ahead: ${weekLabel}`;
      const html = buildEmailHtml(recipientName, weekLabel, dayGroups);
      const text = buildEmailText(recipientName, weekLabel, dayGroups);

      const result = await sendLitCalEmailWithAttachment({
        recipientEmail: user.email,
        subject,
        text,
        html,
        attachment: xlsxBuffer,
        attachmentFilename: xlsxFilename,
        attachmentMimeType: XLSX_MIME,
      });

      if (result.ok) {
        sent++;
      } else {
        failed++;
      }
    }
  }

  return NextResponse.json({ sent, failed });
}
