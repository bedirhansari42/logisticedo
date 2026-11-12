/* Konteyner yükleme planı PDF'i (pdf-lib). İngilizce, antetsiz, A4.
   deps verilmezse motorun yükleyicisi kullanılır (testler pdf-lib ve fontları kendisi verir). */
import { CONTAINERS } from "./containers.mjs";
import { groupByLayer } from "./layers.mjs";
import { makeColorOf } from "./colors.mjs";

const A4 = [595.28, 841.89];
const M = 40;
const REASON = { too_big: "does not fit this container", no_space: "no space left", cap: "quantity limit exceeded" };
const num = (n) => String(Number(Number(n).toFixed(1)));

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

async function defaultDeps() {
  const { loadPdfLib, loadDocFonts } = await import("@engine/loader.js");
  const { PDFLib, fontkit } = await loadPdfLib();
  return { PDFLib, fontkit, fonts: await loadDocFonts() }; // [Regular, SemiBold, Bold]
}

export async function buildPlanPdf(result, items, deps) {
  if (!result?.containers?.length) throw new Error("nothing to export");
  const { PDFLib, fontkit, fonts } = deps || await defaultDeps();
  const { PDFDocument, rgb } = PDFLib;
  const C = CONTAINERS[result.containerKey];
  const colorOf = makeColorOf(items);

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const R = await pdf.embedFont(fonts[0], { subset: true });
  const B = await pdf.embedFont(fonts[2], { subset: true });
  const fk = R.embedder?.font;
  const safe = (str) => {
    let out = "";
    for (const ch of String(str ?? "").replace(/[\r\n\t]+/g, " ")) {
      const cp = ch.codePointAt(0);
      if (cp < 32) continue;
      let ok = true;
      try { ok = fk ? fk.hasGlyphForCodePoint(cp) : true; } catch { ok = true; }
      out += ok ? ch : "?";
    }
    return out;
  };

  const [PW, PH] = A4;
  const CW = PW - M * 2;
  let page = null;
  let y = 0; // yukarıdan aşağı
  const newPage = () => { page = pdf.addPage(A4); y = M; };
  const ensure = (h) => { if (!page || y + h > PH - M - 14) newPage(); };
  const text = (s, x, size, font = R, color = [0.15, 0.16, 0.17]) => page.drawText(safe(s), { x, y: PH - y - size, size, font, color: rgb(...color) });
  const fit = (s, font, size, maxW) => {
    let t = safe(s);
    while (t.length > 1 && font.widthOfTextAtSize(t, size) > maxW) t = t.slice(0, -2) + "…";
    return font.widthOfTextAtSize(t, size) > maxW ? t.slice(0, 1) : t;
  };
  const heading = (s, size = 12) => { ensure(size + 12); text(s, M, size, B); y += size + 8; };

  const table = (cols, rows, rowH = 12, size = 7.8) => {
    const head = () => {
      ensure(rowH * 2);
      page.drawRectangle({ x: M, y: PH - y - rowH + 2, width: CW, height: rowH, color: rgb(0.92, 0.93, 0.94) });
      let x = M + 3;
      for (const c of cols) { text(c.h, c.right ? x + c.w - 6 - B.widthOfTextAtSize(c.h, size) : x, size, B); x += c.w; }
      y += rowH;
    };
    head();
    for (const r of rows) {
      if (y + rowH > PH - M - 14) { newPage(); head(); }
      let x = M + 3;
      cols.forEach((c, i) => {
        const v = fit(String(r[i] ?? ""), R, size, c.w - 8);
        text(v, c.right ? x + c.w - 6 - R.widthOfTextAtSize(v, size) : x, size);
        x += c.w;
      });
      page.drawLine({ start: { x: M, y: PH - y - rowH + 2 }, end: { x: M + CW, y: PH - y - rowH + 2 }, thickness: 0.3, color: rgb(0.85, 0.87, 0.88) });
      y += rowH;
    }
  };

  const drawTop = (left, w, placements, labels) => {
    const s = w / C.L;
    const h = C.W * s;
    page.drawRectangle({ x: left, y: PH - y - h, width: w, height: h, color: rgb(0.96, 0.97, 0.97), borderColor: rgb(0.35, 0.37, 0.38), borderWidth: 0.8 });
    const sorted = [...placements].sort((a, b) => a.z - b.z || a.seq - b.seq);
    for (const p of sorted) {
      page.drawRectangle({ x: left + p.x * s, y: PH - y - (p.y + p.dy) * s, width: p.dx * s, height: p.dy * s, color: rgb(...hex(colorOf(p.itemId))), opacity: 0.92, borderColor: rgb(0.12, 0.13, 0.14), borderWidth: 0.25 });
    }
    if (labels && sorted.length) {
      const minZ = sorted[0].z;
      for (const p of sorted.filter((q) => q.z === minZ)) {
        const fs = Math.min(7.5, p.dy * s * 0.5, p.dx * s * 0.34);
        if (fs < 3) continue;
        const t = String(p.seq);
        const tw = B.widthOfTextAtSize(t, fs);
        page.drawText(t, { x: left + (p.x + p.dx / 2) * s - tw / 2, y: PH - y - (p.y + p.dy / 2) * s - fs * 0.35, size: fs, font: B, color: rgb(1, 1, 1) });
      }
    }
    return h;
  };

  const legend = (placements) => {
    let x = M;
    for (const it of items) {
      const n = placements.filter((p) => p.itemId === it.id).length;
      if (!n) continue;
      const label = fit(`${it.name} × ${n}`, R, 7.8, 170);
      const w = 14 + R.widthOfTextAtSize(label, 7.8) + 14;
      if (x + w > M + CW) { x = M; y += 12; ensure(12); }
      page.drawRectangle({ x, y: PH - y - 8, width: 8, height: 8, color: rgb(...hex(colorOf(it.id))) });
      text(label, x + 12, 7.8);
      x += w;
    }
    y += 14;
  };

  // ------------------------------------------------------------------ Özet sayfası
  newPage();
  text("Container Load Plan", M, 20, B); y += 28;
  text(`Container: ${C.label}   ·   inner size ${C.L} × ${C.W} × ${C.H} cm   ·   ${new Date().toISOString().slice(0, 10)}`, M, 9, R, [0.35, 0.37, 0.38]); y += 14;
  const placedTotal = result.containers.reduce((s, c) => s + c.placements.length, 0);
  const used = result.containers.reduce((s, c) => s + c.usedVolumeCm3, 0);
  const pct = Math.round((used / (result.containers.length * C.L * C.W * C.H)) * 1000) / 10;
  const kg = Math.round(result.containers.reduce((s, c) => s + c.weightKg, 0) * 1000) / 1000;
  text(`Containers needed: ${result.containers.length}   ·   Units placed: ${placedTotal}   ·   Average fill: ${pct}%${kg > 0 ? `   ·   Total weight: ${kg} kg` : ""}`, M, 9); y += 13;
  text("Estimated plan: calculated with a heuristic, so it is not always the best possible arrangement.", M, 8, R, [0.45, 0.47, 0.48]); y += 20;

  heading("Items");
  const rows = items.map((it) => {
    const placed = result.containers.reduce((s, c) => s + c.placements.filter((p) => p.itemId === it.id).length, 0);
    const un = result.unplaced.filter((u) => u.itemId === it.id).reduce((s, u) => s + u.count, 0);
    return [it.name, `${num(it.l)} × ${num(it.w)} × ${num(it.h)}`, it.qty === null ? "max" : it.qty, it.palletized ? "yes" : "no", placed, un || ""];
  });
  table([
    { h: "Item", w: 175 }, { h: "L × W × H (cm)", w: 120 }, { h: "Qty", w: 50, right: true }, { h: "Pallet", w: 50 }, { h: "Placed", w: 60, right: true }, { h: "Not placed", w: 60, right: true }
  ], rows);
  y += 10;
  if (result.fill) { ensure(14); text(`As many as fit: ${result.fill.count} × ${items.find((i) => i.id === result.fill.itemId)?.name ?? ""}`, M, 9, B); y += 14; }
  if (result.fill?.reason) { ensure(12); text(result.fill.reason === "too_big" ? "The fill item does not fit this container." : "The first container is already full, so nothing more could be added to the fill item.", M, 8.5, R, [0.65, 0.25, 0.2]); y += 12; }
  const nameOf = (id) => items.find((i) => i.id === id)?.name ?? id;
  for (const u of result.unplaced.filter((x) => x.count > 0)) { ensure(12); text(`Not placed: ${nameOf(u.itemId)} × ${u.count} — ${REASON[u.reason] || u.reason}`, M, 8.5, R, [0.65, 0.25, 0.2]); y += 12; }
  if (result.capped) { ensure(12); text("The list is very large, so the calculation stopped when it reached its limit; the remaining units were not placed.", M, 8.5, R, [0.65, 0.25, 0.2]); y += 12; }

  // ------------------------------------------------------------------ Konteyner sayfaları
  result.containers.forEach((c, i) => {
    newPage();
    text(`Container ${i + 1} of ${result.containers.length}  ·  ${C.label}`, M, 15, B); y += 22;
    text(`Fill ${c.fillPct}%   ·   ${c.placements.length} units${c.weightKg > 0 ? `   ·   ${c.weightKg} kg` : ""}`, M, 9, R, [0.35, 0.37, 0.38]); y += 16;
    text("BACK WALL", M, 7, B, [0.45, 0.47, 0.48]);
    const dw = B.widthOfTextAtSize("DOOR", 7);
    text("DOOR", M + CW - dw, 7, B, [0.45, 0.47, 0.48]); y += 11;
    y += drawTop(M, CW, c.placements, true) + 8;
    text("Numbers show the loading order (back wall to door, stacks bottom to top). Upper layers are shown below.", M, 7.5, R, [0.45, 0.47, 0.48]); y += 14;
    legend(c.placements);

    const layers = groupByLayer(c.placements).slice(1);
    if (layers.length) {
      heading("Upper layers", 10);
      const w = (CW - 12) / 2;
      const h = C.W * (w / C.L);
      for (let k = 0; k < layers.length; k += 2) {
        ensure(h + 24);
        for (let j = 0; j < 2 && k + j < layers.length; j++) {
          const l = layers[k + j];
          const left = M + j * (w + 12);
          const saveY = y;
          text(`Layer ${k + j + 2}  ·  from ${num(l.z)} cm`, left, 7.5, B, [0.35, 0.37, 0.38]);
          y += 11;
          drawTop(left, w, l.placements, l.placements.length <= 150);
          y = saveY;
        }
        y += h + 22;
      }
    }

    y += 6;
    heading("Load sequence", 10);
    const seq = [...c.placements].sort((a, b) => a.seq - b.seq).map((p) => [
      p.seq, nameOf(p.itemId), `${num(p.x)} / ${num(p.y)} / ${num(p.z)}`, `${num(p.dx)} × ${num(p.dy)} × ${num(p.dz)}`, p.pallet ? "pallet" : ""
    ]);
    table([
      { h: "#", w: 36, right: true }, { h: "Item", w: 200 }, { h: "Position x / y / z (cm)", w: 130 }, { h: "Size (cm)", w: 110 }, { h: "", w: 39 }
    ], seq, 11, 7.4);
  });

  // sayfa numaraları
  const pages = pdf.getPages();
  pages.forEach((pg, i) => {
    const t = `${i + 1} / ${pages.length}`;
    pg.drawText(t, { x: PW - M - R.widthOfTextAtSize(t, 7.5), y: M / 2, size: 7.5, font: R, color: rgb(0.5, 0.52, 0.53) });
  });

  return pdf.save();
}
