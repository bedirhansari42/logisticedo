/* Excel / CSV → satırlar. Hücre konumu sütun indeksidir; birleştirilmiş hücreler genişliğiyle gelir.
   Hücre: { text, x0, x1, num, date } — num, Excel'in kendi sayısıdır (biçim belirsizliği yok). */
import { loadSheetJS } from "../loader.js";

const MAX_ROWS = 1500;
const MAX_COLS = 60;

export async function extractSheets(buffer, fileName = "") {
  const XLSX = await loadSheetJS();
  const isCsv = /\.csv$/i.test(fileName);
  let wb;
  if (isCsv) {
    let text = new TextDecoder("utf-8").decode(new Uint8Array(buffer));
    if (text.includes("�")) text = new TextDecoder("windows-1254").decode(new Uint8Array(buffer));
    wb = XLSX.read(text, { type: "string", cellDates: true, UTC: true, raw: false });
  } else {
    wb = XLSX.read(new Uint8Array(buffer), { type: "array", cellDates: true, UTC: true, cellNF: false, cellStyles: false });
  }
  const meta = wb.Workbook?.Sheets || [];
  const sheets = [];
  wb.SheetNames.forEach((name, i) => {
    if (meta[i]?.Hidden) return;
    const rows = sheetRows(XLSX, wb.Sheets[name], name);
    if (rows.length) sheets.push({ name, rows });
  });
  return sheets;
}

function sheetRows(XLSX, ws, name) {
  if (!ws || !ws["!ref"]) return [];
  const range = XLSX.utils.decode_range(ws["!ref"]);
  const merges = ws["!merges"] || [];
  const span = new Map();
  const covered = new Set();
  for (const m of merges) {
    span.set(`${m.s.r},${m.s.c}`, m.e.c - m.s.c + 1);
    for (let r = m.s.r; r <= m.e.r; r++) {
      for (let c = m.s.c; c <= m.e.c; c++) {
        if (r !== m.s.r || c !== m.s.c) covered.add(`${r},${c}`);
      }
    }
  }
  const rows = [];
  const lastR = Math.min(range.e.r, range.s.r + MAX_ROWS);
  const lastC = Math.min(range.e.c, range.s.c + MAX_COLS);
  for (let r = range.s.r; r <= lastR; r++) {
    const cells = [];
    for (let c = range.s.c; c <= lastC; c++) {
      const key = `${r},${c}`;
      if (covered.has(key)) continue;
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (!cell || cell.v == null || cell.v === "") continue;
      let text;
      let num = null, date = null;
      if (cell.t === "n") {
        num = cell.v;
        text = cell.w != null ? String(cell.w) : String(cell.v);
      } else if (cell.t === "d") {
        date = cell.v;
        text = cell.w != null ? String(cell.w) : cell.v.toISOString().slice(0, 10);
      } else if (cell.t === "b") {
        continue;
      } else {
        text = String(cell.w ?? cell.v);
      }
      text = text.replace(/\r\n?/g, "\n").trim();
      if (!text) continue;
      cells.push({ text, x0: c, x1: c + (span.get(key) || 1), num, date });
    }
    rows.push({ kind: "grid", group: "sheet:" + name, page: 0, y: r, h: 1, cells });
  }
  // Baştaki/sondaki tamamen boş satırları at, aradakileri (tablo boşluklarını anlamak için) koru
  while (rows.length && !rows[0].cells.length) rows.shift();
  while (rows.length && !rows[rows.length - 1].cells.length) rows.pop();
  return rows;
}
