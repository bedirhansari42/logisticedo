/* Commercial invoice ve packing list PDF'leri (pdf-lib). Antet her sayfanın arka planına çizilir.
   Koordinatlar yukarıdan aşağıya (yTop) tutulur, çizimde pdf-lib düzlemine çevrilir. */
import { loadPdfLib, loadDocFonts } from "./loader.js";
import { focReasonText } from "./foc.js";
import {
  computeTotals, itemCurrency, itemVatRate, num, lineAmount, fmtMoney, fmtPrice, fmtQty, fmtWeight, fmtVolume, fmtDate,
  amountInWords, packagesInWords, itemPackageType, packagesText, DEFAULT_ORIGIN_STATEMENT, DEFAULT_ORIGIN_STATEMENT_MIXED, itemOrigin, originList, palletVolume
} from "./doc-model.js";

const MM = 72 / 25.4;
const PAPER = { A4: [595.28, 841.89], LETTER: [612, 792] };
const C = {
  ink: [0.10, 0.11, 0.12],
  text: [0.15, 0.16, 0.17],
  muted: [0.40, 0.43, 0.45],
  line: [0.70, 0.73, 0.75],
  soft: [0.84, 0.86, 0.87],
  fill: [0.935, 0.945, 0.95],
  dark: [0.17, 0.19, 0.20],
  white: [1, 1, 1]
};
const S = { label: 6.0, body: 8.1, small: 7.1, name: 8.7, title: 14.5, th: 6.1, td: 7.8 };
const PAD = 4.6;
const LH = 1.3;
const FOOTER_H = 16;

const lhCache = new Map(); // antet id → bayt

/* ================================================================== Bağlam */

async function createContext(state, letterhead) {
  const { PDFLib, fontkit } = await loadPdfLib();
  const { PDFDocument, rgb, setCharacterSpacing } = PDFLib;
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const [rb, sb, bb] = await loadDocFonts();
  const fonts = {
    r: await pdf.embedFont(rb, { subset: true }),
    s: await pdf.embedFont(sb, { subset: true }),
    b: await pdf.embedFont(bb, { subset: true })
  };
  const fk = fonts.r.embedder?.font;
  const glyphOk = new Map();
  const safe = (str) => {
    let out = "";
    for (const ch of String(str ?? "").replace(/\r/g, "").replace(/\t/g, " ")) {
      if (ch === "\n") { out += ch; continue; }
      const cp = ch.codePointAt(0);
      if (cp < 32) continue;
      let ok = glyphOk.get(cp);
      if (ok === undefined) {
        try { ok = fk ? fk.hasGlyphForCodePoint(cp) : true; } catch { ok = true; }
        glyphOk.set(cp, ok);
      }
      out += ok ? ch : "?";
    }
    return out;
  };

  let W, H, margins, plain, bg = null, applyAll = true;
  if (letterhead) {
    W = letterhead.pageWidth; H = letterhead.pageHeight;
    const m = letterhead.margins;
    margins = { top: m.top * MM, bottom: m.bottom * MM, left: m.left * MM, right: m.right * MM };
    plain = { top: 15 * MM, bottom: 14 * MM, left: margins.left, right: margins.right };
    applyAll = letterhead.applyTo !== "first";
    bg = await embedLetterhead(PDFLib, pdf, letterhead, W, H);
  } else {
    [W, H] = PAPER[state.options.paper] || PAPER.A4;
    margins = { top: 15 * MM, bottom: 14 * MM, left: 15 * MM, right: 15 * MM };
    plain = margins;
  }
  pdf.setCreator("logisticedo.com");
  pdf.setProducer("logisticedo.com");
  return { PDFLib, rgb, setCharacterSpacing, pdf, fonts, safe, W, H, margins, plain, bg, applyAll, hasLetterhead: !!letterhead };
}

async function embedLetterhead(PDFLib, pdf, lh, W, H) {
  let bytes = lhCache.get(lh.id + ":" + (lh.updatedAt || 0));
  if (!bytes) {
    bytes = new Uint8Array(await lh.data.arrayBuffer());
    lhCache.clear();
    lhCache.set(lh.id + ":" + (lh.updatedAt || 0), bytes);
  }
  if (lh.kind === "pdf") {
    const src = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    const p0 = src.getPage(0);
    const cb = p0.getCropBox();
    const emb = await pdf.embedPage(p0, { left: cb.x, bottom: cb.y, right: cb.x + cb.width, top: cb.y + cb.height });
    return { draw: (page) => page.drawPage(emb, { x: 0, y: 0, width: W, height: H }) };
  }
  const img = lh.data.type === "image/jpeg" ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
  return { draw: (page) => page.drawImage(img, { x: 0, y: 0, width: W, height: H }) };
}

/* ================================================================== Sayfa düzeni */

class Doc {
  constructor(ctx, title, docNo) {
    this.c = ctx;
    this.title = title;
    this.docNo = docNo;
    this.pages = [];
    this.onNewPage = null;
    this.addPage();
  }

  addPage() {
    const { pdf, W, H, bg, applyAll, margins, plain } = this.c;
    const page = pdf.addPage([W, H]);
    const first = this.pages.length === 0;
    const withBg = bg && (first || applyAll);
    if (withBg) bg.draw(page);
    const m = bg && !withBg ? plain : margins;
    this.page = page;
    this.x0 = m.left; this.x1 = W - m.right; this.w = this.x1 - this.x0;
    this.top = m.top; this.bottom = H - m.bottom - FOOTER_H;
    this.y = this.top;
    this.pages.push({ page, m });
    if (!first) {
      this.text(`${this.title} — CONTINUED`, this.x0, this.y, { font: "b", size: 8, cs: 0.5, color: C.ink });
      this.text(`No. ${this.docNo}`, this.x1, this.y, { size: 7.6, color: C.muted, align: "right" });
      this.y += 16;
      if (this.onNewPage) this.onNewPage();
    }
  }

  space(h) { return this.bottom - this.y >= h; }
  ensure(h) { if (!this.space(h)) { this.addPage(); return true; } return false; }
  gap(h) { this.y += h; }

  font(k) { return this.c.fonts[k]; }
  tw(str, k = "r", size = S.body, cs = 0) {
    const s = this.c.safe(str);
    return this.font(k).widthOfTextAtSize(s, size) + cs * Math.max(0, s.length - 1);
  }

  wrap(str, k, size, maxW, cs = 0) {
    const out = [];
    const src = this.c.safe(String(str ?? ""));
    for (const para of src.split("\n")) {
      const words = para.split(/\s+/).filter(Boolean);
      if (!words.length) { out.push(""); continue; }
      let line = "";
      for (let w of words) {
        const test = line ? `${line} ${w}` : w;
        if (this.tw(test, k, size, cs) <= maxW) { line = test; continue; }
        if (line) { out.push(line); line = ""; }
        while (this.tw(w, k, size, cs) > maxW && w.length > 1) {
          let n = w.length - 1;
          while (n > 1 && this.tw(w.slice(0, n), k, size, cs) > maxW) n--;
          out.push(w.slice(0, n));
          w = w.slice(n);
        }
        line = w;
      }
      if (line) out.push(line);
    }
    while (out.length && out[out.length - 1] === "") out.pop();
    return out;
  }

  text(str, x, yTop, { font = "r", size = S.body, color = C.text, align = "left", cs = 0 } = {}) {
    const s = this.c.safe(String(str ?? "")).replace(/\n/g, " ");
    if (!s) return;
    const w = this.tw(s, font, size, cs);
    const xx = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
    const baseline = this.c.H - (yTop + size * (LH / 2 + 0.35));
    if (cs) this.page.pushOperators(this.c.setCharacterSpacing(cs));
    this.page.drawText(s, { x: xx, y: baseline, size, font: this.font(font), color: this.c.rgb(...color) });
    if (cs) this.page.pushOperators(this.c.setCharacterSpacing(0));
  }

  rect(x, yTop, w, h, { fill, stroke, lw = 0.6 } = {}) {
    const o = { x, y: this.c.H - yTop - h, width: w, height: h };
    if (fill) o.color = this.c.rgb(...fill);
    if (stroke) { o.borderColor = this.c.rgb(...stroke); o.borderWidth = lw; }
    if (!fill && !stroke) return;
    this.page.drawRectangle(o);
  }
  hline(xa, xb, y, lw = 0.6, color = C.line) {
    this.page.drawLine({ start: { x: xa, y: this.c.H - y }, end: { x: xb, y: this.c.H - y }, thickness: lw, color: this.c.rgb(...color) });
  }
  vline(x, ya, yb, lw = 0.6, color = C.line) {
    this.page.drawLine({ start: { x, y: this.c.H - ya }, end: { x, y: this.c.H - yb }, thickness: lw, color: this.c.rgb(...color) });
  }

  /* --- Bloklar --------------------------------------------------------------- */

  /** Etiket + satırlar kutusu */
  cell(spec) {
    return {
      measure: (w) => {
        const inner = w - 2 * PAD;
        const out = [];
        let h = PAD;
        if (spec.label) h += S.label * LH + 0.8;
        for (const ln of spec.lines) {
          const f = ln.font || "r", s = ln.size || S.body;
          for (const t of this.wrap(ln.text, f, s, inner)) { out.push({ t, f, s, color: ln.color }); h += s * LH; }
        }
        h += PAD - 1;
        return { h: Math.max(h, spec.minH || 0), out };
      },
      draw: (x, y, w, h, m) => {
        this.rect(x, y, w, h, { stroke: C.line });
        let yy = y + PAD - 0.6;
        if (spec.label) {
          this.text(spec.label.toUpperCase(), x + PAD, yy, { font: "s", size: S.label, color: C.muted, cs: 0.45 });
          yy += S.label * LH + 0.8;
        }
        for (const l of m.out) { this.text(l.t, x + PAD, yy, { font: l.f, size: l.s, color: l.color || C.text }); yy += l.s * LH; }
      }
    };
  }

  /** Anahtar–değer satırları kutusu (banka bilgileri, ağırlık özeti) */
  kv(label, pairs, keyW = 62) {
    return {
      measure: (w) => {
        const inner = w - 2 * PAD - keyW;
        const out = [];
        let h = PAD + (label ? S.label * LH + 1.2 : 0);
        for (const [k, v] of pairs) {
          const lines = this.wrap(v, "r", S.body, inner);
          out.push({ k, lines });
          h += Math.max(1, lines.length) * S.body * LH;
        }
        return { h: h + PAD - 1, out };
      },
      draw: (x, y, w, h, m) => {
        this.rect(x, y, w, h, { stroke: C.line });
        let yy = y + PAD - 0.6;
        if (label) { this.text(label.toUpperCase(), x + PAD, yy, { font: "s", size: S.label, color: C.muted, cs: 0.45 }); yy += S.label * LH + 1.2; }
        for (const r of m.out) {
          this.text(r.k, x + PAD, yy + (S.body - S.small) * 0.5, { font: "s", size: S.small, color: C.muted });
          r.lines.forEach((t, i) => this.text(t, x + PAD + keyW, yy + i * S.body * LH, { size: S.body, color: C.text }));
          yy += Math.max(1, r.lines.length) * S.body * LH;
        }
      }
    };
  }

  /** İmza alanı (isteğe bağlı beyan metniyle) */
  sign(declaration, s, caption = "AUTHORISED SIGNATURE & STAMP") {
    const SIGN_SPACE = 40;
    return {
      measure: (w) => {
        const inner = w - 2 * PAD;
        const decl = declaration ? this.wrap(declaration, "r", S.small, inner) : [];
        const who = [s.name, s.title].filter(Boolean).join(", ");
        const where = [s.place, s.date].filter(Boolean).join(", ");
        const capH = declaration ? S.label * LH + 1 : 0;
        let h = PAD + S.label * LH + 1;
        h += decl.length * S.small * LH + (decl.length ? 4 : 0);
        h += SIGN_SPACE + 3 + capH;
        if (who) h += S.body * LH;
        if (where) h += S.small * LH;
        return { h: h + PAD, decl, who, where, capH };
      },
      draw: (x, y, w, h, m) => {
        this.rect(x, y, w, h, { stroke: C.line });
        let yy = y + PAD - 0.6;
        this.text((declaration ? "DECLARATION" : caption), x + PAD, yy, { font: "s", size: S.label, color: C.muted, cs: 0.45 });
        yy += S.label * LH + 1;
        for (const t of m.decl) { this.text(t, x + PAD, yy, { size: S.small, color: C.text }); yy += S.small * LH; }
        const lineY = y + h - PAD - (m.who ? S.body * LH : 0) - (m.where ? S.small * LH : 0) - m.capH - 3;
        this.hline(x + PAD, x + Math.min(w - PAD, PAD + 170), lineY, 0.6, C.muted);
        let ty = lineY + 2.5;
        if (declaration) {
          this.text(caption, x + PAD, ty, { font: "s", size: S.label, color: C.muted, cs: 0.4 });
          ty += m.capH;
        }
        if (m.who) { this.text(m.who, x + PAD, ty, { font: "s", size: S.body, color: C.ink }); ty += S.body * LH; }
        if (m.where) this.text(m.where, x + PAD, ty, { size: S.small, color: C.muted });
      }
    };
  }

  /** Blokları yan yana, ortak yükseklikte çizer. fr: genişlik oranları */
  row(blocks, fr) {
    const ws = fr.map((f) => f * this.w);
    const ms = blocks.map((b, i) => b.measure(ws[i]));
    const h = Math.max(...ms.map((m) => m.h));
    this.ensure(h);
    let x = this.x0;
    blocks.forEach((b, i) => { b.draw(x, this.y, ws[i], h, ms[i]); x += ws[i]; });
    this.y += h;
    return h;
  }

  /** Sol: taraf kutusu; sağ: ikili hücre ızgarası (belge no, tarih …) */
  partyWithGrid(partyBlock, pairs) {
    const lw = this.w * 0.5, rw = this.w - lw, cw = rw / 2;
    const pm = partyBlock.measure(lw);
    const rows = [];
    for (let i = 0; i < pairs.length; i += 2) {
      const cells = [pairs[i], pairs[i + 1]].filter(Boolean).map(([label, value, strong]) =>
        this.cell({ label, lines: [{ text: value || "—", font: strong ? "s" : "r", size: strong ? S.name : S.body, color: value ? C.ink : C.muted }] }));
      const widths = cells.length === 2 ? [cw, cw] : [rw];
      const ms = cells.map((c, k) => c.measure(widths[k]));
      rows.push({ cells, widths, ms, h: Math.max(...ms.map((m) => m.h)) });
    }
    const rh = rows.reduce((a, r) => a + r.h, 0);
    const H = Math.max(pm.h, rh);
    if (rows.length && rh < H) rows[rows.length - 1].h += H - rh;
    this.ensure(H);
    partyBlock.draw(this.x0, this.y, lw, H, pm);
    let yy = this.y;
    for (const r of rows) {
      let x = this.x0 + lw;
      r.cells.forEach((c, k) => { c.draw(x, yy, r.widths[k], r.h, r.ms[k]); x += r.widths[k]; });
      yy += r.h;
    }
    this.y += H;
  }

  /** Dörtlü bilgi ızgarası */
  infoGrid(pairs, perRow = 4) {
    const list = pairs.filter(([, v]) => v);
    for (let i = 0; i < list.length; i += perRow) {
      const chunk = list.slice(i, i + perRow);
      const fr = chunk.map(() => 1 / perRow);
      if (chunk.length < perRow) fr[fr.length - 1] += (perRow - chunk.length) / perRow;
      this.row(chunk.map(([label, value]) => this.cell({ label, lines: [{ text: value, color: C.ink }] })), fr);
    }
  }

  /** Antetsiz sayfada satıcı başlığı */
  plainHeader(seller) {
    if (!seller.name) return;
    const leftW = this.w * 0.62;
    const name = this.wrap(seller.name, "b", 12.5, leftW);
    const addr = this.wrap(seller.address, "r", S.small, leftW);
    const right = [seller.contact, seller.taxId ? `Tax ID: ${seller.taxId}` : ""].filter(Boolean).flatMap((t) => this.wrap(t, "r", S.small, this.w - leftW - 10));
    const h = Math.max(name.length * 12.5 * 1.2 + addr.length * S.small * LH, right.length * S.small * LH);
    let y = this.y;
    name.forEach((t) => { this.text(t, this.x0, y, { font: "b", size: 12.5, color: C.ink }); y += 12.5 * 1.2; });
    addr.forEach((t) => { this.text(t, this.x0, y, { size: S.small, color: C.muted }); y += S.small * LH; });
    let ry = this.y + 2;
    right.forEach((t) => { this.text(t, this.x1, ry, { size: S.small, color: C.muted, align: "right" }); ry += S.small * LH; });
    this.y += h + 6;
    this.hline(this.x0, this.x1, this.y, 1.1, C.dark);
    this.y += 14;
  }

  /** Madde başlığı + paragraflar (sayfa sonunda otomatik bölünür) */
  article(no, title, text) {
    this.ensure(S.body * LH * 3 + 14);
    this.text(`${no}. ${title.toUpperCase()}`, this.x0, this.y, { font: "b", size: S.small + 0.5, color: C.ink, cs: 0.5 });
    this.y += (S.small + 0.5) * LH + 3;
    if (text) this.para(text);
    this.y += 5;
  }

  para(text) {
    for (const p of String(text).split("\n")) {
      if (!p.trim()) { this.y += S.body * 0.5; continue; }
      for (const ln of this.wrap(p, "r", S.body, this.w)) {
        this.ensure(S.body * LH);
        this.text(ln, this.x0, this.y, { size: S.body, color: C.text });
        this.y += S.body * LH;
      }
      this.y += 2;
    }
  }

  docTitle(t) {
    this.ensure(30);
    this.text(t, this.x0, this.y, { font: "b", size: S.title, color: C.ink, cs: 1.1 });
    this.y += S.title * 1.25 + 6;
  }

  /* --- Tablo ------------------------------------------------------------------ */

  sizeColumns(cols, rows) {
    const padX = 8;
    let fixed = 0;
    for (const c of cols) {
      if (c.flex) continue;
      let w = 0;
      for (const r of rows) {
        const t = r.cells[c.key];
        if (t != null && t !== "") w = Math.max(w, this.tw(String(t), r.bold ? "s" : "r", S.td));
      }
      const hw = Math.max(...c.title.split(/\s+/).map((word) => this.tw(word.toUpperCase(), "s", S.th, 0.3)));
      c.w = Math.min(c.max || 130, Math.max(c.min || 22, Math.max(w, hw) + padX));
      fixed += c.w;
    }
    const flex = cols.filter((c) => c.flex);
    const minFlex = 120 * flex.length;
    let rest = this.w - fixed;
    if (rest < minFlex) {
      const shrinkable = cols.filter((c) => !c.flex).reduce((a, c) => a + (c.w - (c.min || 22)), 0);
      const k = Math.min(1, (minFlex - rest) / Math.max(1, shrinkable));
      cols.forEach((c) => { if (!c.flex) c.w -= (c.w - (c.min || 22)) * k; });
      rest = this.w - cols.filter((c) => !c.flex).reduce((a, c) => a + c.w, 0);
    }
    flex.forEach((c) => { c.w = rest / flex.length; });
    let x = this.x0;
    cols.forEach((c) => { c.x = x; x += c.w; });
  }

  table(cols, rows) {
    this.sizeColumns(cols, rows);
    const padX = 4, padY = 3.4;
    const head = cols.map((c) => this.wrap(c.title.toUpperCase(), "s", S.th, c.w - 2 * padX, 0.3));
    const headH = Math.max(...head.map((l) => l.length)) * S.th * LH + 2 * padY;
    const drawHead = () => {
      this.rect(this.x0, this.y, this.w, headH, { fill: C.fill });
      cols.forEach((c, i) => {
        head[i].forEach((t, k) => {
          const ty = this.y + padY + k * S.th * LH;
          const tx = c.align === "right" ? c.x + c.w - padX : c.align === "center" ? c.x + c.w / 2 : c.x + padX;
          this.text(t, tx, ty, { font: "s", size: S.th, color: C.dark, align: c.align || "left", cs: 0.3 });
        });
        if (i) this.vline(c.x, this.y, this.y + headH, 0.5, C.soft);
      });
      this.rect(this.x0, this.y, this.w, headH, { stroke: C.line });
      this.y += headH;
    };
    const measureRow = (r) => {
      const lines = cols.map((c) => this.wrap(r.cells[c.key] == null ? "" : String(r.cells[c.key]), r.bold ? "s" : "r", S.td, c.w - 2 * padX));
      return { lines, h: Math.max(1, ...lines.map((l) => l.length)) * S.td * LH + 2 * padY };
    };
    const first = rows.length ? measureRow(rows[0]) : { h: 0 };
    this.ensure(headH + first.h);
    this.onNewPage = () => drawHead();
    drawHead();
    rows.forEach((r) => {
      const m = measureRow(r);
      if (!this.space(m.h)) this.addPage();
      if (r.fill) this.rect(this.x0, this.y, this.w, m.h, { fill: C.fill });
      cols.forEach((c, i) => {
        m.lines[i].forEach((t, k) => {
          const ty = this.y + padY + k * S.td * LH;
          const tx = c.align === "right" ? c.x + c.w - padX : c.align === "center" ? c.x + c.w / 2 : c.x + padX;
          this.text(t, tx, ty, { font: r.bold ? "s" : "r", size: S.td, color: r.bold ? C.ink : C.text, align: c.align || "left" });
        });
        if (i) this.vline(c.x, this.y, this.y + m.h, 0.5, C.soft);
      });
      this.vline(this.x0, this.y, this.y + m.h, 0.6, C.line);
      this.vline(this.x1, this.y, this.y + m.h, 0.6, C.line);
      this.hline(this.x0, this.x1, this.y + m.h, r.bold ? 0.8 : 0.5, r.bold ? C.line : C.soft);
      this.y += m.h;
    });
    this.hline(this.x0, this.x1, this.y, 0.6, C.line);
    this.onNewPage = null;
    return cols;
  }

  finish() {
    const n = this.pages.length;
    this.pages.forEach(({ page, m }, i) => {
      const y = this.c.H - m.bottom - 9;
      const prev = this.page;
      this.page = page;
      const x0 = m.left, x1 = this.c.W - m.right;
      this.text(`${this.title} · No. ${this.docNo}`, x0, y, { size: 6.4, color: C.muted, cs: 0.2 });
      this.text(`Page ${i + 1} of ${n}`, x1, y, { size: 6.4, color: C.muted, align: "right" });
      this.page = prev;
    });
  }
}

/* ================================================================== Ortak parçalar */

function partyBlock(doc, label, p) {
  const lines = [];
  if (p.name) lines.push({ text: p.name, font: "s", size: S.name, color: C.ink });
  if (p.address) lines.push({ text: p.address, size: S.body });
  if (p.taxId) lines.push({ text: /^(vat|tax|vkn|eori|inn|tin|ust|v\.?d)/i.test(p.taxId) ? p.taxId : `Tax ID: ${p.taxId}`, size: S.small, color: C.muted });
  if (p.person) lines.push({ text: `Attn: ${p.person}`, size: S.body });
  if (p.contact) lines.push({ text: p.contact, size: S.small, color: C.muted });
  if (!lines.length) lines.push({ text: "—", color: C.muted });
  return doc.cell({ label, lines, minH: 58 });
}

function incotermText(s) {
  const sh = s.shipment;
  return [sh.incoterm, sh.incotermPlace].filter(Boolean).join(" ").toUpperCase() + (sh.incoterm ? " (INCOTERMS® 2020)" : "");
}

/** Başlıkta gösterilecek menşe: tek ülke ya da "VARIOUS (kalemlere bakın)" */
function originLabel(s) {
  const l = originList(s);
  return l.length > 1 ? "VARIOUS (SEE ITEMS)" : l[0] || "";
}

function shipmentPairs(s, kind) {
  const sh = s.shipment;
  const pairs = [];
  if (kind === "ci") pairs.push(["Terms of Payment", sh.paymentTerms]);
  pairs.push(
    ["Port / Place of Loading", sh.portLoading],
    ["Port / Place of Discharge", sh.portDischarge],
    ["Final Destination", sh.finalDestination],
    ["Mode of Transport", sh.transportMode],
    ["Country of Origin", originLabel(s)],
    ["Country of Destination", sh.countryDestination],
    ["Vessel / Flight / Vehicle", sh.vessel],
    ["Container / Seal No.", sh.containerNo],
    ["Shipment Date", fmtDate(sh.shipmentDate)]
  );
  return pairs;
}

function partiesRows(doc, s) {
  const buyer = partyBlock(doc, "Buyer / Importer", s.buyer);
  const consignee = !s.consignee.same ? partyBlock(doc, "Consignee", s.consignee) : null;
  const notify = s.notify.enabled ? partyBlock(doc, "Notify Party", s.notify) : null;
  if (consignee) {
    doc.row([buyer, consignee], [0.5, 0.5]);
    if (notify) doc.row([notify], [1]);
  } else if (notify) {
    doc.row([buyer, notify], [0.5, 0.5]);
  } else {
    doc.row([buyer], [1]);
  }
}

function weightPairs(T, s) {
  const pairs = [];
  if (T.packages) pairs.push(["Packages", packagesText(s, T)]);
  if (T.net) pairs.push(["Net Weight", `${fmtWeight(T.net)} KG`]);
  if (T.gross) pairs.push(["Gross Weight", `${fmtWeight(T.gross)} KG`]);
  if (T.volume) pairs.push(["Volume", `${fmtVolume(T.volume)} M³`]);
  return pairs;
}

function bankPairs(b) {
  return [
    ["Bank", b.bankName], ["Branch", b.branch], ["Beneficiary", b.accountName],
    ["IBAN", b.iban], ["SWIFT / BIC", b.swift], ["Account No.", b.accountNo]
  ].filter(([, v]) => v);
}

function signInfo(s, dateIso) {
  return { name: s.sign.name, title: s.sign.title, place: s.sign.place, date: fmtDate(dateIso) };
}

/* ================================================================== Commercial invoice */

const PROFORMA_NOTE = "This is a proforma invoice and not a demand for payment.";
const FOC_STATEMENT = "No commercial value. The goods are free of charge and their value is declared for customs purposes only.";

/** Faturaya atıf veren belgelerde etiket: ücretsiz sevkiyatta "Free of Charge Invoice" */
const invRefLabel = (s) => (s.foc?.enabled ? "Free of Charge Invoice" : "Commercial Invoice");

/** kind: "ci" ticari fatura, "pi" proforma fatura, "foc" ücretsiz fatura (aynı yerleşim; başlık, numara, beyan, değer sütunları ve toplamlar farklı) */
function renderInvoice(ctx, s, kind = "ci") {
  const isPi = kind === "pi";
  const isFoc = kind === "foc";
  const T = computeTotals(s);
  const hasVal = !isFoc || T.lines.some((v) => v > 0); // FOC: gümrük değeri yoksa fiyat sütunları ve toplam yazılmaz
  const cur = (s.meta.currency || "").toUpperCase();
  const title = isPi ? "PROFORMA INVOICE" : isFoc ? "FREE OF CHARGE INVOICE" : "COMMERCIAL INVOICE";
  const docNo = isPi ? s.meta.proformaNo : s.meta.invoiceNo;
  const docDate = isPi ? s.meta.proformaDate : s.meta.invoiceDate;
  const d = new Doc(ctx, title, docNo || "—");
  if (!ctx.hasLetterhead) d.plainHeader(s.seller);
  d.docTitle(title);

  const pairs = isPi
    ? [["Proforma No.", s.meta.proformaNo, true], ["Proforma Date", fmtDate(s.meta.proformaDate)]]
    : [["Invoice No.", s.meta.invoiceNo, true], ["Invoice Date", fmtDate(s.meta.invoiceDate)]];
  const pi = [s.meta.proformaNo, fmtDate(s.meta.proformaDate)].filter(Boolean).join(" / ");
  if (pi && !isPi) pairs.push(["Proforma Invoice", pi]);
  if (isFoc) pairs.push(["Reason for Shipment", focReasonText(s.foc)]);
  if (s.meta.orderRef) pairs.push(["Order Ref.", s.meta.orderRef]);
  if (cur && hasVal) pairs.push(["Currency", cur]);
  const inc = incotermText(s);
  if (inc && hasVal) pairs.push(["Terms of Delivery", inc]);
  d.partyWithGrid(partyBlock(d, "Seller / Exporter", s.seller), pairs);
  partiesRows(d, s);
  d.infoGrid(shipmentPairs(s, "ci"));
  d.gap(9);

  const anyCode = s.items.some((it) => it.code);
  const anyHs = s.items.some((it) => it.hsCode);
  const perLineCur = !isFoc && (T.anyItemCurrency || T.mixedCurrency);
  const cols = [
    { key: "no", title: "No", align: "center", min: 18, max: 24 },
    ...(anyCode ? [{ key: "code", title: "Code", min: 34, max: 70 }] : []),
    { key: "desc", title: "Description of Goods", flex: true },
    ...(anyHs ? [{ key: "hs", title: "HS Code", min: 42, max: 64 }] : []),
    ...(originList(s).length > 1 ? [{ key: "origin", title: "Origin", align: "center", min: 40, max: 80 }] : []),
    { key: "qty", title: "Qty", align: "right", min: 30, max: 62 },
    { key: "unit", title: "Unit", align: "center", min: 26, max: 40 },
    ...(hasVal ? [{ key: "price", title: `${isFoc ? "Customs Unit Value" : "Unit Price"}${perLineCur ? "" : " " + cur}`, align: "right", min: 44, max: 72 }] : []),
    ...(perLineCur ? [{ key: "cur", title: "Cur.", align: "center", min: 24, max: 34 }] : []),
    ...(T.anyVatRate && !isFoc ? [{ key: "vat", title: "VAT %", align: "right", min: 28, max: 44 }] : []),
    ...(hasVal ? [{ key: "amount", title: `${isFoc ? "Customs Value" : "Amount"}${perLineCur ? "" : " " + cur}`, align: "right", min: 52, max: 84 }] : [])
  ];
  const rows = s.items.map((it, i) => ({
    cells: {
      no: String(i + 1), code: it.code, desc: it.description, hs: it.hsCode, origin: itemOrigin(it, s),
      qty: fmtQty(num(it.qty)), unit: (it.unit || "").toUpperCase(),
      price: fmtPrice(num(it.unitPrice)), cur: itemCurrency(it, s), vat: `${+itemVatRate(it, s).toFixed(2)}%`,
      amount: fmtMoney(lineAmount(it))
    }
  }));
  if (T.qtyTotal != null && s.items.length > 1) {
    rows.push({ bold: true, fill: true, cells: { desc: "TOTAL", qty: fmtQty(T.qtyTotal), unit: T.qtyUnit, amount: fmtMoney(T.subtotal) } });
  }
  if (!rows.length) rows.push({ cells: { desc: "—" } });
  const sized = d.table(cols, rows);

  /* Toplamlar + ağırlık özeti */
  const lines = [];
  const money = (v) => `${fmtMoney(v)}${cur ? " " + cur : ""}`;
  if (!isFoc) {
    if (T.hasCharges) lines.push(["SUBTOTAL", money(T.subtotal)]);
    if (T.freight) lines.push(["FREIGHT", money(T.freight)]);
    if (T.insurance) lines.push(["INSURANCE", money(T.insurance)]);
    if (T.other) lines.push([(s.charges.otherLabel || "OTHER CHARGES").toUpperCase(), money(T.other)]);
    if (T.discount) lines.push(["DISCOUNT", `-${money(T.discount)}`]);
    if (T.vat) lines.push([`VAT${T.vatRate ? ` (${+T.vatRate.toFixed(2)}%)` : ""}`, money(T.vat)]);
  }
  const incShort = [s.shipment.incoterm, s.shipment.incotermPlace].filter(Boolean).join(" ").toUpperCase();
  const totalLabel = isFoc ? "TOTAL CUSTOMS VALUE" : `TOTAL ${incShort ? incShort : ""}`.trim();
  const lastCols = sized.slice(-3);
  const tw = hasVal ? Math.max(176, lastCols.reduce((a, c) => a + c.w, 0)) : 0;
  const rowH = S.body * LH + 6;
  const totalH = hasVal ? lines.length * rowH + (S.body + 1) * LH + 9 : 0;
  const wp = s.options.showWeightsOnInvoice && !isPi ? weightPairs(T, s) : [];
  const wBlock = wp.length ? d.kv("Packing summary", wp, 68) : null;
  const wW = hasVal ? d.w - tw - 10 : d.w;
  const wm = wBlock ? wBlock.measure(wW) : { h: 0 };
  const blockH = Math.max(totalH, wm.h);
  if (blockH) d.gap(6);
  d.ensure(blockH);
  const ty = d.y;
  const tx = d.x1 - tw;
  let yy = ty;
  if (hasVal) for (const [k, v] of lines) {
    d.text(k, tx + PAD, yy + 3, { font: "s", size: S.small, color: C.muted, cs: 0.3 });
    d.text(v, d.x1 - PAD, yy + 2.4, { size: S.body, color: C.text, align: "right" });
    yy += rowH;
    d.hline(tx, d.x1, yy - 1, 0.5, C.soft);
  }
  const gh = (S.body + 1) * LH + 9;
  if (hasVal) {
    d.rect(tx, yy, tw, gh, { fill: C.dark });
    const lab = d.wrap(totalLabel, "b", S.small, tw * 0.55)[0] || totalLabel;
    d.text(lab, tx + PAD, yy + 4.6, { font: "b", size: S.small, color: C.white, cs: 0.3 });
    d.text(money(isFoc ? T.subtotal : T.total), d.x1 - PAD, yy + 3.6, { font: "b", size: S.body + 1, color: C.white, align: "right" });
  }
  if (wBlock) wBlock.draw(d.x0, ty, wW, wm.h, wm);
  d.y = ty + blockH;

  if (s.options.amountInWords && cur && hasVal) {
    d.gap(6);
    d.row([d.cell({ label: "Amount in words", lines: [{ text: amountInWords(isFoc ? T.subtotal : T.total, cur), font: "s", size: S.body, color: C.ink }] })], [1]);
  }

  /* Banka + beyan/imza */
  d.gap(6);
  if (isPi && (s.proforma?.notes || "").trim()) {
    d.row([d.cell({ label: "Notes", lines: [{ text: s.proforma.notes.trim(), font: "r", size: S.body, color: C.ink }] })], [1]);
    d.gap(6);
  }
  const bp = s.bank.show && !isFoc ? bankPairs(s.bank) : [];
  const focText = [FOC_STATEMENT, (s.foc?.note || "").trim()].filter(Boolean).join("\n");
  const sign = d.sign(isPi ? PROFORMA_NOTE : isFoc ? focText : s.sign.showDeclaration ? s.sign.declaration : "", signInfo(s, docDate));
  if (bp.length) d.row([d.kv("Bank details", bp, 62), sign], [0.5, 0.5]);
  else d.row([sign], [0.5]);

  d.finish();
}

/* ================================================================== Packing list */

function renderPacking(ctx, s) {
  const T = computeTotals(s);
  const no = s.meta.plNo || s.meta.invoiceNo || "—";
  const d = new Doc(ctx, "PACKING LIST", no);
  if (!ctx.hasLetterhead) d.plainHeader(s.seller);
  d.docTitle("PACKING LIST");

  const pairs = [
    ["Packing List No.", no, true],
    ["Date", fmtDate(s.meta.invoiceDate)]
  ];
  if (s.meta.invoiceNo) pairs.push([invRefLabel(s), s.meta.invoiceNo]);
  const pi = [s.meta.proformaNo, fmtDate(s.meta.proformaDate)].filter(Boolean).join(" / ");
  if (pi) pairs.push(["Proforma Invoice", pi]);
  if (s.meta.orderRef) pairs.push(["Order Ref.", s.meta.orderRef]);
  const inc = incotermText(s);
  if (inc) pairs.push(["Terms of Delivery", inc]);
  d.partyWithGrid(partyBlock(d, "Seller / Exporter", s.seller), pairs);
  partiesRows(d, s);
  d.infoGrid(shipmentPairs(s, "pl"));
  d.gap(9);

  const any = (k) => s.items.some((it) => String(it[k] ?? "").trim());
  const showHs = s.options.showHsOnPl && any("hsCode");
  const cols = [
    { key: "no", title: "No", align: "center", min: 18, max: 24 },
    { key: "desc", title: "Description of Goods", flex: true },
    ...(showHs ? [{ key: "hs", title: "HS Code", min: 40, max: 60 }] : []),
    { key: "qty", title: "Qty", align: "right", min: 28, max: 56 },
    { key: "unit", title: "Unit", align: "center", min: 24, max: 38 },
    { key: "pkgs", title: "Pkgs", align: "right", min: 26, max: 44 },
    ...(s.items.some((it) => itemPackageType(it, s)) ? [{ key: "ptype", title: "Pkg Type", align: "center", min: 36, max: 60 }] : []),
    { key: "net", title: "Net Wt. (kg)", align: "right", min: 40, max: 64 },
    { key: "gross", title: "Gross Wt. (kg)", align: "right", min: 42, max: 64 },
    ...(any("dimensions") ? [{ key: "dims", title: "Dimensions (cm)", align: "center", min: 48, max: 82 }] : []),
    ...(any("volume") || T.volume ? [{ key: "vol", title: "Volume (m³)", align: "right", min: 38, max: 56 }] : [])
  ];
  const rows = s.items.map((it, i) => ({
    cells: {
      no: String(i + 1), desc: it.description, hs: it.hsCode,
      qty: fmtQty(num(it.qty)), unit: (it.unit || "").toUpperCase(),
      pkgs: fmtQty(num(it.packages)), ptype: itemPackageType(it, s).toUpperCase(),
      net: fmtWeight(num(it.netWeight)), gross: fmtWeight(num(it.grossWeight)),
      dims: it.dimensions, vol: fmtVolume(num(it.volume))
    }
  }));
  rows.push({
    bold: true, fill: true,
    cells: {
      desc: "TOTAL",
      qty: T.qtyTotal != null ? fmtQty(T.qtyTotal) : "", unit: T.qtyTotal != null ? T.qtyUnit : "",
      pkgs: T.packages ? fmtQty(T.packages) : "", net: T.net ? fmtWeight(T.net) : "",
      gross: T.gross ? fmtWeight(T.gross) : "", vol: T.volume ? fmtVolume(T.volume) : ""
    }
  });
  d.table(cols, rows);

  /* Özet + marka/numara */
  d.gap(8);
  const sum = [];
  const pw = packagesText(s, T, { words: true });
  if (pw) sum.push(["Total Packages", pw]);
  if (T.net) sum.push(["Net Weight", `${fmtWeight(T.net)} KG`]);
  if (T.gross) sum.push(["Gross Weight", `${fmtWeight(T.gross)} KG`]);
  if (T.volume) sum.push(["Volume", `${fmtVolume(T.volume)} M³`]);
  const blocks = [], fr = [];
  if (sum.length) { blocks.push(d.kv("Shipment summary", sum, 70)); fr.push(0.5); }
  if (s.packing.marks) { blocks.push(d.cell({ label: "Marks & Numbers", lines: [{ text: s.packing.marks, color: C.ink }] })); fr.push(0.5); }
  if (blocks.length) d.row(blocks, fr.length === 1 ? [0.5] : fr);

  d.gap(6);
  d.row([d.sign("", signInfo(s, s.meta.invoiceDate))], [0.5]);
  d.finish();
}


/* ================================================================== Sevkiyat talimatı ve B/L taslağı */

function cargoDescription(s) {
  if (s.ship.goodsDescription.trim()) return s.ship.goodsDescription.trim();
  const lines = s.items.filter((it) => it.description.trim()).map((it) => {
    const q = num(it.qty);
    const qty = q != null ? ` — ${fmtQty(q)} ${(it.unit || "").toUpperCase()}`.trimEnd() : "";
    return `${it.description.trim().replace(/\s*\n\s*/g, " ")}${qty}`;
  });
  const hs = [...new Set(s.items.map((it) => it.hsCode.trim()).filter(Boolean))];
  let out = lines.join("\n");
  if (hs.length) out += `${out ? "\n\n" : ""}HS CODE: ${hs.join(", ")}`;
  const org = originList(s);
  if (org.length) out += `${out ? "\n" : ""}COUNTRY OF ORIGIN: ${org.join(", ")}`;
  return out;
}

const FREIGHT_TERMS = { prepaid: "FREIGHT PREPAID", collect: "FREIGHT COLLECT" };

function consigneeOf(s) {
  return s.consignee.same ? s.buyer : s.consignee;
}

function renderTransport(ctx, s, kind) {
  const isBl = kind === "bl";
  const T = computeTotals(s);
  const title = isBl ? "BILL OF LADING" : "SHIPPING INSTRUCTION";
  const no = (isBl ? s.ship.blNo : s.ship.siNo) || s.meta.invoiceNo || "—";
  const d = new Doc(ctx, isBl ? "BILL OF LADING — DRAFT" : title, no);
  if (!ctx.hasLetterhead) d.plainHeader(s.seller);
  d.docTitle(isBl ? "BILL OF LADING — DRAFT" : title);
  if (isBl) {
    d.text("NON-NEGOTIABLE DRAFT FOR APPROVAL. NOT VALID AS A TRANSPORT DOCUMENT UNTIL ISSUED AND SIGNED BY THE CARRIER.", d.x0, d.y - 3, { size: S.label, color: C.muted, cs: 0.3 });
    d.gap(10);
  }
  const sh = s.shipment, sp = s.ship;
  const pairs = [
    [isBl ? "B/L No." : "S.I. No.", no, true],
    ["Date", fmtDate(s.meta.invoiceDate)]
  ];
  if (sp.bookingNo) pairs.push(["Booking No.", sp.bookingNo]);
  if (sp.carrier) pairs.push(["Carrier / Line", sp.carrier]);
  if (s.meta.invoiceNo) pairs.push([invRefLabel(s), s.meta.invoiceNo]);
  if (s.meta.proformaNo) pairs.push(["Proforma Invoice", [s.meta.proformaNo, fmtDate(s.meta.proformaDate)].filter(Boolean).join(" / ")]);
  if (s.meta.orderRef) pairs.push(["Order Ref.", s.meta.orderRef]);
  d.partyWithGrid(partyBlock(d, isBl ? "Shipper" : "Shipper / Exporter", s.seller), pairs);
  const cons = partyBlock(d, "Consignee", consigneeOf(s));
  const notify = partyBlock(d, "Notify Party", s.notify.enabled ? s.notify : { name: "SAME AS CONSIGNEE", address: "", taxId: "", contact: "" });
  d.row([cons, notify], [0.5, 0.5]);
  if (sp.forwarder.trim() && !isBl) d.row([d.cell({ label: "Forwarder / Agent", lines: [{ text: sp.forwarder, color: C.ink }], minH: 34 })], [1]);

  d.infoGrid([
    ["Place of Receipt", sp.placeReceipt],
    ["Port of Loading", sh.portLoading],
    ["Port of Discharge", sh.portDischarge],
    ["Place of Delivery", sp.placeDelivery || sh.finalDestination],
    ["Vessel / Voyage", sh.vessel],
    ["Container / Seal No.", sh.containerNo],
    ["Freight", FREIGHT_TERMS[sp.freightTerms] || ""],
    ["Terms of Delivery", incotermText(s)],
    ["Mode of Transport", sh.transportMode],
    ["Number of Original B/L", sp.originals ? `${sp.originals}${isBl ? "" : " ORIGINAL(S)"}` : ""],
    ["B/L Type", sp.blType === "seaway" ? "SEA WAYBILL" : sp.blType === "surrender" ? "TELEX RELEASE / SURRENDERED" : sp.blType === "original" ? "ORIGINAL B/L" : ""],
    ["Shipment Date", fmtDate(sh.shipmentDate)]
  ]);
  d.gap(9);

  const pkgWords = packagesText(s, T, { words: true });
  const cols = [
    { key: "marks", title: "Marks & Numbers", min: 60, max: 110 },
    { key: "pk", title: "No. & Kind of Packages", min: 70, max: 120 },
    { key: "desc", title: "Description of Goods", flex: true },
    { key: "gw", title: "Gross Wt. (kg)", align: "right", min: 50, max: 70 },
    { key: "m3", title: "Measurement (m³)", align: "right", min: 54, max: 76 }
  ];
  const rows = [{
    cells: {
      marks: s.packing.marks || "AS ADDRESSED",
      pk: pkgWords || packagesText(s, T),
      desc: cargoDescription(s),
      gw: T.gross ? fmtWeight(T.gross) : "",
      m3: T.volume ? fmtVolume(T.volume) : ""
    }
  }];
  if (T.net) rows.push({ bold: true, fill: true, cells: { desc: `NET WEIGHT: ${fmtWeight(T.net)} KG`, gw: T.gross ? fmtWeight(T.gross) : "", m3: T.volume ? fmtVolume(T.volume) : "" } });
  d.table(cols, rows);

  d.gap(8);
  if (isBl) {
    d.row([d.cell({
      label: "Receipt and shipment",
      lines: [{ text: "SHIPPED on board in apparent good order and condition, unless otherwise stated herein, the goods described above (weight, measure, marks, numbers, quality, contents and value unknown) for carriage to the port of discharge or so near thereto as the vessel may safely get, subject to the terms and conditions of the carrier's bill of lading.", size: S.small }]
    })], [1]);
    d.gap(6);
  } else if (sp.instructions.trim()) {
    d.row([d.cell({ label: "Special instructions", lines: [{ text: sp.instructions.trim(), color: C.ink }] })], [1]);
    d.gap(6);
  }
  const placeDate = [sp.freightTerms ? FREIGHT_TERMS[sp.freightTerms] : "", sp.originals ? `${sp.originals} ORIGINAL(S)` : ""].filter(Boolean);
  if (isBl && placeDate.length) {
    d.row([d.cell({ label: "Freight and originals", lines: [{ text: placeDate.join(" · "), font: "s", color: C.ink }] })], [1]);
    d.gap(6);
  }
  d.row([d.sign("", signInfo(s, s.meta.invoiceDate), isBl ? "SIGNED FOR THE CARRIER" : "AUTHORISED SIGNATURE & STAMP")], [0.5]);
  d.finish();
}

/* ================================================================== Menşe beyanı */

function renderOrigin(ctx, s) {
  const T = computeTotals(s);
  const no = s.origin.certNo || s.meta.invoiceNo || "—";
  const d = new Doc(ctx, "DECLARATION OF ORIGIN", no);
  if (!ctx.hasLetterhead) d.plainHeader(s.seller);
  d.docTitle("DECLARATION OF ORIGIN");
  const pairs = [
    ["Declaration No.", no, true],
    ["Date", fmtDate(s.meta.invoiceDate)]
  ];
  if (s.meta.invoiceNo) pairs.push([invRefLabel(s), [s.meta.invoiceNo, fmtDate(s.meta.invoiceDate)].filter(Boolean).join(" / ")]);
  if (s.meta.proformaNo) pairs.push(["Proforma Invoice", [s.meta.proformaNo, fmtDate(s.meta.proformaDate)].filter(Boolean).join(" / ")]);
  if (s.meta.orderRef) pairs.push(["Order Ref.", s.meta.orderRef]);
  d.partyWithGrid(partyBlock(d, "Exporter / Supplier", s.seller), pairs);
  d.row([partyBlock(d, "Importer / Consignee", consigneeOf(s))], [1]);
  d.infoGrid([
    ["Country of Origin", originLabel(s)],
    ["Country of Destination", s.shipment.countryDestination],
    ["Port / Place of Loading", s.shipment.portLoading],
    ["Port / Place of Discharge", s.shipment.portDischarge]
  ]);
  d.gap(9);

  const any = (k) => s.items.some((it) => String(it[k] ?? "").trim());
  const origins = originList(s);
  const origin = origins.join(", ");
  const cols = [
    { key: "no", title: "No", align: "center", min: 18, max: 24 },
    { key: "desc", title: "Description of Goods", flex: true },
    ...(any("hsCode") ? [{ key: "hs", title: "HS Code", min: 42, max: 64 }] : []),
    { key: "qty", title: "Qty", align: "right", min: 30, max: 62 },
    { key: "unit", title: "Unit", align: "center", min: 26, max: 40 },
    ...(T.gross ? [{ key: "gross", title: "Gross Wt. (kg)", align: "right", min: 42, max: 64 }] : []),
    ...(origin ? [{ key: "origin", title: "Origin", align: "center", min: 44, max: 100 }] : [])
  ];
  const rows = s.items.map((it, i) => ({
    cells: {
      no: String(i + 1), desc: it.description, hs: it.hsCode,
      qty: fmtQty(num(it.qty)), unit: (it.unit || "").toUpperCase(),
      gross: fmtWeight(num(it.grossWeight)), origin: itemOrigin(it, s)
    }
  }));
  if (!rows.length) rows.push({ cells: { desc: "—" } });
  d.table(cols, rows);

  d.gap(8);
  const mixed = origins.length > 1 && (!s.origin.statement.trim() || s.origin.statement === DEFAULT_ORIGIN_STATEMENT);
  const stmt = (mixed ? DEFAULT_ORIGIN_STATEMENT_MIXED : (s.origin.statement || DEFAULT_ORIGIN_STATEMENT))
    .replace(/\{origin\}/gi, origin || "[COUNTRY OF ORIGIN]")
    .replace(/\{seller\}/gi, s.seller.name || "the exporter");
  d.row([d.cell({ label: "Declaration", lines: [{ text: stmt, size: S.body, color: C.ink }] })], [1]);
  d.gap(6);
  d.row([d.sign("", signInfo(s, s.meta.invoiceDate))], [0.5]);
  d.finish();
}


/* ================================================================== Talimat mektupları (yükleme, menşe şahadetnamesi, EUR.1) */

const INSTR = {
  loading: { title: "LOADING INSTRUCTION", prefix: "LI" },
  coo: { title: "CERTIFICATE OF ORIGIN REQUEST", prefix: "CO" },
  eur1: { title: "EUR.1 MOVEMENT CERTIFICATE REQUEST", prefix: "EUR1" }
};

function renderInstruction(ctx, s, kind) {
  const meta = INSTR[kind];
  const T = computeTotals(s);
  const ins = s.instr, sh = s.shipment;
  const no = `${meta.prefix}-${s.meta.invoiceNo || "—"}`;
  const d = new Doc(ctx, meta.title, no);
  if (!ctx.hasLetterhead) d.plainHeader(s.seller);
  d.docTitle(meta.title);

  const pairs = [["Reference", no, true], ["Date", fmtDate(s.meta.invoiceDate)]];
  if (s.meta.invoiceNo) pairs.push([invRefLabel(s), [s.meta.invoiceNo, fmtDate(s.meta.invoiceDate)].filter(Boolean).join(" / ")]);
  if (s.meta.proformaNo) pairs.push(["Proforma Invoice", [s.meta.proformaNo, fmtDate(s.meta.proformaDate)].filter(Boolean).join(" / ")]);
  if (s.meta.orderRef) pairs.push(["Order Ref.", s.meta.orderRef]);
  const toText = kind === "loading" ? ins.toLoading : kind === "coo" ? ins.toCoo : ins.toEur1;
  d.partyWithGrid(toCell(d, toText), pairs);

  const intro = {
    loading: "Please arrange the loading of the goods described below as per the details and instructions stated in this document.",
    coo: "Please obtain a Certificate of Origin for the goods described below from the competent chamber, based on the details in this document, and return the original and copies to us.",
    eur1: "Please prepare and lodge the application for an EUR.1 movement certificate for the goods described below with the competent customs authority, based on the details in this document, and return the endorsed certificate to us."
  }[kind];
  d.row([d.cell({ label: "Instruction", lines: [{ text: intro, color: C.ink }] })], [1]);

  if (kind === "loading") {
    d.infoGrid([
      ["Place of Loading", ins.loadingPlace],
      ["Loading Date / Time", ins.loadingDate ? fmtDate(ins.loadingDate) : ""],
      ["Vehicle / Plate No.", ins.vehicle],
      ["Driver", ins.driver],
      ["Container / Seal No.", sh.containerNo],
      ["Destination", sh.portDischarge || sh.finalDestination],
      ["Contact at Loading Place", ins.loadContact],
      ["Consignee", consigneeOf(s).name]
    ]);
  } else {
    d.row([partyBlock(d, "Exporter", s.seller), partyBlock(d, "Consignee", consigneeOf(s))], [0.5, 0.5]);
    d.infoGrid([
      ["Country of Origin", originLabel(s)],
      ["Country of Destination", sh.countryDestination],
      ["Port / Place of Loading", sh.portLoading],
      ["Port / Place of Discharge", sh.portDischarge],
      ["Mode of Transport", sh.transportMode],
      ["No. of Copies Required", ins.copies],
      ...(kind === "eur1" ? [["Origin Criterion", ins.eur1Criterion], ["Agreement / Preference", ins.eur1Agreement]] : [])
    ]);
  }
  d.gap(9);

  const any = (k) => s.items.some((it) => String(it[k] ?? "").trim());
  const origins = originList(s);
  const origin = origins.join(", ");
  const cols = [
    { key: "no", title: "No", align: "center", min: 18, max: 24 },
    { key: "desc", title: "Description of Goods", flex: true },
    ...(kind !== "loading" && any("hsCode") ? [{ key: "hs", title: "HS Code", min: 42, max: 64 }] : []),
    { key: "qty", title: "Qty", align: "right", min: 30, max: 62 },
    { key: "unit", title: "Unit", align: "center", min: 26, max: 40 },
    ...(kind === "loading" ? [{ key: "pkgs", title: "Packages", align: "right", min: 40, max: 70 }] : []),
    { key: "gross", title: "Gross Wt. (kg)", align: "right", min: 42, max: 64 },
    ...(kind === "loading" ? [{ key: "vol", title: "Volume (m³)", align: "right", min: 38, max: 56 }] : []),
    ...(kind === "eur1" ? [{ key: "val", title: `Value${s.meta.currency ? " " + s.meta.currency.toUpperCase() : ""}`, align: "right", min: 48, max: 84 }] : []),
    ...(kind !== "loading" && origin ? [{ key: "origin", title: "Origin", align: "center", min: 44, max: 100 }] : [])
  ];
  const rows = s.items.map((it, i) => ({
    cells: {
      no: String(i + 1), desc: it.description, hs: it.hsCode, qty: fmtQty(num(it.qty)), unit: (it.unit || "").toUpperCase(),
      pkgs: [fmtQty(num(it.packages)), itemPackageType(it, s).toUpperCase()].filter(Boolean).join(" "),
      gross: fmtWeight(num(it.grossWeight)), vol: fmtVolume(num(it.volume)), val: fmtMoney(lineAmount(it)), origin: itemOrigin(it, s)
    }
  }));
  if (s.items.length > 1 || !rows.length) {
    rows.push(rows.length ? { bold: true, fill: true, cells: {
      desc: "TOTAL", pkgs: T.packages ? fmtQty(T.packages) : "", gross: T.gross ? fmtWeight(T.gross) : "",
      vol: T.volume ? fmtVolume(T.volume) : "", val: kind === "eur1" ? fmtMoney(T.subtotal) : ""
    } } : { cells: { desc: "—" } });
  }
  d.table(cols, rows);

  d.gap(8);
  const notes = kind === "loading" ? ins.loadNotes : ins.certNotes;
  const extra = kind === "loading"
    ? "Goods must be loaded in the sequence and with the care required by their nature. Please check the packages against the quantities above and report any damage, shortage or discrepancy to us before the vehicle departs."
    : kind === "coo"
      ? `The commercial invoice, packing list and any supporting documents are enclosed. Country of origin: ${origin || "[COUNTRY OF ORIGIN]"}.`
      : `The commercial invoice, packing list and supporting origin documents (supplier declarations, production records) are enclosed. Country of origin: ${origin || "[COUNTRY OF ORIGIN]"}. Please inform us of any missing document or query raised by the authority.`;
  d.row([d.cell({ label: "Additional instructions", lines: [{ text: extra }, ...(notes && notes.trim() ? [{ text: notes.trim(), color: C.ink }] : [])] })], [1]);
  d.gap(6);
  d.row([d.sign("", signInfo(s, s.meta.invoiceDate))], [0.5]);
  d.finish();
}


/* ================================================================== Sigorta talimatı, nakliye talimatı, pre-alert */

function toCell(d, text) {
  return d.cell({ label: "To", lines: [{ text: text || "—", font: "s", size: S.name, color: text ? C.ink : C.muted }], minH: 58 });
}

function cargoRows(s, T, { pkgs = true, vol = false } = {}) {
  const rows = s.items.map((it, i) => ({
    cells: {
      no: String(i + 1), desc: it.description, hs: it.hsCode, qty: fmtQty(num(it.qty)), unit: (it.unit || "").toUpperCase(),
      pkgs: [fmtQty(num(it.packages)), itemPackageType(it, s).toUpperCase()].filter(Boolean).join(" "),
      gross: fmtWeight(num(it.grossWeight)), vol: fmtVolume(num(it.volume))
    }
  }));
  if (s.items.length > 1) rows.push({ bold: true, fill: true, cells: { desc: "TOTAL", pkgs: pkgs && T.packages ? fmtQty(T.packages) : "", gross: T.gross ? fmtWeight(T.gross) : "", vol: vol && T.volume ? fmtVolume(T.volume) : "" } });
  if (!rows.length) rows.push({ cells: { desc: "—" } });
  return rows;
}

function cargoCols({ hs = false, vol = false } = {}) {
  return [
    { key: "no", title: "No", align: "center", min: 18, max: 24 },
    { key: "desc", title: "Description of Goods", flex: true },
    ...(hs ? [{ key: "hs", title: "HS Code", min: 42, max: 64 }] : []),
    { key: "qty", title: "Qty", align: "right", min: 30, max: 62 },
    { key: "unit", title: "Unit", align: "center", min: 26, max: 40 },
    { key: "pkgs", title: "Packages", align: "right", min: 40, max: 70 },
    { key: "gross", title: "Gross Wt. (kg)", align: "right", min: 42, max: 64 },
    ...(vol ? [{ key: "vol", title: "Volume (m³)", align: "right", min: 38, max: 56 }] : [])
  ];
}

function renderInsurance(ctx, s) {
  const T = computeTotals(s);
  const ins = s.ins, sh = s.shipment;
  const cur = (s.meta.currency || "").toUpperCase();
  const no = `INS-${s.meta.invoiceNo || "—"}`;
  const d = new Doc(ctx, "INSURANCE REQUEST", no);
  if (!ctx.hasLetterhead) d.plainHeader(s.seller);
  d.docTitle("INSURANCE REQUEST");
  const pairs = [["Reference", no, true], ["Date", fmtDate(s.meta.invoiceDate)]];
  if (s.meta.invoiceNo) pairs.push([invRefLabel(s), [s.meta.invoiceNo, fmtDate(s.meta.invoiceDate)].filter(Boolean).join(" / ")]);
  if (s.meta.proformaNo) pairs.push(["Proforma Invoice", [s.meta.proformaNo, fmtDate(s.meta.proformaDate)].filter(Boolean).join(" / ")]);
  if (s.meta.orderRef) pairs.push(["Order Ref.", s.meta.orderRef]);
  d.partyWithGrid(toCell(d, ins.to), pairs);
  d.row([d.cell({ label: "Request", lines: [{ text: "Please arrange marine cargo insurance for the shipment described below on the terms stated in this request, and send us the policy or certificate together with the premium invoice.", color: C.ink }] })], [1]);
  const insured = ins.insuredParty === "buyer" ? s.buyer : s.seller;
  d.row([partyBlock(d, "Insured", insured), partyBlock(d, "Beneficiary / Consignee", consigneeOf(s))], [0.5, 0.5]);
  d.infoGrid([
    ["Voyage From", sh.portLoading],
    ["Voyage To", sh.portDischarge || sh.finalDestination],
    ["Vessel / Vehicle", sh.vessel],
    ["Mode of Transport", sh.transportMode],
    ["Container / Seal No.", sh.containerNo],
    ["Departure Date", fmtDate(sh.shipmentDate)],
    ["Terms of Delivery", incotermText(s)],
    ["Coverage", ins.coverage],
    ["Claims Payable At", ins.claimsPayableAt || sh.portDischarge]
  ], 3);
  d.gap(9);
  d.table(cargoCols({ hs: false }), cargoRows(s, T));

  d.gap(8);
  const pct = num(ins.extraPct) || 0;
  const base = T.total;
  const extra = round2(base * pct / 100);
  const total = round2(base + extra);
  const money = (v) => `${fmtMoney(v)}${cur ? " " + cur : ""}`;
  d.row([d.kv("Sum insured", [
    ["Invoice value", money(base)],
    [`Plus ${+pct.toFixed(2)}%`, money(extra)],
    ["Total insured value", money(total)]
  ], 100)], [0.5]);
  if (cur) { d.gap(6); d.row([d.cell({ label: "Insured value in words", lines: [{ text: amountInWords(total, cur), font: "s", color: C.ink }] })], [1]); }
  if (ins.notes.trim()) { d.gap(6); d.row([d.cell({ label: "Special conditions", lines: [{ text: ins.notes.trim(), color: C.ink }] })], [1]); }
  d.gap(6);
  d.row([d.sign("", signInfo(s, s.meta.invoiceDate))], [0.5]);
  d.finish();
}

const round2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

function renderTransportOrder(ctx, s) {
  const T = computeTotals(s);
  const tr = s.trans, sh = s.shipment;
  const no = `TO-${s.meta.invoiceNo || "—"}`;
  const d = new Doc(ctx, "TRANSPORT ORDER", no);
  if (!ctx.hasLetterhead) d.plainHeader(s.seller);
  d.docTitle("TRANSPORT ORDER");
  const pairs = [["Order No.", no, true], ["Date", fmtDate(s.meta.invoiceDate)]];
  if (s.meta.invoiceNo) pairs.push([invRefLabel(s), s.meta.invoiceNo]);
  if (s.meta.proformaNo) pairs.push(["Proforma Invoice", [s.meta.proformaNo, fmtDate(s.meta.proformaDate)].filter(Boolean).join(" / ")]);
  if (s.meta.orderRef) pairs.push(["Order Ref.", s.meta.orderRef]);
  d.partyWithGrid(toCell(d, tr.to), pairs);
  d.row([d.cell({ label: "Order", lines: [{ text: "We hereby order the road transport of the goods described below under the conditions stated in this document. Please confirm acceptance and the vehicle details by return.", color: C.ink }] })], [1]);
  d.row([partyBlock(d, "Consignor", s.seller), partyBlock(d, "Consignee", consigneeOf(s))], [0.5, 0.5]);
  d.infoGrid([
    ["Loading Address", tr.loadAddress],
    ["Loading Date", fmtDate(tr.loadDate)],
    ["Unloading Address", tr.unloadAddress || sh.finalDestination || sh.portDischarge],
    ["Delivery Date", fmtDate(tr.deliveryDate)],
    ["Vehicle Type", tr.vehicleType],
    ["Agreed Freight", tr.freight ? `${tr.freight} ${(s.meta.currency || "").toUpperCase()}`.trim() : ""],
    ["Payment Terms", tr.paymentTerms],
    ["Terms of Delivery", incotermText(s)]
  ], 4);
  d.gap(9);
  d.table(cargoCols({ vol: true }), cargoRows(s, T, { vol: true }));

  d.gap(8);
  const base = "Documents handed to the driver: commercial invoice and packing list" + (s.shipment.countryOrigin ? ", origin documents where applicable" : "") + ". The goods must be delivered in the same condition as received; any damage, shortage or delay must be reported to us immediately.";
  d.row([d.cell({ label: "Conditions", lines: [{ text: base }, ...(tr.notes.trim() ? [{ text: tr.notes.trim(), color: C.ink }] : [])] })], [1]);
  d.gap(6);
  d.row([d.sign("", signInfo(s, s.meta.invoiceDate))], [0.5]);
  d.finish();
}

function renderPreAlert(ctx, s) {
  const T = computeTotals(s);
  const pa = s.preAlert, sh = s.shipment, sp = s.ship;
  const cur = (s.meta.currency || "").toUpperCase();
  const no = `PA-${s.meta.invoiceNo || "—"}`;
  const d = new Doc(ctx, "PRE-ALERT", no);
  if (!ctx.hasLetterhead) d.plainHeader(s.seller);
  d.docTitle("PRE-ALERT / SHIPMENT NOTICE");
  const pairs = [["Reference", no, true], ["Date", fmtDate(s.meta.invoiceDate)]];
  if (s.meta.invoiceNo) pairs.push([invRefLabel(s), [s.meta.invoiceNo, fmtDate(s.meta.invoiceDate)].filter(Boolean).join(" / ")]);
  if (s.meta.proformaNo) pairs.push(["Proforma Invoice", [s.meta.proformaNo, fmtDate(s.meta.proformaDate)].filter(Boolean).join(" / ")]);
  if (s.meta.orderRef) pairs.push(["Your Order Ref.", s.meta.orderRef]);
  d.partyWithGrid(toCell(d, pa.to || consigneeOf(s).name), pairs);
  d.row([d.cell({ label: "Notice", lines: [{ text: `We are pleased to inform you that the goods under your order${s.meta.orderRef ? " " + s.meta.orderRef : ""} have been shipped as detailed below.`, color: C.ink }] })], [1]);
  d.infoGrid([
    ["B/L / AWB No.", sp.blNo],
    ["Booking No.", sp.bookingNo],
    ["Carrier / Line", sp.carrier],
    ["Vessel / Voyage", sh.vessel],
    ["Container / Seal No.", sh.containerNo],
    ["Port of Loading", sh.portLoading],
    ["Port of Discharge", sh.portDischarge],
    ["Departure (ETD)", fmtDate(sh.shipmentDate)],
    ["Arrival (ETA)", fmtDate(pa.eta)],
    ["Terms of Delivery", incotermText(s)],
    ["Freight", FREIGHT_TERMS[sp.freightTerms] || ""],
    ["Mode of Transport", sh.transportMode]
  ], 4);
  d.gap(9);
  d.table(cargoCols({ vol: true }), cargoRows(s, T, { vol: true }));

  d.gap(8);
  const docs = [invRefLabel(s) + (s.meta.invoiceNo ? ` No. ${s.meta.invoiceNo}` : ""), "Packing List"];
  if (sp.blNo) docs.push(`Bill of Lading No. ${sp.blNo} (copy)`);
  if (pa.docsExtra.trim()) docs.push(...pa.docsExtra.split(/\n+/).map((x) => x.trim()).filter(Boolean));
  const blocks = [d.cell({ label: "Documents attached", lines: docs.map((x) => ({ text: `• ${x}` })) })];
  const bp = s.bank.show ? bankPairs(s.bank) : [];
  const due = [];
  if (T.total) due.push(["Amount due", `${fmtMoney(T.total)}${cur ? " " + cur : ""}`]);
  if (s.shipment.paymentTerms) due.push(["Payment terms", s.shipment.paymentTerms]);
  const pay = [...due, ...bp];
  if (pay.length) blocks.push(d.kv("Payment", pay, 70));
  d.row(blocks, blocks.length === 2 ? [0.5, 0.5] : [1]);
  if (pa.notes.trim()) { d.gap(6); d.row([d.cell({ label: "Remarks", lines: [{ text: pa.notes.trim(), color: C.ink }] })], [1]); }
  d.gap(6);
  d.row([d.sign("", signInfo(s, s.meta.invoiceDate))], [0.5]);
  d.finish();
}


/* ================================================================== Palet bazlı packing list */

function renderPalletList(ctx, s) {
  const no = s.meta.plNo || s.meta.invoiceNo || "—";
  const d = new Doc(ctx, "DETAILED PACKING LIST", no);
  if (!ctx.hasLetterhead) d.plainHeader(s.seller);
  d.docTitle("PACKING LIST — BY PALLET / PACKAGE");
  const pairs = [["Packing List No.", no, true], ["Date", fmtDate(s.meta.invoiceDate)]];
  if (s.meta.invoiceNo) pairs.push([invRefLabel(s), s.meta.invoiceNo]);
  if (s.meta.proformaNo) pairs.push(["Proforma Invoice", [s.meta.proformaNo, fmtDate(s.meta.proformaDate)].filter(Boolean).join(" / ")]);
  if (s.meta.orderRef) pairs.push(["Order Ref.", s.meta.orderRef]);
  const inc = incotermText(s);
  if (inc) pairs.push(["Terms of Delivery", inc]);
  d.partyWithGrid(partyBlock(d, "Seller / Exporter", s.seller), pairs);
  partiesRows(d, s);
  d.infoGrid(shipmentPairs(s, "pl"));
  d.gap(9);

  const pal = s.pallets;
  const vols = pal.map((p) => palletVolume(p));
  const anyVol = vols.some((v) => v != null);
  const anyDims = pal.some((p) => String(p.dimensions).trim());
  const sum = (k) => pal.reduce((a, p) => a + (num(p[k]) || 0), 0);
  const cols = [
    { key: "no", title: "Pallet / Pkg No.", align: "center", min: 40, max: 62 },
    { key: "type", title: "Type", align: "center", min: 54, max: 76 },
    { key: "contents", title: "Contents", flex: true },
    ...(anyDims ? [{ key: "dims", title: "Dimensions (cm)", align: "center", min: 52, max: 88 }] : []),
    { key: "net", title: "Net Wt. (kg)", align: "right", min: 40, max: 64 },
    { key: "gross", title: "Gross Wt. (kg)", align: "right", min: 42, max: 64 },
    ...(anyVol ? [{ key: "vol", title: "Volume (m³)", align: "right", min: 38, max: 56 }] : [])
  ];
  const rows = pal.map((p, i) => ({
    cells: { no: p.no || String(i + 1), type: (p.type || "").toUpperCase(), contents: p.contents, dims: p.dimensions, net: fmtWeight(num(p.net)), gross: fmtWeight(num(p.gross)), vol: vols[i] != null ? fmtVolume(vols[i]) : "" }
  }));
  if (!rows.length) rows.push({ cells: { contents: "—" } });
  else rows.push({ bold: true, fill: true, cells: { contents: `TOTAL: ${pal.length} PALLET / PACKAGE(S)`, net: sum("net") ? fmtWeight(sum("net")) : "", gross: sum("gross") ? fmtWeight(sum("gross")) : "", vol: anyVol ? fmtVolume(vols.reduce((a, v) => a + (v || 0), 0)) : "" } });
  d.table(cols, rows);

  d.gap(8);
  const sm = [];
  if (pal.length) sm.push(["Total Packages", `${pal.length}`]);
  if (sum("net")) sm.push(["Net Weight", `${fmtWeight(sum("net"))} KG`]);
  if (sum("gross")) sm.push(["Gross Weight", `${fmtWeight(sum("gross"))} KG`]);
  if (anyVol) sm.push(["Volume", `${fmtVolume(vols.reduce((a, v) => a + (v || 0), 0))} M³`]);
  const blocks = [], fr = [];
  if (sm.length) { blocks.push(d.kv("Shipment summary", sm, 70)); fr.push(0.5); }
  if (s.packing.marks) { blocks.push(d.cell({ label: "Marks & Numbers", lines: [{ text: s.packing.marks, color: C.ink }] })); fr.push(0.5); }
  if (blocks.length) d.row(blocks, fr.length === 1 ? [0.5] : fr);
  d.gap(6);
  d.row([d.sign("", signInfo(s, s.meta.invoiceDate))], [0.5]);
  d.finish();
}

/* ================================================================== CMR */

function renderCmr(ctx, s) {
  const T = computeTotals(s);
  const c = s.cmr, sh = s.shipment;
  const no = s.meta.invoiceNo || "—";
  const d = new Doc(ctx, "CMR CONSIGNMENT NOTE", no);
  if (!ctx.hasLetterhead) d.plainHeader(s.seller);
  d.docTitle("CMR — INTERNATIONAL CONSIGNMENT NOTE");
  d.text("DRAFT FOR REFERENCE. Data prepared in CMR box order; the legally binding note is the numbered CMR form signed by the parties.", d.x0, d.y - 3, { size: S.label, color: C.muted, cs: 0.3 });
  d.gap(10);
  const party = (label, p) => partyBlock(d, label, p);
  const txt = (label, lines, minH = 40) => d.cell({ label, lines: lines.filter((l) => l.text).length ? lines.filter((l) => l.text) : [{ text: "—", color: C.muted }], minH });
  const carrierLines = [{ text: c.carrier, font: "s", size: S.name, color: C.ink }];
  if (c.plate) carrierLines.push({ text: `Vehicle / trailer plate: ${c.plate}`, size: S.small, color: C.muted });
  d.row([party("1  Sender (name, address, country)", s.seller), txt("16  Carrier (name, address, country)", carrierLines, 58)], [0.5, 0.5]);
  d.row([party("2  Consignee (name, address, country)", consigneeOf(s)), txt("17  Successive carriers", [], 58)], [0.5, 0.5]);
  d.row([
    txt("3  Place of delivery of the goods", [{ text: c.deliveryPlace || sh.finalDestination || sh.portDischarge, color: C.ink }]),
    txt("18  Carrier's reservations and observations", [{ text: c.reservations, color: C.ink }])
  ], [0.5, 0.5]);
  d.row([
    txt("4  Place and date of taking over the goods", [{ text: [c.takingPlace || sh.portLoading, fmtDate(c.takingDate)].filter(Boolean).join(" — "), color: C.ink }]),
    txt("19  Special agreements", [{ text: c.special, color: C.ink }])
  ], [0.5, 0.5]);
  d.row([
    txt("5  Documents attached", [{ text: c.docs, color: C.ink }]),
    txt("20  To be paid by", [{ text: c.payment === "forward" ? "CARRIAGE FORWARD (CONSIGNEE)" : "CARRIAGE PAID (SENDER)", font: "s", color: C.ink }])
  ], [0.5, 0.5]);
  d.gap(8);

  const hsAny = s.items.some((it) => it.hsCode);
  const cols = [
    { key: "marks", title: "6  Marks and Nos", min: 56, max: 100 },
    { key: "pk", title: "7  Number of packages", align: "right", min: 46, max: 74 },
    { key: "pack", title: "8  Method of packing", align: "center", min: 48, max: 82 },
    { key: "desc", title: "9  Nature of the goods", flex: true },
    ...(hsAny ? [{ key: "hs", title: "10  Statistical No.", min: 48, max: 72 }] : []),
    { key: "gw", title: "11  Gross weight, kg", align: "right", min: 46, max: 70 },
    { key: "m3", title: "12  Volume, m³", align: "right", min: 42, max: 62 }
  ];
  const rows = s.items.map((it, i) => ({
    cells: {
      marks: i === 0 ? (s.packing.marks || "") : "", pk: fmtQty(num(it.packages)), pack: itemPackageType(it, s).toUpperCase(),
      desc: it.description, hs: it.hsCode, gw: fmtWeight(num(it.grossWeight)), m3: fmtVolume(num(it.volume))
    }
  }));
  if (!rows.length) rows.push({ cells: { desc: "—" } });
  else rows.push({ bold: true, fill: true, cells: { desc: "TOTAL", pk: T.packages ? fmtQty(T.packages) : "", gw: T.gross ? fmtWeight(T.gross) : "", m3: T.volume ? fmtVolume(T.volume) : "" } });
  d.table(cols, rows);

  d.gap(8);
  d.row([
    txt("13  Sender's instructions (customs and other formalities)", [{ text: c.instructions, color: C.ink }]),
    txt("15  Cash on delivery", [{ text: c.cod ? `${c.cod} ${(s.meta.currency || "").toUpperCase()}`.trim() : "", color: C.ink }])
  ], [0.5, 0.5]);
  d.row([txt("21  Established in", [{ text: [c.takingPlace || s.sign.place, fmtDate(s.meta.invoiceDate)].filter(Boolean).join(" — "), color: C.ink }], 30)], [1]);
  const sig = (label, who) => d.cell({ label, lines: [{ text: who || " ", size: S.small, color: C.muted }], minH: 78 });
  d.row([
    sig("22  Sender's signature and stamp", [s.sign.name, s.sign.title].filter(Boolean).join(", ")),
    sig("23  Carrier's signature and stamp", ""),
    sig("24  Goods received (date, signature)", "")
  ], [1 / 3, 1 / 3, 1 / 3]);
  d.finish();
}

/* ================================================================== Gümrük vekaletnamesi */

function renderPoa(ctx, s) {
  const p = s.poa, sh = s.shipment;
  const principal = p.grantor === "buyer" ? s.buyer : s.seller;
  const no = `POA-${s.meta.invoiceNo || "—"}`;
  const d = new Doc(ctx, "POWER OF ATTORNEY", no);
  if (!ctx.hasLetterhead) d.plainHeader(s.seller);
  d.docTitle("POWER OF ATTORNEY — CUSTOMS CLEARANCE");
  const pairs = [["Reference", no, true], ["Date", fmtDate(s.meta.invoiceDate)]];
  if (p.validFrom) pairs.push(["Valid From", fmtDate(p.validFrom)]);
  if (p.validUntil) pairs.push(["Valid Until", fmtDate(p.validUntil)]);
  d.partyWithGrid(partyBlock(d, "Principal (grantor)", principal), pairs);
  d.row([d.cell({ label: "Attorney (customs broker / agent)", lines: [{ text: p.attorney || "—", font: "s", size: S.name, color: p.attorney ? C.ink : C.muted }], minH: 58 })], [1]);
  d.gap(6);
  const where = p.country.trim() ? `the customs authorities of ${p.country.trim()}` : "the competent customs authorities";
  d.row([d.cell({ label: "Appointment", lines: [{ text: `The Principal named above hereby appoints the Attorney named above, with full power of substitution, to represent the Principal before ${where} and any other competent authority in all matters relating to the customs clearance of the goods referred to in this document, and specifically:`, color: C.ink }] })], [1]);
  d.row([d.cell({ label: "Scope of authority", lines: [{ text: p.scope || "—", color: C.ink }] })], [1]);

  const ref = [];
  if (s.meta.invoiceNo) ref.push([invRefLabel(s), [s.meta.invoiceNo, fmtDate(s.meta.invoiceDate)].filter(Boolean).join(" / ")]);
  if (s.meta.proformaNo) ref.push(["Proforma Invoice", [s.meta.proformaNo, fmtDate(s.meta.proformaDate)].filter(Boolean).join(" / ")]);
  if (s.meta.orderRef) ref.push(["Order Ref.", s.meta.orderRef]);
  const goods = s.items.filter((it) => it.description.trim()).map((it) => it.description.trim().replace(/\s*\n\s*/g, " ")).slice(0, 4).join("; ");
  if (goods) ref.push(["Goods", goods + (s.items.length > 4 ? "; …" : "")]);
  if (sh.portLoading || sh.portDischarge) ref.push(["Route", [sh.portLoading, sh.portDischarge].filter(Boolean).join(" → ")]);
  if (sh.countryOrigin) ref.push(["Country of Origin", originLabel(s)]);
  if (ref.length) { d.gap(6); d.row([d.kv("Consignment", ref, 92)], [1]); }
  d.gap(6);
  d.row([d.cell({ label: "Validity and liability", lines: [{ text: `This power of attorney is valid ${p.validUntil ? "until " + fmtDate(p.validUntil) : "until revoked in writing"}. The Principal accepts all acts performed by the Attorney within the scope of this authority as its own.`, size: S.body }, ...(p.notes.trim() ? [{ text: p.notes.trim(), color: C.ink }] : [])] })], [1]);
  d.gap(6);
  d.row([d.sign("", signInfo(s, s.meta.invoiceDate))], [0.5]);
  d.finish();
}


/* ================================================================== Satış sözleşmesi taslağı */

function renderContract(ctx, s) {
  const T = computeTotals(s);
  const c = s.contract, sh = s.shipment;
  const cur = (s.meta.currency || "").toUpperCase();
  const money = (v) => `${fmtMoney(v)}${cur ? " " + cur : ""}`;
  const no = c.no || `SC-${s.meta.invoiceNo || "—"}`;
  const d = new Doc(ctx, "SALES CONTRACT", no);
  if (!ctx.hasLetterhead) d.plainHeader(s.seller);
  d.docTitle("SALES CONTRACT");
  const pairs = [["Contract No.", no, true], ["Date", fmtDate(s.meta.invoiceDate)]];
  if (c.place) pairs.push(["Place", c.place]);
  if (s.meta.proformaNo) pairs.push(["Proforma Invoice", [s.meta.proformaNo, fmtDate(s.meta.proformaDate)].filter(Boolean).join(" / ")]);
  d.partyWithGrid(partyBlock(d, "Seller", s.seller), pairs);
  d.row([partyBlock(d, "Buyer", s.buyer)], [1]);
  d.gap(10);

  let n = 0;
  const art = (title, text) => d.article(++n, title, text);
  art("Subject of the contract", "The Seller agrees to sell and the Buyer agrees to buy the goods specified in Article 2 (the \"Goods\") on the terms and conditions set out in this Contract.");

  /* 2. Mallar ve fiyat */
  d.article(++n, "Goods, quantity and price", "");
  const anyHs = s.items.some((it) => it.hsCode);
  const cols = [
    { key: "no", title: "No", align: "center", min: 18, max: 24 },
    { key: "desc", title: "Description of Goods", flex: true },
    ...(anyHs ? [{ key: "hs", title: "HS Code", min: 42, max: 64 }] : []),
    { key: "qty", title: "Qty", align: "right", min: 30, max: 62 },
    { key: "unit", title: "Unit", align: "center", min: 26, max: 40 },
    { key: "price", title: `Unit Price ${cur}`.trim(), align: "right", min: 44, max: 72 },
    { key: "amount", title: `Amount ${cur}`.trim(), align: "right", min: 52, max: 84 }
  ];
  const rows = s.items.map((it, i) => ({
    cells: { no: String(i + 1), desc: it.description, hs: it.hsCode, qty: fmtQty(num(it.qty)), unit: (it.unit || "").toUpperCase(), price: fmtPrice(num(it.unitPrice)), amount: fmtMoney(lineAmount(it)) }
  }));
  if (!rows.length) rows.push({ cells: { desc: "—" } });
  else rows.push({ bold: true, fill: true, cells: { desc: `TOTAL${T.hasCharges ? " (INCL. CHARGES)" : ""}`, amount: fmtMoney(T.total) } });
  d.table(cols, rows);
  d.gap(5);
  const priceNote = [`The total contract value is ${money(T.total)}`];
  const inc = incotermText(s);
  if (inc) priceNote[0] += `, on ${inc} terms`;
  priceNote[0] += ".";
  if (cur && T.total) priceNote.push(amountInWords(T.total, cur).replace(/^SAY: /, "In words: "));
  d.para(priceNote.join(" "));
  d.gap(6);

  art("Delivery", [
    inc ? `Terms of delivery: ${inc}.` : "",
    sh.portLoading ? `Port / place of loading: ${sh.portLoading}.` : "",
    sh.portDischarge ? `Port / place of discharge: ${sh.portDischarge}.` : "",
    sh.finalDestination ? `Final destination: ${sh.finalDestination}.` : "",
    sh.transportMode ? `Mode of transport: ${sh.transportMode}.` : "",
    c.delivery
  ].filter(Boolean).join("\n"));

  const bp = s.bank.show ? bankPairs(s.bank) : [];
  art("Payment", [
    sh.paymentTerms ? `Terms of payment: ${sh.paymentTerms}.` : "",
    `All payments shall be made in ${cur || "the contract currency"} by bank transfer without deduction of bank charges of the Buyer's bank.`,
    bp.length ? `Seller's bank details: ${bp.map(([k, v]) => `${k}: ${v}`).join("; ")}.` : "",
    c.lateInterest.trim() ? `In case of late payment, interest of ${c.lateInterest.trim()} shall accrue on the overdue amount.` : ""
  ].filter(Boolean).join("\n"));

  art("Packing and marking", [
    `The Goods shall be packed in ${(s.packing.packageType || "export-worthy packaging").toLowerCase()} suitable for the agreed mode of transport and shall be marked as instructed by the Buyer.`,
    s.packing.marks ? `Shipping marks: ${s.packing.marks.replace(/\s*\n\s*/g, " / ")}.` : ""
  ].filter(Boolean).join("\n"));
  art("Quality and warranty", c.warranty);
  art("Inspection and claims", c.claims);
  art("Documents", `The Seller shall provide the following documents: ${c.documents}`);
  if (c.forceMajeure) art("Force majeure", "Neither party shall be liable for failure or delay in performing its obligations if caused by events beyond its reasonable control, including natural disasters, war, embargo, strikes, epidemic or governmental measures. The affected party shall notify the other party without delay. If such an event lasts longer than 90 days, either party may terminate the Contract for the undelivered part by written notice.");
  art("Governing law and disputes", `${c.law}\n${c.disputes}`);
  art("General provisions", ["This Contract constitutes the entire agreement between the parties on its subject and supersedes all prior negotiations. Any amendment must be made in writing and signed by both parties. Neither party may assign its rights or obligations without the written consent of the other. This Contract is made in two original counterparts, one for each party.", c.extra.trim()].filter(Boolean).join("\n"));

  d.gap(6);
  const who = [s.sign.name, s.sign.title].filter(Boolean).join(", ");
  d.row([
    d.sign("", { name: who ? s.sign.name : "", title: s.sign.title, place: s.sign.place, date: fmtDate(s.meta.invoiceDate) }, `FOR THE SELLER${s.seller.name ? " — " + s.seller.name.toUpperCase().slice(0, 28) : ""}`),
    d.sign("", { name: "", title: "", place: "", date: "" }, `FOR THE BUYER${s.buyer.name ? " — " + s.buyer.name.toUpperCase().slice(0, 28) : ""}`)
  ], [0.5, 0.5]);
  d.finish();
}

/* ================================================================== Kambiyo senedi (poliçe / bono) */

function tenorText(b) {
  const days = num(b.days) || 0;
  switch (b.tenor) {
    case "afterSight": return `AT ${days} DAYS AFTER SIGHT`;
    case "afterBL": return `AT ${days} DAYS AFTER DATE OF BILL OF LADING`;
    case "afterInvoice": return `AT ${days} DAYS AFTER INVOICE DATE`;
    case "fixed": return b.dueDate ? `ON ${fmtDate(b.dueDate).toUpperCase()}` : "ON THE DUE DATE";
    default: return "AT SIGHT";
  }
}

function renderBill(ctx, s) {
  const T = computeTotals(s);
  const b = s.bill;
  const isNote = b.kind === "note";
  const cur = (s.meta.currency || "").toUpperCase();
  const amount = num(b.amount) != null ? num(b.amount) : T.total;
  const title = isNote ? "PROMISSORY NOTE" : "BILL OF EXCHANGE";
  const no = b.no || s.meta.invoiceNo || "—";
  const d = new Doc(ctx, title, no);
  if (!ctx.hasLetterhead) d.plainHeader(s.seller);
  d.docTitle(title);

  const set = b.set === "second" ? "SECOND" : "FIRST";
  const other = b.set === "second" ? "FIRST" : "SECOND";
  const money = `${fmtMoney(amount)}${cur ? " " + cur : ""}`;
  const pairs = [[isNote ? "Note No." : "Exchange No.", no, true], ["Date of Issue", fmtDate(s.meta.invoiceDate)]];
  if (b.place) pairs.push(["Place of Issue", b.place]);
  pairs.push([b.tenor === "fixed" ? "Due Date" : "Tenor", b.tenor === "fixed" ? (fmtDate(b.dueDate) || "—") : tenorText(b).replace(/^AT /, "")]);
  d.partyWithGrid(d.cell({ label: isNote ? "Amount" : "Exchange for", lines: [{ text: money, font: "b", size: 17, color: C.ink }], minH: 58 }), pairs);

  const payee = (b.payTo || s.seller.name || "—").toUpperCase();
  const drawee = (s.buyer.name || "—").toUpperCase();
  const words = amount ? amountInWords(amount, cur).replace(/^SAY: ONLY /, "") : "—";
  const text = isNote
    ? `${tenorText(b)} WE, ${drawee}, PROMISE TO PAY TO THE ORDER OF ${payee} THE SUM OF ${words}. VALUE RECEIVED${s.meta.invoiceNo ? ` (INVOICE NO. ${s.meta.invoiceNo.toUpperCase()})` : ""}.`
    : `${tenorText(b)} OF THIS ${set} OF EXCHANGE (${other} OF THE SAME TENOR AND DATE BEING UNPAID) PAY TO THE ORDER OF ${payee} THE SUM OF ${words}. VALUE RECEIVED${s.meta.invoiceNo ? ` FOR GOODS PER INVOICE NO. ${s.meta.invoiceNo.toUpperCase()}` : ""}.`;
  d.row([d.cell({ label: isNote ? "Promise to pay" : "Order to pay", lines: [{ text, font: "s", size: S.body + 0.6, color: C.ink }], minH: 70 })], [1]);

  if (isNote) {
    d.row([partyBlock(d, "Maker (debtor)", s.buyer), partyBlock(d, "Payee (beneficiary)", b.payTo ? { name: b.payTo, address: "", taxId: "", contact: "" } : s.seller)], [0.5, 0.5]);
  } else {
    d.row([partyBlock(d, "Drawee (to)", s.buyer), partyBlock(d, "Drawer", s.seller)], [0.5, 0.5]);
  }
  const extra = [];
  if (b.drawnUnder.trim()) extra.push(["Drawn Under", b.drawnUnder.trim()]);
  if (s.meta.invoiceNo) extra.push([invRefLabel(s), [s.meta.invoiceNo, fmtDate(s.meta.invoiceDate)].filter(Boolean).join(" / ")]);
  if (s.meta.proformaNo) extra.push(["Proforma Invoice", [s.meta.proformaNo, fmtDate(s.meta.proformaDate)].filter(Boolean).join(" / ")]);
  if (s.meta.orderRef) extra.push(["Order Ref.", s.meta.orderRef]);
  if (extra.length) d.infoGrid(extra, 3);
  if (b.aval.trim()) { d.gap(6); d.row([d.cell({ label: "Aval (guarantee)", lines: [{ text: b.aval.trim(), color: C.ink }], minH: 46 })], [1]); }
  d.gap(8);
  // Poliçeyi keşideci (satıcı) imzalar; bonoyu borçlu (alıcı) imzalar, adını elle yazar
  const signer = isNote ? { name: "", title: "", place: b.place || "", date: fmtDate(s.meta.invoiceDate) } : { name: s.sign.name, title: s.sign.title, place: b.place || s.sign.place, date: fmtDate(s.meta.invoiceDate) };
  d.row([d.sign("", signer, isNote ? `SIGNATURE OF THE MAKER${s.buyer.name ? " — " + s.buyer.name.toUpperCase().slice(0, 26) : ""}` : "SIGNATURE OF THE DRAWER")], [0.5]);
  d.finish();
}

/* ================================================================== Etiketler (koli / palet) */

const LABEL_FORMATS = {
  a6x4: { page: null, cols: 2, rows: 2, label: "A6, 4 per A4 sheet" },
  a5x2: { page: null, cols: 1, rows: 2, label: "A5, 2 per A4 sheet" },
  thermal: { page: [100 * MM, 150 * MM], cols: 1, rows: 1, label: "100 × 150 mm thermal" }
};

function labelList(s, T) {
  const lb = s.labels;
  const origin = originLabel(s);
  if (lb.source === "pallets" && s.pallets.length) {
    const n = s.pallets.length;
    return s.pallets.map((p, i) => ({
      idx: p.no || String(i + 1), total: String(n), gross: num(p.gross), desc: p.contents, origin
    }));
  }
  const n = Math.max(1, Math.round(num(lb.count) || T.packages || 1));
  const desc = [...new Set(s.items.map((it) => it.description.trim().replace(/\s*\n\s*/g, " ")).filter(Boolean))].join("; ");
  const each = T.gross && n ? T.gross / n : null;
  return Array.from({ length: n }, (_, i) => ({ idx: String(i + 1), total: String(n), gross: each, desc, origin }));
}

function renderLabels(ctx, s) {
  const T = computeTotals(s);
  const lb = s.labels;
  const fmt = LABEL_FORMATS[lb.format] || LABEL_FORMATS.a6x4;
  const saved = { W: ctx.W, H: ctx.H, margins: ctx.margins, plain: ctx.plain, bg: ctx.bg };
  const pageSize = fmt.page || PAPER.A4;
  ctx.W = pageSize[0]; ctx.H = pageSize[1];
  const mg = fmt.page ? 0 : 8 * MM;
  ctx.margins = { top: mg, bottom: mg, left: mg, right: mg };
  ctx.plain = ctx.margins;
  ctx.bg = null;
  try {
    const d = new Doc(ctx, "LABELS", s.meta.invoiceNo || "—");
    const gw = ctx.W - 2 * mg, gh = ctx.H - 2 * mg;
    const cw = gw / fmt.cols, ch = gh / fmt.rows;
    const perPage = fmt.cols * fmt.rows;
    const labels = labelList(s, T);
    const to = consigneeOf(s);
    const k = Math.min(cw / 298, ch / 420) ;
    labels.forEach((L, i) => {
      if (i > 0 && i % perPage === 0) { d.page = ctx.pdf.addPage([ctx.W, ctx.H]); }
      const slot = i % perPage;
      const x = mg + (slot % fmt.cols) * cw;
      const yTop = mg + Math.floor(slot / fmt.cols) * ch;
      drawLabel(d, s, L, to, x + 6 * k, yTop + 6 * k, cw - 12 * k, ch - 12 * k, k, lb);
    });
  } finally {
    Object.assign(ctx, saved);
  }
}

function drawLabel(d, s, L, to, x, y, w, h, k, lb) {
  const f = (v) => v * k;
  const pad = f(10);
  d.rect(x, y, w, h, { stroke: C.dark, lw: 1.2 });
  let yy = y + pad;
  const lab = (t, yPos) => d.text(t.toUpperCase(), x + pad, yPos, { font: "s", size: f(7.4), color: C.muted, cs: 0.5 });
  // Alıcı
  lab("Ship to / Consignee", yy); yy += f(7.4) * 1.5 + f(2);
  const name = d.wrap((to.name || "—").toUpperCase(), "b", f(19), w - 2 * pad).slice(0, 2);
  name.forEach((t) => { d.text(t, x + pad, yy, { font: "b", size: f(19), color: C.ink }); yy += f(19) * 1.2; });
  d.wrap(to.address || "", "r", f(10), w - 2 * pad).slice(0, 3).forEach((t) => { d.text(t, x + pad, yy, { size: f(10), color: C.text }); yy += f(10) * 1.3; });
  yy += f(6);
  d.hline(x + pad, x + w - pad, yy, 0.8, C.line); yy += f(7);
  // Varış / sipariş
  const place = s.shipment.portDischarge || s.shipment.finalDestination || "";
  const ctry = s.shipment.countryDestination || "";
  const dest = ctry && !place.toLowerCase().includes(ctry.toLowerCase()) ? [place, ctry].filter(Boolean).join(", ") : place || ctry;
  const half = (w - 2 * pad) / 2;
  lab("Destination", yy); if (s.meta.orderRef) d.text("PO / ORDER REF.", x + pad + half, yy, { font: "s", size: f(7.4), color: C.muted, cs: 0.5 });
  yy += f(7.4) * 1.5 + f(2);
  const dl = d.wrap((dest || "—").toUpperCase(), "b", f(12), half - f(6)).slice(0, 2);
  dl.forEach((t, i) => d.text(t, x + pad, yy + i * f(12) * 1.2, { font: "b", size: f(12), color: C.ink }));
  if (s.meta.orderRef) d.wrap(s.meta.orderRef, "b", f(12), half - f(4)).slice(0, 2).forEach((t, i) => d.text(t, x + pad + half, yy + i * f(12) * 1.2, { font: "b", size: f(12), color: C.ink }));
  yy += Math.max(dl.length, 1) * f(12) * 1.2 + f(7);
  d.hline(x + pad, x + w - pad, yy, 0.8, C.line); yy += f(7);
  // İçerik
  lab("Contents", yy); yy += f(7.4) * 1.5 + f(2);
  const maxLines = 3;
  const cl = d.wrap(L.desc || "", "r", f(10), w - 2 * pad);
  cl.slice(0, maxLines).forEach((t, i) => d.text(i === maxLines - 1 && cl.length > maxLines ? t.replace(/.{0,2}$/, "…") : t, x + pad, yy + i * f(10) * 1.3, { size: f(10), color: C.text }));
  // Alt blok: koli no, ağırlık, menşe, gönderici
  const footH = f(86);
  let by = y + h - footH;
  d.hline(x + pad, x + w - pad, by, 1.2, C.dark); by += f(7);
  lab("Package", by); d.text("GROSS WEIGHT", x + pad + half, by, { font: "s", size: f(7.4), color: C.muted, cs: 0.5 });
  by += f(7.4) * 1.5;
  d.text(`${L.idx} / ${L.total}`, x + pad, by, { font: "b", size: f(26), color: C.ink });
  d.text(L.gross ? `${fmtWeight(L.gross)} KG` : "—", x + pad + half, by + f(6), { font: "b", size: f(15), color: C.ink });
  by += f(26) * 1.25 + f(3);
  if (L.origin) d.text(`MADE IN ${L.origin}`.slice(0, 40), x + pad, by, { font: "s", size: f(9), color: C.dark, cs: 0.4 });
  if (lb.showSeller && s.seller.name) d.text(`FROM: ${s.seller.name}`.slice(0, 54), x + pad, y + h - pad - f(8), { size: f(7.6), color: C.muted });
  // Uyarı bandı
  if (lb.banner && lb.banner.trim()) {
    const bh = f(18);
    d.rect(x, y + h - bh - f(0.6), w, bh, { fill: C.dark });
    d.text(lb.banner.trim().toUpperCase().slice(0, 36), x + w / 2, y + h - bh + f(4.5), { font: "b", size: f(10), color: C.white, align: "center", cs: 1 });
  }
}

/* ================================================================== Dışa açık */

/** which: 'ci' | 'pl' | 'both' | 'si' | 'bl' | 'origin' | 'all' → Uint8Array */
const TITLES = { ci: "Commercial Invoice", pl: "Packing List", both: "Commercial Invoice & Packing List", proforma: "Proforma Invoice", foc: "Free of Charge Invoice", si: "Shipping Instruction", bl: "Bill of Lading Draft", origin: "Declaration of Origin", loading: "Loading Instruction", coo: "Certificate of Origin Request", eur1: "EUR.1 Request", ins: "Insurance Request", trans: "Transport Order", prealert: "Pre-alert", pallet: "Packing List by Pallet", contract: "Sales Contract", bill: "Bill of Exchange", labels: "Labels", cmr: "CMR Consignment Note", poa: "Customs Power of Attorney", all: "Shipping Documents" };

export async function buildPdf(state, letterhead, which = "ci") {
  const ctx = await createContext(state, letterhead);
  ctx.pdf.setTitle(`${TITLES[which] || TITLES.ci} ${(which === "proforma" ? state.meta.proformaNo : state.meta.invoiceNo) || ""}`.trim());
  if (state.seller.name) ctx.pdf.setAuthor(state.seller.name);
  const all = which === "all";
  if (which === "ci" || which === "both" || all) renderInvoice(ctx, state, state.foc?.enabled && which !== "ci" ? "foc" : "ci"); // ücretsiz sevkiyatta "tümü"/"both" FOC üretir
  if (which === "foc") renderInvoice(ctx, state, "foc");
  if (which === "proforma") renderInvoice(ctx, state, "pi"); // "tüm belgeler"e girmez
  if (which === "pl" || which === "both" || all) renderPacking(ctx, state);
  if (which === "si" || all) renderTransport(ctx, state, "si");
  if (which === "bl" || all) renderTransport(ctx, state, "bl");
  if (which === "origin" || all) renderOrigin(ctx, state);
  for (const k of ["loading", "coo", "eur1"]) if (which === k || all) renderInstruction(ctx, state, k);
  if (which === "ins" || all) renderInsurance(ctx, state);
  if (which === "trans" || all) renderTransportOrder(ctx, state);
  if (which === "prealert" || all) renderPreAlert(ctx, state);
  if (which === "pallet" || all) renderPalletList(ctx, state);
  if (which === "cmr" || all) renderCmr(ctx, state);
  if (which === "poa" || all) renderPoa(ctx, state);
  if (which === "contract" || all) renderContract(ctx, state);
  if (which === "bill" || all) renderBill(ctx, state);
  if (which === "labels") renderLabels(ctx, state); // etiketler farklı sayfa boyutunda: "tüm belgeler"e girmez
  return ctx.pdf.save({ useObjectStreams: true });
}
