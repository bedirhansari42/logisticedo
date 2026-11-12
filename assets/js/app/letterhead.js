/* Antet yükleme: PDF / Word / Excel / görsel → arka plan kaydı.
   PDF antetler vektör olarak saklanır; diğerleri yüksek çözünürlüklü PNG'ye çevrilir. */
import { loadPdfJs, PDFJS_OPTS, loadPdfLib, loadDocxPreview, loadHtmlToImage } from "./loader.js";
import { renderXlsxToCanvas } from "./excel-render.js";
import { uid } from "./doc-model.js";

const A4 = { w: 595.28, h: 841.89 };
const PT_PER_MM = 72 / 25.4;

export class LetterheadError extends Error {
  constructor(key, vars) { super(key); this.key = key; this.vars = vars; }
}

const ext = (name) => (String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || "";

export async function processLetterheadFile(file) {
  const e = ext(file.name);
  const buf = await file.arrayBuffer();
  let r;
  if (e === "pdf" || file.type === "application/pdf") r = await fromPdf(buf);
  else if (e === "docx" || e === "docm" || e === "dotx") r = await fromDocx(buf);
  else if (e === "xlsx" || e === "xlsm" || e === "xltx") r = await fromXlsx(buf);
  else if (["png", "jpg", "jpeg", "webp"].includes(e) || /^image\/(png|jpeg|webp)$/.test(file.type)) r = await fromImage(file);
  else if (e === "doc" || e === "xls") throw new LetterheadError("lh.err.legacy");
  else throw new LetterheadError("lh.err.unsupported");

  const margins = suggestMargins(r.canvas, r.pageWidth, r.pageHeight);
  const preview = await canvasToBlob(downscale(r.canvas, 900), "image/jpeg", 0.88);
  const thumb = downscale(r.canvas, 280).toDataURL("image/jpeg", 0.82);
  const baseName = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 60);

  return {
    id: uid(),
    name: baseName || "Antet",
    sourceType: e || "file",
    fileName: file.name,
    kind: r.kind,
    data: r.data,
    pageWidth: r.pageWidth,
    pageHeight: r.pageHeight,
    margins,
    applyTo: "all",
    preview,
    thumb,
    notes: r.notes || [],
    profile: null,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

/* ------------------------------------------------------------------ PDF */

async function fromPdf(buf) {
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ ...PDFJS_OPTS, data: new Uint8Array(buf.slice(0)) }).promise;
  try {
    const page = await doc.getPage(1);
    const vp1 = page.getViewport({ scale: 1 });
    const canvas = await renderPdfPage(page, 1100 / vp1.width);
    const notes = [];
    let kind = "pdf";
    let data = new Blob([buf], { type: "application/pdf" });
    // pdf-lib ile gömülebiliyor mu? (şifreli/bozuk/dönük sayfalarda görsele çevir)
    try {
      if (page.rotate) throw new Error("rotated");
      const { PDFLib } = await loadPdfLib();
      const src = await PDFLib.PDFDocument.load(new Uint8Array(buf.slice(0)), { ignoreEncryption: true, updateMetadata: false });
      if (src.isEncrypted) throw new Error("encrypted");
      const test = await PDFLib.PDFDocument.create();
      await test.embedPage(src.getPage(0));
    } catch {
      kind = "image";
      const hi = await renderPdfPage(page, 220 / 72);
      data = await canvasToBlob(hi, "image/png");
      notes.push("lhd.note.raster");
    }
    return { kind, data, canvas, pageWidth: vp1.width, pageHeight: vp1.height, notes };
  } finally {
    doc.destroy();
  }
}

async function renderPdfPage(page, scale) {
  const vp = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(vp.width);
  canvas.height = Math.round(vp.height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp, background: "#ffffff" }).promise;
  return canvas;
}

/* ------------------------------------------------------------------ Word */

async function fromDocx(buf) {
  const docx = await loadDocxPreview();
  const htmlToImage = await loadHtmlToImage();
  const host = document.createElement("div");
  host.className = "docx-render-host";
  host.setAttribute("aria-hidden", "true");
  document.body.append(host);
  try {
    await docx.renderAsync(buf, host, undefined, {
      className: "docx",
      inWrapper: false,
      ignoreWidth: false,
      ignoreHeight: false,
      ignoreFonts: false,
      breakPages: true,
      ignoreLastRenderedPageBreak: true,
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: false,
      renderEndnotes: false,
      useBase64URL: true,
      experimental: true
    });
    await waitForImages(host);
    if (document.fonts?.ready) await document.fonts.ready;
    const section = host.querySelector("section.docx");
    if (!section) throw new Error("Word sayfası çizilemedi");
    section.style.boxShadow = "none";
    section.style.margin = "0";
    const w = section.offsetWidth, h = section.offsetHeight;
    const canvas = await htmlToImage.toCanvas(section, {
      pixelRatio: 2.6, backgroundColor: "#ffffff", width: w, height: h, skipFonts: true, cacheBust: false
    });
    const data = await canvasToBlob(canvas, "image/png");
    return { kind: "image", data, canvas, pageWidth: w * 0.75, pageHeight: h * 0.75, notes: ["lhd.note.docx"] };
  } finally {
    host.remove();
  }
}

function waitForImages(root) {
  const imgs = Array.from(root.querySelectorAll("img"));
  return Promise.all(imgs.map((img) => (img.complete ? null : new Promise((res) => { img.onload = img.onerror = res; }))));
}

/* ------------------------------------------------------------------ Excel */

async function fromXlsx(buf) {
  const r = await renderXlsxToCanvas(buf);
  const data = await canvasToBlob(r.canvas, "image/png");
  return { kind: "image", data, canvas: r.canvas, pageWidth: r.pageWidth, pageHeight: r.pageHeight, notes: ["lhd.note.xlsx", ...(r.notes || [])] };
}

/* ------------------------------------------------------------------ Görsel */

async function fromImage(file) {
  const bmp = await createImageBitmap(file);
  const ratio = bmp.height / bmp.width;
  const scale = 2480 / A4.w; // ~300 dpi genişlik
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(A4.w * scale);
  canvas.height = Math.round(A4.h * scale);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const notes = [];
  if (ratio >= 1.15) {
    // Tam sayfa: genişliğe sığdır, gerekirse yüksekliğe
    let w = canvas.width, h = w * ratio;
    if (h > canvas.height) { h = canvas.height; w = h / ratio; }
    ctx.drawImage(bmp, (canvas.width - w) / 2, 0, w, h);
  } else {
    // Üst şerit
    const h = canvas.width * ratio;
    ctx.drawImage(bmp, 0, 0, canvas.width, h);
    notes.push("lhd.note.banner");
  }
  bmp.close?.();
  const data = await canvasToBlob(canvas, "image/png");
  return { kind: "image", data, canvas, pageWidth: A4.w, pageHeight: A4.h, notes };
}

/* ------------------------------------------------------------------ Yardımcılar */

export function canvasToBlob(canvas, type = "image/png", q) {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Görsel üretilemedi"))), type, q));
}

function downscale(canvas, maxW) {
  if (canvas.width <= maxW) return canvas;
  const c = document.createElement("canvas");
  c.width = maxW;
  c.height = Math.round(canvas.height * (maxW / canvas.width));
  const ctx = c.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, 0, 0, c.width, c.height);
  return c;
}

/** Antetteki logo/başlık ve alt bilgi bantlarını bulup içerik alanı kenar boşluklarını önerir (mm). */
export function suggestMargins(canvas, pageWpt, pageHpt) {
  const W = 240, Hh = Math.max(10, Math.round(W * (canvas.height / canvas.width)));
  const c = document.createElement("canvas");
  c.width = W; c.height = Hh;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, Hh);
  ctx.drawImage(canvas, 0, 0, W, Hh);
  const { data } = ctx.getImageData(0, 0, W, Hh);
  const ink = (x, y) => {
    const i = (y * W + x) * 4;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    return lum < 228 || sat > 38;
  };
  const rowInk = new Array(Hh).fill(0);
  for (let y = 0; y < Hh; y++) { let n = 0; for (let x = 0; x < W; x++) if (ink(x, y)) n++; rowInk[y] = n; }
  const isInk = (y) => rowInk[y] >= 1;

  const scan = (from, to, step, gapNeed) => {
    let last = -1, empty = 0;
    for (let y = from; step > 0 ? y < to : y > to; y += step) {
      if (isInk(y)) { last = y; empty = 0; }
      else if (last >= 0 && ++empty >= gapNeed) break;
    }
    return last;
  };
  // Önce büyük boşluğa kadar tara (logo + adres + ayırıcı çizgi tek bant sayılır);
  // bant sayfanın çok içine taşarsa (filigran vb.) küçük boşluk ölçütüne dön.
  const bigGap = Math.max(4, Math.round(Hh * 0.08)), smallGap = Math.max(3, Math.round(Hh * 0.03));
  const pageWmm = pageWpt / PT_PER_MM, pageHmm = pageHpt / PT_PER_MM;
  const mmPerPx = pageHmm / Hh;
  let topLast = scan(0, Math.round(Hh * 0.5), 1, bigGap);
  if (topLast > Hh * 0.36) topLast = scan(0, Math.round(Hh * 0.5), 1, smallGap);
  let botLast = scan(Hh - 1, Math.round(Hh * 0.5), -1, bigGap);
  if (botLast >= 0 && botLast < Hh * 0.7) botLast = scan(Hh - 1, Math.round(Hh * 0.5), -1, smallGap);
  let top = topLast >= 0 && topLast < Hh * 0.45 ? (topLast + 1) * mmPerPx + 7 : 20;
  let bottom = botLast >= 0 && botLast > Hh * 0.55 ? (Hh - botLast) * mmPerPx + 6 : 16;
  top = clamp(Math.round(top), 12, 130);
  bottom = clamp(Math.round(bottom), 10, 100);

  // Yan şeritler (orta bölgedeki sütunlarda mürekkep)
  const y0 = Math.round((top / pageHmm) * Hh), y1 = Math.round(Hh - (bottom / pageHmm) * Hh);
  const colInk = new Array(W).fill(0);
  for (let x = 0; x < W; x++) for (let y = y0; y < y1; y += 2) if (ink(x, y)) colInk[x]++;
  const band = Math.max(1, (y1 - y0) / 2);
  const solid = (x) => colInk[x] > band * 0.5;
  let l = 0; while (l < W * 0.2 && solid(l)) l++;
  let r = W - 1; while (r > W * 0.8 && solid(r)) r--;
  const mmPerPxX = pageWmm / W;
  const left = clamp(Math.round(Math.max(15, l * mmPerPxX + (l ? 5 : 0))), 8, 60);
  const right = clamp(Math.round(Math.max(15, (W - 1 - r) * mmPerPxX + (W - 1 - r ? 5 : 0))), 8, 60);
  return { top, bottom, left, right };
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Antet önizlemesi (küçük görsel URL'si) */
export function previewUrl(rec) {
  return rec.preview ? URL.createObjectURL(rec.preview) : rec.thumb;
}
