import ExcelJS from "exceljs";

const HEADER_BG   = "0F766E"; // teal-700
const HEADER_FG   = "FFFFFF";
const ALT_ROW_BG  = "F0FDFA"; // teal-50
const WEEKEND_BG  = "F1F5F9"; // slate-100
const LIGHT_BORDER: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "CBD5E1" } };
const THIN_BORDER: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FF000000" } };

export interface CalendarDay {
  label: string; // e.g. "Mon 6/23"
  events: { event: string; time: string; caseName: string; attorney: string }[];
  isWeekend: boolean;
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
  rows: Record<string, string | null | undefined>[],
  colWidths?: number[],
  rowBgColor?: (row: Record<string, string | null | undefined>, index: number) => string | null,
  calendarDays?: CalendarDay[],
): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "LitCal";
  wb.created = new Date();

  // ── Calendar tab (first so it's the default when opened) ──────────────────
  if (calendarDays && calendarDays.length > 0) {
    const cal = wb.addWorksheet("Calendar", {
      properties: { defaultColWidth: 20 },
    });

    cal.columns = calendarDays.map((d) => ({ width: 20, key: d.label }));

    // Header row with day labels
    const hRow = cal.getRow(1);
    hRow.height = 28;
    calendarDays.forEach((d, ci) => {
      const cell = hRow.getCell(ci + 1);
      cell.value = d.label;
      cell.font = { bold: true, color: { argb: HEADER_FG }, size: 12, name: "Calibri" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.border = { top: LIGHT_BORDER, left: LIGHT_BORDER, bottom: LIGHT_BORDER, right: LIGHT_BORDER };
    });

    // Find the max number of events in any single day to size the grid
    const maxEvents = Math.max(1, ...calendarDays.map((d) => d.events.length));

    for (let slot = 0; slot < maxEvents; slot++) {
      const row = cal.getRow(slot + 2);
      row.height = 48;
      calendarDays.forEach((d, ci) => {
        const cell = row.getCell(ci + 1);
        const ev = d.events[slot];
        if (ev) {
          const parts = [ev.time, ev.event, ev.caseName, ev.attorney].filter(Boolean);
          cell.value = parts.join("\n");
          cell.font = { size: 10, name: "Calibri" };
        } else {
          cell.value = "";
        }
        cell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
        cell.border = { top: LIGHT_BORDER, left: LIGHT_BORDER, bottom: LIGHT_BORDER, right: LIGHT_BORDER };
        if (d.isWeekend) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WEEKEND_BG } };
        }
      });
    }
  }

  // ── Events list tab ───────────────────────────────────────────────────────
  const ws = wb.addWorksheet(sheetName, {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  ws.columns = headers.map((h, i) => ({
    header: h,
    key: h,
    width: colWidths?.[i] ?? Math.max(h.length + 4, 14),
  }));

  const headerRow = ws.getRow(1);
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: HEADER_FG }, size: 11, name: "Calibri" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
    cell.alignment = { vertical: "middle", horizontal: "left" };
  });

  rows.forEach((rowData, index) => {
    const row = ws.addRow(headers.map((h) => rowData[h] ?? ""));
    row.height = 18;
    const customBg = rowBgColor?.(rowData, index);
    const isAlt = index % 2 === 1;
    row.eachCell((cell) => {
      cell.font = { size: 11, name: "Calibri" };
      cell.alignment = { vertical: "middle", horizontal: "left" };
      const bg = customBg ?? (isAlt ? ALT_ROW_BG : null);
      if (bg) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
      }
      cell.border = { top: THIN_BORDER, left: THIN_BORDER, bottom: THIN_BORDER, right: THIN_BORDER };
    });
  });

  if (!colWidths) {
    ws.columns.forEach((col) => {
      if (!col.key) return;
      let maxLen = (col.header as string)?.length ?? 10;
      rows.forEach((r) => {
        const val = r[col.key as string] ?? "";
        if (val.length > maxLen) maxLen = val.length;
      });
      col.width = Math.min(maxLen + 4, 50);
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
