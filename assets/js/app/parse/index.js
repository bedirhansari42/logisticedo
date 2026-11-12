/* Proforma okuma giriş noktası: dosya türüne göre okuyucu seçer, en iyi sonucu döndürür. */
import { extractPdf } from "./extract-pdf.js";
import { extractSheets } from "./extract-sheet.js";
import { extractDocx } from "./extract-docx.js";
import { analyze } from "./analyze.js";

export class ParseError extends Error {
  constructor(key, vars) { super(key); this.key = key; this.vars = vars; }
}

export function fileExt(name) {
  const m = String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

export async function parseProforma(file) {
  const ext = fileExt(file.name);
  const buf = await file.arrayBuffer();

  if (ext === "pdf" || file.type === "application/pdf") {
    const { rows, chars } = await extractPdf(buf);
    if (chars < 25) throw new ParseError("warn.noText");
    const res = analyze(rows);
    res.source = "pdf";
    return res;
  }

  if (["xlsx", "xlsm", "xls", "xlsb", "ods", "csv"].includes(ext)) {
    const sheets = await extractSheets(buf, file.name);
    if (!sheets.length) throw new ParseError("warn.noItems");
    let best = null;
    for (const s of sheets) {
      const res = analyze(s.rows);
      res.sheet = s.name;
      if (!best || res.score > best.score) best = res;
    }
    best.source = "sheet";
    if (sheets.length > 1) best.warnings.unshift({ key: "warn.sheet", vars: { name: best.sheet }, level: "info" });
    return best;
  }

  if (ext === "docx" || ext === "docm") {
    const rows = await extractDocx(buf);
    const res = analyze(rows);
    res.source = "docx";
    return res;
  }

  if (ext === "doc") throw new ParseError("warn.legacy");
  throw new ParseError("warn.unsupported");
}
