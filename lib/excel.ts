import ExcelJS from "exceljs";

const HEADER_BG   = "0F766E"; // teal-700
const HEADER_FG   = "FFFFFF";
const ALT_ROW_BG  = "F0FDFA"; // teal-50
const WEEKEND_BG  = "F1F5F9"; // slate-100
const TITLE_BG    = "0F172A"; // slate-900
const TITLE_SUB   = "CCFBF1"; // teal-100
const EVENT_BG    = "FFFFFF";
const EMPTY_BG    = "F8FAFC"; // slate-50
const TEXT_DARK   = "0F172A";
const TEXT_MUTED  = "64748B";
const LIGHT_BORDER: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "CBD5E1" } };
const CALENDAR_COLUMNS = 7;

function getInitialOverride(fullName: string): string | null {
  const normalized = fullName.trim().toLowerCase();
  if (/\bjacob\b/.test(normalized)) return "JR";
  if (/\bsayan\b/.test(normalized)) return "SA";
  return null;
}

/** "Dylan Barlava" -> "DB". Handles single names, extra whitespace, and multiple names. */
function getInitials(fullName: string): string {
  if (fullName.includes(",")) {
    return fullName.split(",").map((name) => getInitials(name)).filter(Boolean).join(", ");
  }
  const override = getInitialOverride(fullName);
  if (override) return override;
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export interface CalendarDay {
  label: string; // e.g. "Mon 6/23"
  events: { event: string; time: string; caseName: string; attorney: string }[];
  isWeekend: boolean;
}

type XlsxRow = Record<string, string | null | undefined>;

interface XlsxListSheet {
  name: string;
  headers: string[];
  rows: XlsxRow[];
  colWidths?: number[];
  rowBgColor?: (row: XlsxRow, index: number) => string | null;
  rowHeight?: number;
  wrapText?: boolean;
}

/**
 * Build a styled .xlsx workbook buffer.
 * @param sheetName  Name shown on the first (list) worksheet tab.
 * @param headers    Ordered column header strings.
 * @param rows       Data rows — each value keyed by header string.
 * @param colWidths  Optional per-column widths (characters). Falls back to auto.
 * @param calendarDays  Optional 7-element array of days — when provided a
 *                      second "Calendar" tab is added with a week-grid layout.
 */
export async function buildXlsx(
  sheetName: string,
  headers: string[],
  rows: XlsxRow[],
  colWidths?: number[],
  rowBgColor?: (row: XlsxRow, index: number) => string | null,
  calendarDays?: CalendarDay[],
): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "LitCal";
  wb.created = new Date();

  // ── Calendar tab (first so it's the default when opened) ──────────────────
  if (calendarDays && calendarDays.length > 0) {
    const cal = wb.addWorksheet("Calendar", {
      properties: {
        defaultColWidth: 23,
        defaultRowHeight: 20,
        tabColor: { argb: HEADER_BG },
      },
      pageSetup: {
        orientation: "landscape",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: {
          left: 0.25,
          right: 0.25,
          top: 0.35,
          bottom: 0.35,
          header: 0.15,
          footer: 0.15,
        },
      },
      views: [{ state: "frozen", ySplit: 3, showGridLines: false }],
    });

    cal.columns = calendarDays.map((d) => ({ width: 23, key: d.label }));

    cal.mergeCells(1, 1, 1, CALENDAR_COLUMNS);
    const titleCell = cal.getCell(1, 1);
    titleCell.value = "LitCal Weekly Calendar";
    titleCell.font = { bold: true, color: { argb: HEADER_FG }, size: 18, name: "Calibri" };
    titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TITLE_BG } };
    titleCell.alignment = { vertical: "middle", horizontal: "left" };
    titleCell.border = { top: LIGHT_BORDER, left: LIGHT_BORDER, bottom: LIGHT_BORDER, right: LIGHT_BORDER };
    cal.getRow(1).height = 34;

    cal.mergeCells(2, 1, 2, CALENDAR_COLUMNS);
    const summaryCell = cal.getCell(2, 1);
    const totalEvents = calendarDays.reduce((sum, d) => sum + d.events.length, 0);
    summaryCell.value = `${totalEvents} scheduled ${totalEvents === 1 ? "item" : "items"} across the week`;
    summaryCell.font = { bold: true, color: { argb: TITLE_BG }, size: 10, name: "Calibri" };
    summaryCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TITLE_SUB } };
    summaryCell.alignment = { vertical: "middle", horizontal: "left" };
    summaryCell.border = { top: LIGHT_BORDER, left: LIGHT_BORDER, bottom: LIGHT_BORDER, right: LIGHT_BORDER };
    cal.getRow(2).height = 22;

    // Header row with day labels and per-day counts.
    const hRow = cal.getRow(3);
    hRow.height = 34;
    calendarDays.forEach((d, ci) => {
      const cell = hRow.getCell(ci + 1);
      const countLabel = d.events.length === 1 ? "1 item" : `${d.events.length} items`;
      cell.value = {
        richText: [
          { text: `${d.label}\n`, font: { bold: true, color: { argb: HEADER_FG }, size: 12, name: "Calibri" } },
          { text: countLabel, font: { bold: false, color: { argb: "D1FAE5" }, size: 9, name: "Calibri" } },
        ],
      };
      cell.font = { bold: true, color: { argb: HEADER_FG }, size: 12, name: "Calibri" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: d.isWeekend ? "334155" : HEADER_BG } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.border = { top: LIGHT_BORDER, left: LIGHT_BORDER, bottom: LIGHT_BORDER, right: LIGHT_BORDER };
    });

    const maxEvents = Math.max(1, ...calendarDays.map((d) => d.events.length));

    for (let eventIndex = 0; eventIndex < maxEvents; eventIndex++) {
      const row = cal.getRow(eventIndex + 4);
      row.height = 66;

      calendarDays.forEach((d, ci) => {
        const cell = row.getCell(ci + 1);
        const ev = d.events[eventIndex];

        if (ev) {
          const meta = [ev.caseName, ev.attorney].filter(Boolean).join(" | ");
          const initials = getInitials(ev.attorney);
          const richParts: ExcelJS.RichText[] = [
            {
              text: `${ev.time || "All day"}`,
              font: { bold: true, size: 9, name: "Calibri", color: { argb: HEADER_BG } },
            },
            ...(initials
              ? [{
                  text: `  [${initials}]\n`,
                  font: { bold: true, size: 9, name: "Calibri", color: { argb: TITLE_BG } },
                } satisfies ExcelJS.RichText]
              : [{ text: "\n", font: { size: 9, name: "Calibri" } } satisfies ExcelJS.RichText]),
            {
              text: `${ev.event}\n`,
              font: { bold: true, size: 10, name: "Calibri", color: { argb: TEXT_DARK } },
            },
          ];
          if (meta) {
            richParts.push({ text: meta, font: { size: 9, name: "Calibri", color: { argb: TEXT_MUTED } } });
          }

          cell.value = { richText: richParts };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: d.isWeekend ? WEEKEND_BG : EVENT_BG } };
        } else if (eventIndex === 0) {
          cell.value = "No scheduled items";
          cell.font = { italic: true, size: 10, name: "Calibri", color: { argb: TEXT_MUTED } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: d.isWeekend ? WEEKEND_BG : EMPTY_BG } };
        } else {
          cell.value = "";
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: d.isWeekend ? WEEKEND_BG : EMPTY_BG } };
        }

        cell.alignment = { vertical: "top", horizontal: "left", wrapText: true, indent: 1 };
        cell.border = { top: LIGHT_BORDER, left: LIGHT_BORDER, bottom: LIGHT_BORDER, right: LIGHT_BORDER };
      });
    }
  }

  addListSheet(wb, {
    name: sheetName,
    headers,
    rows,
    colWidths,
    rowBgColor,
  });

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export async function buildXlsxWorkbook(sheets: XlsxListSheet[]): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "LitCal";
  wb.created = new Date();

  sheets.forEach((sheet) => addListSheet(wb, sheet));

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function addListSheet(wb: ExcelJS.Workbook, sheet: XlsxListSheet) {
  const ws = wb.addWorksheet(sheet.name, {
    properties: { tabColor: { argb: TITLE_BG } },
    views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.25,
        right: 0.25,
        top: 0.35,
        bottom: 0.35,
        header: 0.15,
        footer: 0.15,
      },
    },
  });

  ws.columns = sheet.headers.map((h, i) => ({
    header: h,
    key: h,
    width: sheet.colWidths?.[i] ?? Math.max(h.length + 4, 14),
  }));

  const headerRow = ws.getRow(1);
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: HEADER_FG }, size: 11, name: "Calibri" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
    cell.alignment = { vertical: "middle", horizontal: "left" };
    cell.border = { top: LIGHT_BORDER, left: LIGHT_BORDER, bottom: LIGHT_BORDER, right: LIGHT_BORDER };
  });
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.headers.length },
  };

  const wrapText = sheet.wrapText ?? true;
  const baseRowHeight = sheet.rowHeight ?? 18;

  sheet.rows.forEach((rowData, index) => {
    const values = sheet.headers.map((h) => rowData[h] ?? "");
    const row = ws.addRow(values);

    if (wrapText) {
      let maxLines = 1;
      values.forEach((val, colIdx) => {
        const colWidth = sheet.colWidths?.[colIdx] ?? Math.max(sheet.headers[colIdx].length + 4, 14);
        const charWidth = colWidth - 2;
        const text = String(val);
        const lines = text.split("\n").reduce((sum, line) => {
          return sum + Math.max(1, Math.ceil(line.length / Math.max(charWidth, 1)));
        }, 0);
        if (lines > maxLines) maxLines = lines;
      });
      row.height = Math.max(baseRowHeight, maxLines * 15);
    } else {
      row.height = baseRowHeight;
    }

    const customBg = sheet.rowBgColor?.(rowData, index);
    const isAlt = index % 2 === 1;
    row.eachCell((cell) => {
      cell.font = { size: 11, name: "Calibri" };
      cell.alignment = { vertical: "middle", horizontal: "left", wrapText };
      const bg = customBg ?? (isAlt ? ALT_ROW_BG : null);
      if (bg) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
      }
      cell.border = { top: LIGHT_BORDER, left: LIGHT_BORDER, bottom: LIGHT_BORDER, right: LIGHT_BORDER };
    });
  });

  if (!sheet.colWidths) {
    ws.columns.forEach((col) => {
      if (!col.key) return;
      let maxLen = (col.header as string)?.length ?? 10;
      sheet.rows.forEach((r) => {
        const val = r[col.key as string] ?? "";
        if (val.length > maxLen) maxLen = val.length;
      });
      col.width = Math.min(maxLen + 4, 50);
    });
  }
}
