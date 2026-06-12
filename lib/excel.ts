import ExcelJS from "exceljs";

const HEADER_BG   = "0F766E"; // teal-700
const HEADER_FG   = "FFFFFF";
const ALT_ROW_BG  = "F0FDFA"; // teal-50
const BORDER_COLOR = "E2E8F0"; // slate-200

/**
 * Build a styled .xlsx workbook buffer.
 * @param sheetName  Name shown on the worksheet tab.
 * @param headers    Ordered column header strings.
 * @param rows       Data rows — each value keyed by header string.
 * @param colWidths  Optional per-column widths (characters). Falls back to auto.
 */
export async function buildXlsx(
  sheetName: string,
  headers: string[],
  rows: Record<string, string | null | undefined>[],
  colWidths?: number[],
  rowBgColor?: (row: Record<string, string | null | undefined>, index: number) => string | null
): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "LitCal";
  wb.created = new Date();

  const ws = wb.addWorksheet(sheetName, {
    views: [{ state: "frozen", ySplit: 1 }], // freeze header row
  });

  // ── Columns ────────────────────────────────────────────────────────────────
  ws.columns = headers.map((h, i) => ({
    header: h,
    key: h,
    width: colWidths?.[i] ?? Math.max(h.length + 4, 14),
  }));

  // ── Header row styling ─────────────────────────────────────────────────────
  const headerRow = ws.getRow(1);
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: HEADER_FG }, size: 11, name: "Calibri" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
    cell.alignment = { vertical: "middle", horizontal: "left" };
    cell.border = {
      bottom: { style: "thin", color: { argb: BORDER_COLOR } },
    };
  });

  // ── Data rows ──────────────────────────────────────────────────────────────
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
      cell.border = {
        bottom: { style: "thin", color: { argb: BORDER_COLOR } },
      };
    });
  });

  // ── Auto-fit column widths if not specified ────────────────────────────────
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
