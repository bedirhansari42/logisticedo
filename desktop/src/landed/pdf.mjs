/* Landed cost PDF'i (pdf-lib). İngilizce, antetsiz, A4 yatay.
   deps verilmezse motorun yükleyicisi kullanılır (testler pdf-lib ve fontları kendisi verir). */

const A4L = [841.89, 595.28];
const M = 36;
const KIND = { freight: "Freight", insurance: "Insurance", deduct: "Turkey-side transport (deducted)", local: "Domestic cost" };
const KEY = { value: "value", weight: "weight", volume: "volume", qty: "quantity" };
const money = (n, dp = 2) => Number(n).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
const NOTES = [
  "Estimate only. Duty, EMY, KKDF, OTV and VAT rates and exchange rates are entered by the user; this is not a customs calculation or tax advice.",
  "CIF = goods + freight + insurance - Turkey-side transport included in the invoice price. Duty, EMY and KKDF are percentages of CIF.",
  "OTV base = CIF + duty + EMY + other duties. VAT base = CIF + duty + EMY + KKDF (if switched on) + other duties + OTV.",
  "Landed cost = CIF + duty + EMY + KKDF + other duties + OTV + domestic costs (+ VAT when VAT is not deductible). Amounts are rounded to 2 decimals at each step."
];

/** Sütun genişliklerini içeriğe göre hesaplar: sayılar asla kesilmez; kalan genişlik `flex` sütuna (ad) gider.
 *  Sığmazsa yazı boyutunu küçültür. widthOf(metin, kalın, boyut) → pt. */
export function layoutColumns({ cols, rows, widthOf, maxWidth, minFlex = 90, sizes = [7.4, 7, 6.6, 6.2, 5.8, 5.4, 5] }) {
  let widths, size;
  for (size of sizes) {
    widths = cols.map((c, i) => (c.flex ? 0 : Math.ceil(Math.max(widthOf(c.h, true, size), ...rows.map((r) => widthOf(r[i] ?? "", true, size)))) + 10));
    if (maxWidth - widths.reduce((a, b) => a + b, 0) >= minFlex) break;
  }
  const flex = cols.findIndex((c) => c.flex);
  if (flex >= 0) widths[flex] = Math.max(maxWidth - widths.reduce((a, b) => a + b, 0), 30);
  return { widths, size };
}

async function defaultDeps() {
  const { loadPdfLib, loadDocFonts } = await import("@engine/loader.js");
  const { PDFLib, fontkit } = await loadPdfLib();
  return { PDFLib, fontkit, fonts: await loadDocFonts() }; // [Regular, SemiBold, Bold]
}

export async function buildLandedPdf(input, result, deps) {
  if (!result?.ok) throw new Error("nothing to export");
  const { PDFLib, fontkit, fonts } = deps || (await defaultDeps());
  const { PDFDocument, rgb } = PDFLib;

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

  const [PW, PH] = A4L;
  const CW = PW - M * 2;
  let page = null;
  let y = 0; // yukarıdan aşağı
  const newPage = () => { page = pdf.addPage(A4L); y = M; };
  const ensure = (h) => { if (!page || y + h > PH - M) newPage(); };
  const text = (s, x, size, font = R, color = [0.15, 0.16, 0.17]) => page.drawText(safe(s), { x, y: PH - y - size, size, font, color: rgb(...color) });
  const fit = (s, font, size, maxW) => {
    let t = safe(s);
    while (t.length > 1 && font.widthOfTextAtSize(t, size) > maxW) t = t.slice(0, -2) + "…";
    return font.widthOfTextAtSize(t, size) > maxW ? t.slice(0, 1) : t;
  };
  const heading = (s) => { ensure(26); y += 6; text(s, M, 11, B); y += 18; };

  const table = (colDefs, rows, { rowH = 12, boldLast = false } = {}) => {
    const widthOf = (str, isBold, sz) => (isBold ? B : R).widthOfTextAtSize(safe(str), sz);
    const { widths, size } = layoutColumns({ cols: colDefs, rows, widthOf, maxWidth: CW });
    const cols = colDefs.map((c, i) => ({ ...c, w: widths[i] }));
    const head = () => {
      ensure(rowH * 2);
      page.drawRectangle({ x: M, y: PH - y - rowH + 2, width: CW, height: rowH, color: rgb(0.92, 0.93, 0.94) });
      let x = M + 3;
      for (const c of cols) { const h = fit(c.h, B, size, c.w - 6); text(h, c.right ? x + c.w - 6 - B.widthOfTextAtSize(h, size) : x, size, B); x += c.w; }
      y += rowH;
    };
    head();
    rows.forEach((r, ri) => {
      if (y + rowH > PH - M) { newPage(); head(); }
      const font = boldLast && ri === rows.length - 1 ? B : R;
      let x = M + 3;
      cols.forEach((c, i) => {
        const v = c.right ? safe(String(r[i] ?? "")) : fit(String(r[i] ?? ""), font, size, c.w - 8); // sayılar asla kesilmez
        text(v, c.right ? x + c.w - 6 - font.widthOfTextAtSize(v, size) : x, size, font);
        x += c.w;
      });
      page.drawLine({ start: { x: M, y: PH - y - rowH + 2 }, end: { x: M + CW, y: PH - y - rowH + 2 }, thickness: 0.3, color: rgb(0.85, 0.87, 0.88) });
      y += rowH;
    });
  };

  const yesNo = (v) => (v ? "yes" : "no");

  // ---- Başlık ve girişler ----
  newPage();
  text("Landed Cost Estimate", M, 18, B); y += 26;
  text(`${new Date().toISOString().slice(0, 10)}   ·   Invoice currency: ${input.currency}   ·   Incoterm: ${input.incoterm}   ·   Amounts in TRY unless stated`, M, 9, R, [0.35, 0.37, 0.38]); y += 13;
  const rates = Object.entries(input.rates).map(([c, r]) => `1 ${c} = ${money(r, 4)} TRY`).join("   ·   ") || "all amounts in TRY";
  text(`Exchange rates: ${rates}`, M, 9); y += 13;
  const flat = result.flatInsurance;
  text(`VAT deductible: ${yesNo(input.vatDeductible)}   ·   KKDF in VAT base: ${yesNo(input.kkdfInVat)}   ·   Flat insurance: ${flat.applied ? `3% of ${money(flat.base)} = ${money(flat.amountTry)}` : "not applied"}`, M, 9); y += 16;

  if (result.costs.length) {
    heading("Cost lines");
    table([{ h: "Cost line", flex: true }, { h: "Type" }, { h: "Amount", right: true }, { h: "Currency" }, { h: "Amount TRY", right: true }, { h: "Allocated by" }],
      result.costs.map((c, i) => [c.label, KIND[c.kind], money(input.costs[i].amount), input.costs[i].currency, c.applied ? money(c.amountTry) : "-", c.applied ? KEY[c.usedKey] : "included in price"]));
  }

  // ---- Kalem tablosu ----
  heading("Items");
  const cols = [{ h: "Item", flex: true }, { h: "Qty", right: true }, ...["Goods", "Freight", "Insurance", "CIF", "Duty", "EMY", "KKDF", "Other", "OTV", "VAT", "Domestic", "Landed", "Unit cost"].map((h) => ({ h, right: true }))];
  const rowOf = (it) => [it.name, money(it.qty, 0 + (Number.isInteger(it.qty) ? 0 : 2)), money(it.goods), money(it.freight), money(it.insurance), money(it.cif), money(it.duty), money(it.emy), money(it.kkdf), money(it.other), money(it.otv), money(it.vat), money(it.local), money(it.landed), money(it.unitCost, 4)];
  const t = result.totals;
  table(cols, [...result.items.map(rowOf), ["TOTAL", "", money(t.goods), money(t.freight), money(t.insurance), money(t.cif), money(t.duty), money(t.emy), money(t.kkdf), money(t.other), money(t.otv), money(t.vat), money(t.local), money(t.landed), ""]], { boldLast: true });

  // ---- Toplamlar ----
  heading("Summary");
  const line = (label, value) => { ensure(14); text(label, M, 9.5, B); text(`${money(value)} TRY`, M + 190, 9.5); y += 14; };
  line("Payable at customs", t.cash);
  line("Recoverable VAT", t.recoverableVat);
  line(input.vatDeductible ? "Landed cost (VAT excluded)" : "Landed cost (VAT included)", t.landed);
  if (result.warnings.length) { ensure(14); text(`Note: ${result.warnings.length} item(s) have no duty/EMY/KKDF/OTV rate entered, so those taxes are counted as 0.`, M, 8, R, [0.6, 0.35, 0.1]); y += 14; }

  y += 6;
  for (const n of NOTES) {
    const words = n.split(" ");
    let cur = "";
    const flush = () => { ensure(11); text(cur, M, 7.6, R, [0.4, 0.42, 0.43]); y += 10.5; };
    for (const wd of words) {
      if (R.widthOfTextAtSize(safe(`${cur} ${wd}`), 7.6) > CW) { flush(); cur = wd; } else cur = cur ? `${cur} ${wd}` : wd;
    }
    if (cur) flush();
  }

  return pdf.save();
}
