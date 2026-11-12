/* Excel antetini A4 sayfa görüntüsüne çizer: sütun genişlikleri, satır yükseklikleri, birleştirilmiş hücreler,
   yazı tipleri, dolgular, kenarlıklar ve görseller (logo). Sayfa üst/alt bilgisi metinleri de yazılır. */
import { loadExcelJS } from "./loader.js";

const EMU_PX = 9525;
const DPR = 2.6;
const PAGES = { 9: [794, 1123], 1: [816, 1056] }; // A4, Letter (96 dpi px)

const INDEXED = ["000000", "FFFFFF", "FF0000", "00FF00", "0000FF", "FFFF00", "FF00FF", "00FFFF", "000000", "FFFFFF", "FF0000", "00FF00", "0000FF", "FFFF00", "FF00FF", "00FFFF", "800000", "008000", "000080", "808000", "800080", "008080", "C0C0C0", "808080", "9999FF", "993366", "FFFFCC", "CCFFFF", "660066", "FF8080", "0066CC", "CCCCFF", "000080", "FF00FF", "FFFF00", "00FFFF", "800080", "800000", "008080", "0000FF", "00CCFF", "CCFFFF", "CCFFCC", "FFFF99", "99CCFF", "FF99CC", "CC99FF", "FFCC99", "3366FF", "33CCCC", "99CC00", "FFCC00", "FF9900", "FF6600", "666699", "969696", "003366", "339966", "003300", "333300", "993300", "993366", "333399", "333333"];
const DEFAULT_THEME = ["FFFFFF", "000000", "E7E6E6", "44546A", "4472C4", "ED7D31", "A5A5A5", "FFC000", "5B9BD5", "70AD47"];

function readTheme(wb) {
  const xml = wb._themes && (wb._themes.theme1 || Object.values(wb._themes)[0]);
  if (!xml) return DEFAULT_THEME;
  try {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const scheme = doc.getElementsByTagNameNS("*", "clrScheme")[0];
    if (!scheme) return DEFAULT_THEME;
    const get = (name) => {
      const el = scheme.getElementsByTagNameNS("*", name)[0];
      if (!el) return null;
      const srgb = el.getElementsByTagNameNS("*", "srgbClr")[0];
      if (srgb) return srgb.getAttribute("val");
      const sys = el.getElementsByTagNameNS("*", "sysClr")[0];
      return sys ? sys.getAttribute("lastClr") : null;
    };
    const order = ["lt1", "dk1", "lt2", "dk2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6"];
    return order.map((n, i) => get(n) || DEFAULT_THEME[i]);
  } catch {
    return DEFAULT_THEME;
  }
}

function tint(hex, t) {
  if (!t) return hex;
  const c = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const out = c.map((v) => Math.round(t < 0 ? v * (1 + t) : v + (255 - v) * t));
  return out.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");
}

function color(c, theme, fallback = null) {
  if (!c) return fallback;
  if (c.argb) { const a = c.argb.length === 8 ? c.argb.slice(2) : c.argb; return "#" + a; }
  if (c.theme != null) return "#" + tint(theme[c.theme] || "000000", c.tint || 0);
  if (c.indexed != null) { if (c.indexed === 64) return fallback || "#000000"; return "#" + (INDEXED[c.indexed] || "000000"); }
  return fallback;
}

export async function renderXlsxToCanvas(buf) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets.find((w) => !w.state || w.state === "visible") || wb.worksheets[0];
  if (!ws) throw new Error("Çalışma sayfası yok");
  const theme = readTheme(wb);
  const notes = [];

  /* Kullanılan alan */
  let maxR = 0, maxC = 0;
  // includeEmpty: yalnızca kenarlık/dolgu taşıyan (değersiz) satırlar da çizilmeli
  ws.eachRow({ includeEmpty: true }, (row, r) => {
    if (r > 400) return;
    row.eachCell({ includeEmpty: true }, (cell, c) => {
      const hasInk = (cell.value != null && cell.value !== "") || (cell.fill && cell.fill.pattern && cell.fill.pattern !== "none") || (cell.border && Object.keys(cell.border).length);
      if (hasInk) { maxR = Math.max(maxR, r); maxC = Math.max(maxC, c); }
    });
  });
  const images = ws.getImages ? ws.getImages() : [];
  for (const img of images) {
    const end = img.range.br || img.range.tl;
    maxR = Math.max(maxR, Math.ceil((end.nativeRow ?? 0) + 1));
    maxC = Math.max(maxC, Math.ceil((end.nativeCol ?? 0) + 1));
  }
  const pa = parsePrintArea(ws.pageSetup?.printArea);
  if (pa) { maxR = Math.max(maxR, pa.bottom); maxC = Math.max(maxC, pa.right); }
  maxR = Math.min(Math.max(maxR, 1), 400);
  maxC = Math.min(Math.max(maxC, 1), 60);

  /* Ölçüler (96 dpi piksel) */
  const defW = ws.properties?.defaultColWidth || 8.43;
  const defH = ws.properties?.defaultRowHeight || 15;
  const colX = [0];
  for (let c = 1; c <= maxC + 1; c++) {
    const col = ws.getColumn(c);
    const w = col.hidden ? 0 : Math.round((col.width || defW) * 7 + 5);
    colX[c] = colX[c - 1] + w;
  }
  const rowY = [0];
  for (let r = 1; r <= maxR + 1; r++) {
    const row = ws.getRow(r);
    const h = row.hidden ? 0 : ((row.height || defH) * 96) / 72;
    rowY[r] = rowY[r - 1] + h;
  }
  const xOf = (col0, offEmu = 0) => (colX[Math.min(col0, colX.length - 1)] || 0) + offEmu / EMU_PX;
  const yOf = (row0, offEmu = 0) => (rowY[Math.min(row0, rowY.length - 1)] || 0) + offEmu / EMU_PX;

  /* Sayfa */
  const ps = ws.pageSetup || {};
  let [pw, ph] = PAGES[ps.paperSize] || PAGES[9];
  if (ps.orientation === "landscape") [pw, ph] = [ph, pw];
  const mg = ps.margins || {};
  const ml = (mg.left ?? 0.7) * 96, mr = (mg.right ?? 0.7) * 96, mt = (mg.top ?? 0.75) * 96, mb = (mg.bottom ?? 0.75) * 96;
  const printableW = pw - ml - mr;
  const sheetW = colX[maxC];
  let scale = ps.scale && ps.scale !== 100 ? ps.scale / 100 : 1;
  if (sheetW * scale > printableW || (ps.fitToPage && (ps.fitToWidth ?? 1) >= 1)) scale = Math.min(scale, printableW / Math.max(1, sheetW));
  if (ps.fitToPage && sheetW * scale < printableW * 0.98 && ps.fitToWidth === 1) scale = printableW / Math.max(1, sheetW);
  // Antet tek sayfa olarak tasarlanır: içerik sayfayı aşıyorsa tek sayfaya sığdır (alt bilgi kesilmesin)
  const printableH = ph - mt - mb;
  const sheetH = rowY[maxR];
  if (sheetH * scale > printableH) scale = printableH / Math.max(1, sheetH);
  const offX = ml + (ps.horizontalCentered ? (printableW - sheetW * scale) / 2 : 0);
  const offY = mt;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(pw * DPR);
  canvas.height = Math.round(ph * DPR);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  /* Üst/alt bilgi metinleri (sayfa kenar boşluğunda) */
  ctx.save();
  ctx.scale(DPR, DPR);
  drawHeaderFooter(ctx, ws.headerFooter?.oddHeader || ws.headerFooter?.firstHeader, pw, ((mg.header ?? 0.3) * 96) + 10, ml, mr, false, notes);
  drawHeaderFooter(ctx, ws.headerFooter?.oddFooter || ws.headerFooter?.firstFooter, pw, ph - ((mg.footer ?? 0.3) * 96) - 4, ml, mr, true, notes);
  ctx.restore();

  ctx.save();
  ctx.scale(DPR, DPR);
  ctx.translate(offX, offY);
  ctx.scale(scale, scale);

  /* Birleştirilmiş hücreler */
  const merges = [];
  const mergeAt = new Map();
  const covered = new Set();
  for (const m of Object.values(ws._merges || {})) {
    const t = m.top, l = m.left, b = m.bottom, r = m.right;
    if (!t || !l) continue;
    merges.push({ t, l, b, r });
    mergeAt.set(`${t}:${l}`, { t, l, b, r });
    for (let rr = t; rr <= b; rr++) for (let cc = l; cc <= r; cc++) if (rr !== t || cc !== l) covered.add(`${rr}:${cc}`);
  }

  const cells = [];
  ws.eachRow({ includeEmpty: true }, (row, r) => {
    if (r > maxR) return;
    row.eachCell({ includeEmpty: true }, (cell, c) => {
      if (c > maxC || covered.has(`${r}:${c}`)) return;
      const m = mergeAt.get(`${r}:${c}`);
      const x0 = colX[c - 1], x1 = colX[m ? m.r : c], y0 = rowY[r - 1], y1 = rowY[m ? m.b : r];
      cells.push({ cell, r, c, x0, x1, y0, y1, merged: !!m });
    });
  });

  // 1) Dolgular
  for (const k of cells) {
    const f = k.cell.fill;
    if (f && f.type === "pattern" && f.pattern && f.pattern !== "none") {
      const col = color(f.fgColor, theme) || color(f.bgColor, theme);
      if (col) { ctx.fillStyle = col; ctx.fillRect(k.x0, k.y0, k.x1 - k.x0, k.y1 - k.y0); }
    } else if (f && f.type === "gradient" && f.stops?.length) {
      ctx.fillStyle = color(f.stops[0].color, theme, "#fff");
      ctx.fillRect(k.x0, k.y0, k.x1 - k.x0, k.y1 - k.y0);
    }
  }
  // 2) Metin
  for (const k of cells) drawCellText(ctx, k, theme);
  // 3) Kenarlıklar
  for (const k of cells) drawBorders(ctx, k, theme);
  // 4) Görseller
  for (const img of images) {
    try {
      const meta = wb.getImage(img.imageId);
      const ext = (meta.extension || "png").toLowerCase();
      if (ext === "emf" || ext === "wmf") { notes.push("lhd.note.xlsx"); continue; }
      const bytes = meta.buffer instanceof Uint8Array ? meta.buffer : new Uint8Array(meta.buffer || []);
      if (!bytes.length) continue;
      const bmp = await createImageBitmap(new Blob([bytes], { type: `image/${ext === "jpg" ? "jpeg" : ext}` }));
      const tl = img.range.tl;
      const x0 = xOf(tl.nativeCol, tl.nativeColOff), y0 = yOf(tl.nativeRow, tl.nativeRowOff);
      let x1, y1;
      if (img.range.ext && img.range.ext.width) { x1 = x0 + img.range.ext.width; y1 = y0 + img.range.ext.height; }
      else if (img.range.br) { const br = img.range.br; x1 = xOf(br.nativeCol, br.nativeColOff); y1 = yOf(br.nativeRow, br.nativeRowOff); }
      else { x1 = x0 + bmp.width; y1 = y0 + bmp.height; }
      ctx.drawImage(bmp, x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
      bmp.close?.();
    } catch { /* tek görsel hatası tüm anteti bozmasın */ }
  }
  ctx.restore();

  return { canvas, pageWidth: pw * 0.75, pageHeight: ph * 0.75, notes: [...new Set(notes)].filter((n) => n !== "lhd.note.xlsx") };
}

function parsePrintArea(pa) {
  if (!pa) return null;
  const m = String(pa).split(",")[0].replace(/\$/g, "").match(/([A-Z]+)(\d+):([A-Z]+)(\d+)/);
  if (!m) return null;
  const col = (s) => [...s].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0);
  return { left: col(m[1]), top: +m[2], right: col(m[3]), bottom: +m[4] };
}

function fontFor(f, theme) {
  const size = (f?.size || 11) * (96 / 72);
  const family = f?.name ? `"${f.name}", ` : "";
  return {
    css: `${f?.italic ? "italic " : ""}${f?.bold ? "700 " : "400 "}${size}px ${family}Calibri, Carlito, "Helvetica Neue", Arial, sans-serif`,
    size,
    color: color(f?.color, theme, "#000000"),
    underline: !!f?.underline
  };
}

function cellText(cell) {
  const v = cell.value;
  if (v == null) return { runs: [] };
  if (typeof v === "object" && Array.isArray(v.richText)) return { runs: v.richText.map((r) => ({ text: r.text || "", font: r.font })) };
  let t;
  try { t = cell.text; } catch { t = String(v); }
  if (typeof v === "object" && v.hyperlink && v.text) t = typeof v.text === "string" ? v.text : t;
  return { runs: [{ text: t ?? "", font: null }] };
}

function drawCellText(ctx, k, theme) {
  const { cell } = k;
  const { runs } = cellText(cell);
  const full = runs.map((r) => r.text).join("");
  if (!full.trim()) return;
  const al = cell.alignment || {};
  const isNum = typeof cell.value === "number";
  const h = al.horizontal || (isNum ? "right" : "left");
  const v = al.vertical || "bottom";
  const base = fontFor(cell.font, theme);
  const indent = (al.indent || 0) * 9;
  const padX = 2.5;
  const boxW = k.x1 - k.x0 - padX * 2 - indent;
  const wrap = !!al.wrapText || full.includes("\n");
  ctx.save();
  if (wrap || k.merged) {
    ctx.beginPath();
    ctx.rect(k.x0, k.y0, k.x1 - k.x0, k.y1 - k.y0);
    ctx.clip();
  }
  // Satırlar (zengin metinde her parçanın kendi fontu)
  const lines = [];
  let cur = [];
  let curW = 0;
  const pushLine = () => { lines.push(cur); cur = []; curW = 0; };
  for (const run of runs) {
    const f = run.font ? fontFor({ ...cell.font, ...run.font }, theme) : base;
    ctx.font = f.css;
    const parts = String(run.text).split("\n");
    parts.forEach((part, pi) => {
      if (pi > 0) pushLine();
      if (!wrap) { const w = ctx.measureText(part).width; cur.push({ t: part, f, w }); curW += w; return; }
      const words = part.split(/(\s+)/);
      for (const word of words) {
        const w = ctx.measureText(word).width;
        if (curW + w > boxW && curW > 0 && word.trim()) pushLine();
        if (!cur.length && !word.trim()) continue;
        cur.push({ t: word, f, w });
        curW += w;
      }
    });
  }
  pushLine();
  const lineH = Math.max(...runs.map((r) => (r.font ? fontFor({ ...cell.font, ...r.font }, theme).size : base.size))) * 1.22;
  const totalH = lines.length * lineH;
  let y = v === "top" ? k.y0 + 2 : v === "center" || v === "middle" ? (k.y0 + k.y1) / 2 - totalH / 2 : k.y1 - totalH - 2;
  ctx.textBaseline = "alphabetic";
  for (const line of lines) {
    const lw = line.reduce((a, s) => a + s.w, 0);
    let x = h === "center" || h === "centerContinuous" ? (k.x0 + k.x1) / 2 - lw / 2 : h === "right" ? k.x1 - padX - lw - indent : k.x0 + padX + indent;
    const baseline = y + lineH * 0.8;
    for (const seg of line) {
      ctx.font = seg.f.css;
      ctx.fillStyle = seg.f.color;
      ctx.fillText(seg.t, x, baseline);
      if (seg.f.underline) { ctx.fillRect(x, baseline + 1.5, seg.w, 0.8); }
      x += seg.w;
    }
    y += lineH;
  }
  ctx.restore();
}

function drawBorders(ctx, k, theme) {
  const b = k.cell.border;
  if (!b) return;
  const W = { thin: 1, hair: 0.5, dotted: 1, dashed: 1, medium: 2, mediumDashed: 2, thick: 3, double: 3, dashDot: 1, mediumDashDot: 2, slantDashDot: 2 };
  const side = (s, x0, y0, x1, y1) => {
    if (!s || !s.style) return;
    ctx.strokeStyle = color(s.color, theme, "#000000");
    ctx.lineWidth = W[s.style] || 1;
    ctx.setLineDash(/dash/i.test(s.style) ? [4, 2] : s.style === "dotted" ? [1, 2] : []);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  };
  side(b.top, k.x0, k.y0, k.x1, k.y0);
  side(b.bottom, k.x0, k.y1, k.x1, k.y1);
  side(b.left, k.x0, k.y0, k.x0, k.y1);
  side(b.right, k.x1, k.y0, k.x1, k.y1);
  ctx.setLineDash([]);
}

function drawHeaderFooter(ctx, spec, pw, y, ml, mr, isFooter, notes) {
  if (!spec) return;
  if (/&G/.test(spec)) notes.push("lhd.note.xlsx");
  const parts = { L: "", C: "", R: "" };
  let cur = "C";
  const tokens = String(spec).split(/(&[LCR])/);
  for (const t of tokens) {
    if (/^&[LCR]$/.test(t)) { cur = t[1]; continue; }
    parts[cur] += t;
  }
  const clean = (s) => s
    .replace(/&"[^"]*"/g, "").replace(/&\d+/g, "").replace(/&K[0-9A-F]{6}/gi, "")
    .replace(/&[PNDTFAZG]/g, "").replace(/&[BIUSXYEO]/g, "").replace(/&&/g, "&").trim();
  ctx.font = `400 ${11 * (96 / 72)}px Calibri, Carlito, Arial, sans-serif`;
  ctx.fillStyle = "#000";
  ctx.textBaseline = isFooter ? "alphabetic" : "top";
  const L = clean(parts.L), Cc = clean(parts.C), R = clean(parts.R);
  if (L) ctx.fillText(L, ml, y);
  if (Cc) ctx.fillText(Cc, pw / 2 - ctx.measureText(Cc).width / 2, y);
  if (R) ctx.fillText(R, pw - mr - ctx.measureText(R).width, y);
}
