import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendLitCalEmailWithAttachment } from "@/lib/google-mail";
import { getEventDisplayName, formatCsvDate, formatCsvTime } from "@/lib/event-display";
import { buildXlsx } from "@/lib/excel";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const HEADERS = ["Event", "Date", "Time", "Case Name", "Attorney"];
const COL_WIDTHS = [36, 14, 12, 32, 24];

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

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

function buildEmailHtml(recipientName: string, weekLabel: string, dayGroups: { day: string; events: { event: string; time: string; caseName: string; attorney: string }[] }[]): string {
  const hasEvents = dayGroups.some((g) => g.events.length > 0);

  const tableRows = dayGroups
    .filter((g) => g.events.length > 0)
    .map((g) => {
      const eventRows = g.events
        .map(
          (e, i) => `
          <tr style="background:${i % 2 === 0 ? "#ffffff" : "#f0fdfa"};">
            ${i === 0 ? `<td rowspan="${g.events.length}" style="padding:10px 14px;font-size:13px;font-weight:700;color:#0f766e;vertical-align:top;white-space:nowrap;border-top:2px solid #0f766e;">${escapeHtml(g.day)}</td>` : ""}
            <td style="padding:8px 14px;font-size:13px;color:#1e293b;border-top:1px solid #e2e8f0;">${escapeHtml(e.event)}</td>
            <td style="padding:8px 14px;font-size:13px;color:#475569;border-top:1px solid #e2e8f0;white-space:nowrap;">${escapeHtml(e.time)}</td>
            <td style="padding:8px 14px;font-size:13px;color:#475569;border-top:1px solid #e2e8f0;">${escapeHtml(e.caseName)}</td>
            <td style="padding:8px 14px;font-size:13px;color:#475569;border-top:1px solid #e2e8f0;">${escapeHtml(e.attorney)}</td>
          </tr>`
        )
        .join("");
      return eventRows;
    })
    .join("");

  const safeRecipientName = escapeHtml(recipientName);
  const safeWeekLabel = escapeHtml(weekLabel);

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

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
              Here's your weekly calendar for <strong>${safeWeekLabel}</strong>.
              The full schedule is attached as an Excel file.
            </p>
          </td>
        </tr>

        <!-- Calendar table -->
        <tr>
          <td style="padding:0 30px 24px;">
            ${
              hasEvents
                ? `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">
                <tr style="background:#f1f5f9;">
                  <th style="padding:10px 14px;font-size:12px;font-weight:600;color:#64748b;text-align:left;border-bottom:1px solid #e2e8f0;">Day</th>
                  <th style="padding:10px 14px;font-size:12px;font-weight:600;color:#64748b;text-align:left;border-bottom:1px solid #e2e8f0;">Event</th>
                  <th style="padding:10px 14px;font-size:12px;font-weight:600;color:#64748b;text-align:left;border-bottom:1px solid #e2e8f0;">Time</th>
                  <th style="padding:10px 14px;font-size:12px;font-weight:600;color:#64748b;text-align:left;border-bottom:1px solid #e2e8f0;">Case</th>
                  <th style="padding:10px 14px;font-size:12px;font-weight:600;color:#64748b;text-align:left;border-bottom:1px solid #e2e8f0;">Attorney</th>
                </tr>
                ${tableRows}
              </table>`
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

function buildEmailText(recipientName: string, weekLabel: string, dayGroups: { day: string; events: { event: string; time: string; caseName: string; attorney: string }[] }[]): string {
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
    const events = await prisma.event.findMany({
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
    });

    // Build xlsx once per workspace (use UTC for the file)
    const xlsxRows = events.map((ev) => ({
      Event: getEventDisplayName({
        title: ev.title,
        eventType: ev.eventType,
        subtype: ev.subtype,
        subtypeReason: ev.subtypeReason,
        generatedDeadlineRuleKey: ev.generatedDeadline?.ruleKey,
      }),
      Date: formatCsvDate(ev.startTime, "America/Los_Angeles"),
      Time: formatCsvTime(ev.startTime, ev.allDay, "America/Los_Angeles"),
      "Case Name": ev.caseRef?.title ?? "",
      Attorney: ev.assignedAttorney
        ? [ev.assignedAttorney.firstName, ev.assignedAttorney.lastName].filter(Boolean).join(" ")
        : "",
    }));

    const xlsxBlob = await buildXlsx("Weekly Calendar", HEADERS, xlsxRows, COL_WIDTHS);
    const xlsxBuffer = Buffer.from(await xlsxBlob.arrayBuffer());
    const s = start.toISOString().slice(0, 10);
    const e = end.toISOString().slice(0, 10);
    const xlsxFilename = `litcal-weekly-calendar-${s}-to-${e}.xlsx`;

    // Group events by day of week for the email body
    const dayMap = new Map<number, typeof events>();
    for (const ev of events) {
      const dow = new Date(ev.startTime.toLocaleString("en-US", { timeZone: "America/Los_Angeles" })).getDay();
      if (!dayMap.has(dow)) dayMap.set(dow, []);
      dayMap.get(dow)!.push(ev);
    }

    // Build ordered day groups (Mon–Sun)
    const dayGroups = [1, 2, 3, 4, 5, 6, 0].map((dow) => {
      const dayEvents = dayMap.get(dow) ?? [];
      return {
        day: DAY_NAMES[dow],
        events: dayEvents.map((ev) => ({
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
        })),
      };
    });

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
