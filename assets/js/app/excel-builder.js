/* Düzenlenebilir Excel çıktısı (ExcelJS): "Commercial Invoice" ve "Packing List" sayfaları, formüllü. */
import { loadExcelJS } from "./loader.js";
import { computeTotals, itemCurrency, itemVatRate, num, lineAmount, fmtDate, amountInWords, packagesInWords, round } from "./doc-model.js";

const FONT = "Arial";
const GREY = "FFEEF1F2";
const BORDER = "FFB9C0C4";
const DARK = "FF2B3034";
const thin = { style: "thin", color: { argb: BORDER } };
const box = { top: thin, left: thin, bottom: thin, right: thin };

const MONEY = "#,##0.00";
const PRICE = "#,##0.00##";
const QTY = "#,##0.###";
const KG = "#,##0.00";
const VOL = "#,##0.000";

function colLetter(n) {
  let s = "";
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function setup(ws, widths) {
  ws.columns = widths.map((w) => ({ width: w }));
  ws.properties.defaultRowHeight = 15;
  ws.pageSetup = {
    paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    horizontalCentered: true,
    margins: { left: 0.45, right: 0.45, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 }
  };
  ws.views = [{ showGridLines: false }];
}

function put(ws, ref, value, style = {}) {
  const [a, b] = ref.split(":");
  if (b) ws.mergeCells(ref);
  const c = ws.getCell(a);
  c.value = value;
  c.font = { name: FONT, size: style.size || 9, bold: !!style.bold, color: style.color ? { argb: style.color } : undefined };
  c.alignment = { vertical: style.v || "top", horizontal: style.h || "left", wrapText: style.wrap !== false };
  if (style.fill) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: style.fill } };
  if (style.numFmt) c.numFmt = style.numFmt;
  if (style.border) {
    if (b) {
      const range = ws.getCell(a).address;
      const [c1, r1] = decode(range), [c2, r2] = decode(b);
      for (let r = r1; r <= r2; r++) for (let cc = c1; cc <= c2; cc++) ws.getCell(r, cc).border = box;
    } else c.border = box;
  }
  return c;
}

function decode(addr) {
  const m = addr.match(/^([A-Z]+)(\d+)$/);
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return [col, +m[2]];
}

function linesOf(text, charsPerLine) {
  return String(text || "").split("\n").reduce((a, l) => a + Math.max(1, Math.ceil(l.length / Math.max(10, charsPerLine))), 0);
}

function partyText(p) {
  return [p.name, p.address, p.taxId ? (/^(vat|tax|vkn|eori|inn|tin)/i.test(p.taxId) ? p.taxId : `Tax ID: ${p.taxId}`) : "", p.contact].filter(Boolean).join("\n") || "—";
}

/* İki yan yana taraf kutusu: etiket satırı + metin satırı */
function partiesPair(ws, r, left, right, split, last, charsL, charsR) {
  const L1 = colLetter(1), L2 = colLetter(split), R1 = colLetter(split + 1), R2 = colLetter(last);
  put(ws, `${L1}${r}:${L2}${r}`, left[0], { bold: true, size: 8, fill: GREY, border: true, color: "FF5F686D" });
  if (right) put(ws, `${R1}${r}:${R2}${r}`, right[0], { bold: true, size: 8, fill: GREY, border: true, color: "FF5F686D" });
  put(ws, `${L1}${r + 1}:${L2}${r + 1}`, left[1], { border: true });
  if (right) put(ws, `${R1}${r + 1}:${R2}${r + 1}`, right[1], { border: true });
  ws.getRow(r + 1).height = Math.max(linesOf(left[1], charsL), right ? linesOf(right[1], charsR) : 1) * 12 + 6;
  return r + 2;
}

function partyRows(ws, r, s, split, last, charsL, charsR) {
  r = partiesPair(ws, r, ["SELLER / EXPORTER", partyText(s.seller)], ["BUYER / IMPORTER", partyText(s.buyer)], split, last, charsL, charsR);
  const extra = [];
  if (!s.consignee.same) extra.push(["CONSIGNEE", partyText(s.consignee)]);
  if (s.notify.enabled) extra.push(["NOTIFY PARTY", partyText(s.notify)]);
  if (extra.length) r = partiesPair(ws, r, extra[0], extra[1] || null, split, last, charsL, charsR);
  return r;
}

/* Etiket/değer çiftleri, satır başına iki çift */
function infoPairs(ws, r, pairs, cols) {
  // cols: [[labelFrom,labelTo,valueFrom,valueTo], [..]]
  const list = pairs.filter(([, v]) => v);
  for (let i = 0; i < list.length; i += 2) {
    [list[i], list[i + 1]].forEach((p, k) => {
      if (!p) return;
      const [lf, lt, vf, vt] = cols[k];
      put(ws, `${colLetter(lf)}${r}:${colLetter(lt)}${r}`, p[0], { bold: true, size: 8, fill: GREY, border: true, color: "FF5F686D", v: "middle" });
      put(ws, `${colLetter(vf)}${r}:${colLetter(vt)}${r}`, p[1], { border: true, v: "middle" });
    });
    ws.getRow(r).height = 17;
    r++;
  }
  return r;
}

function docPairs(s, kind) {
  const sh = s.shipment;
  const inc = [sh.incoterm, sh.incotermPlace].filter(Boolean).join(" ").toUpperCase();
  const pi = [s.meta.proformaNo, fmtDate(s.meta.proformaDate)].filter(Boolean).join(" / ");
  const head = kind === "ci"
    ? [["INVOICE NO.", s.meta.invoiceNo], ["INVOICE DATE", fmtDate(s.meta.invoiceDate)]]
    : [["PACKING LIST NO.", s.meta.plNo || s.meta.invoiceNo], ["DATE", fmtDate(s.meta.invoiceDate)], ["COMMERCIAL INVOICE", s.meta.invoiceNo]];
  return [
    ...head,
    ["PROFORMA INVOICE", pi], ["ORDER REF.", s.meta.orderRef],
    ...(kind === "ci" ? [["CURRENCY", (s.meta.currency || "").toUpperCase()]] : []),
    ["TERMS OF DELIVERY", inc ? `${inc} (INCOTERMS® 2020)` : ""],
    ...(kind === "ci" ? [["TERMS OF PAYMENT", sh.paymentTerms]] : []),
    ["PORT / PLACE OF LOADING", sh.portLoading], ["PORT / PLACE OF DISCHARGE", sh.portDischarge],
    ["FINAL DESTINATION", sh.finalDestination], ["MODE OF TRANSPORT", sh.transportMode],
    ["COUNTRY OF ORIGIN", sh.countryOrigin], ["COUNTRY OF DESTINATION", sh.countryDestination],
    ["VESSEL / FLIGHT / VEHICLE", sh.vessel], ["CONTAINER / SEAL NO.", sh.containerNo],
    ["SHIPMENT DATE", fmtDate(sh.shipmentDate)]
  ];
}

function tableHeader(ws, r, titles) {
  titles.forEach((t, i) => put(ws, `${colLetter(i + 1)}${r}`, t, { bold: true, size: 8, fill: GREY, border: true, h: "center", v: "middle" }));
  ws.getRow(r).height = 26;
  return r + 1;
}

function signature(ws, r, last, s, withDecl) {
  const L = colLetter(last);
  if (withDecl && s.sign.showDeclaration && s.sign.declaration) {
    put(ws, `A${r}:${L}${r}`, s.sign.declaration, { size: 8 });
    ws.getRow(r).height = linesOf(s.sign.declaration, 110) * 11 + 6;
    r += 2;
  }
  r += 2;
  put(ws, `A${r}:D${r}`, "AUTHORISED SIGNATURE & STAMP", { bold: true, size: 8, color: "FF5F686D" });
  ws.getCell(`A${r}`).border = { top: { style: "thin", color: { argb: "FF6F787D" } } };
  r++;
  const who = [s.sign.name, s.sign.title].filter(Boolean).join(", ");
  if (who) { put(ws, `A${r}:D${r}`, who, { bold: true }); r++; }
  const where = [s.sign.place, fmtDate(s.meta.invoiceDate)].filter(Boolean).join(", ");
  if (where) { put(ws, `A${r}:D${r}`, where, { size: 8 }); r++; }
  return r;
}

/* ================================================================ Commercial invoice */

function invoiceSheet(wb, s) {
  const ws = wb.addWorksheet("Commercial Invoice");
  const anyCode = s.items.some((it) => it.code);
  const cur = (s.meta.currency || "").toUpperCase();
  const T = computeTotals(s);
  // Kalem bazlı para birimi / KDV oranı gerektiğinde tablonun sağına I (CUR) ve J (VAT %) eklenir
  const perLineCur = T.anyItemCurrency || T.mixedCurrency;
  const extra = [...(perLineCur ? ["CUR"] : []), ...(T.anyVatRate ? ["VAT %"] : [])];
  setup(ws, [5, anyCode ? 13 : 0.1, 44, 12, 10, 8, 13, 17, ...extra.map((x) => (x === "CUR" ? 7 : 8))]);
  if (!anyCode) ws.getColumn(2).hidden = true;

  put(ws, "A1:H1", "COMMERCIAL INVOICE", { bold: true, size: 16, v: "middle" });
  ws.getRow(1).height = 28;
  let r = 3;
  r = partyRows(ws, r, s, 4, 8, 62, 50);
  r++;
  r = infoPairs(ws, r, docPairs(s, "ci"), [[1, 2, 3, 4], [5, 6, 7, 8]]);
  r++;

  r = tableHeader(ws, r, ["NO", "CODE", "DESCRIPTION OF GOODS", "HS CODE", "QTY", "UNIT", `UNIT PRICE${perLineCur ? "" : " " + cur}`, `AMOUNT${perLineCur ? "" : " " + cur}`, ...extra]);
  const first = r;
  s.items.forEach((it, i) => {
    const q = num(it.qty), p = num(it.unitPrice);
    put(ws, `A${r}`, i + 1, { border: true, h: "center" });
    put(ws, `B${r}`, it.code || "", { border: true });
    put(ws, `C${r}`, it.description || "", { border: true });
    put(ws, `D${r}`, it.hsCode || "", { border: true, h: "center" });
    put(ws, `E${r}`, q ?? "", { border: true, h: "right", numFmt: QTY });
    put(ws, `F${r}`, (it.unit || "").toUpperCase(), { border: true, h: "center" });
    put(ws, `G${r}`, p ?? "", { border: true, h: "right", numFmt: PRICE });
    const amt = lineAmount(it);
    put(ws, `H${r}`, q != null && p != null ? { formula: `ROUND(E${r}*G${r},2)`, result: amt } : (amt ?? ""), { border: true, h: "right", numFmt: MONEY });
    let xc = 9;
    if (perLineCur) put(ws, `${colLetter(xc++)}${r}`, itemCurrency(it, s), { border: true, h: "center" });
    if (T.anyVatRate) put(ws, `${colLetter(xc++)}${r}`, itemVatRate(it, s) / 100, { border: true, h: "right", numFmt: "0.##%" });
    ws.getRow(r).height = Math.max(1, linesOf(it.description, 48)) * 12 + 4;
    r++;
  });
  const last = r - 1;
  const sumRef = s.items.length ? `SUM(H${first}:H${last})` : "0";

  // Toplamlar
  r++;
  const totals = [];
  const MONEY_CUR = cur ? `#,##0.00" ${cur}"` : MONEY;
  const line = (label, value, fmt = MONEY_CUR) => {
    put(ws, `E${r}:G${r}`, label, { bold: true, size: 8, h: "right", v: "middle", color: "FF5F686D" });
    put(ws, `H${r}`, value, { h: "right", numFmt: fmt, border: true, v: "middle" });
    totals.push(r);
    r++;
  };
  line("SUBTOTAL", { formula: sumRef, result: T.subtotal });
  const subRow = r - 1;
  const add = [];
  if (T.freight) { line("FREIGHT", T.freight); add.push(`H${r - 1}`); }
  if (T.insurance) { line("INSURANCE", T.insurance); add.push(`H${r - 1}`); }
  if (T.other) { line((s.charges.otherLabel || "OTHER CHARGES").toUpperCase(), T.other); add.push(`H${r - 1}`); }
  let disc = "";
  if (T.discount) { line("DISCOUNT", -T.discount); disc = `+H${r - 1}`; }
  if (T.vat) { line(`VAT${T.vatRate ? ` (${+T.vatRate.toFixed(2)}%)` : ""}`, T.vat); disc += `+H${r - 1}`; }
  const inc = [s.shipment.incoterm, s.shipment.incotermPlace].filter(Boolean).join(" ").toUpperCase();
  put(ws, `E${r}:G${r}`, `TOTAL ${inc}`.trim(), { bold: true, size: 9, h: "right", v: "middle", fill: DARK, color: "FFFFFFFF" });
  put(ws, `H${r}`, { formula: `H${subRow}${add.map((a) => "+" + a).join("")}${disc}`, result: T.total }, { bold: true, h: "right", v: "middle", numFmt: MONEY_CUR, fill: DARK, color: "FFFFFFFF" });
  ws.getRow(r).height = 20;
  r += 2;

  if (s.options.amountInWords && cur) {
    put(ws, `A${r}:B${r}`, "AMOUNT IN WORDS", { bold: true, size: 8, fill: GREY, border: true, color: "FF5F686D", v: "middle" });
    put(ws, `C${r}:H${r}`, amountInWords(T.total, cur), { bold: true, border: true, v: "middle" });
    ws.getRow(r).height = Math.max(1, linesOf(amountInWords(T.total, cur), 90)) * 12 + 6;
    r += 2;
  }

  if (s.options.showWeightsOnInvoice) {
    const type = s.packing.packageType || "PACKAGES";
    r = infoPairs(ws, r, [
      ["TOTAL PACKAGES", T.packages ? `${T.packages} ${type}` : ""],
      ["NET WEIGHT (KG)", T.net ? round(T.net, 2) : ""],
      ["GROSS WEIGHT (KG)", T.gross ? round(T.gross, 2) : ""],
      ["VOLUME (M³)", T.volume ? round(T.volume, 3) : ""]
    ], [[1, 2, 3, 4], [5, 6, 7, 8]]);
    r++;
  }

  if (s.bank.show) {
    const bp = [["BANK", s.bank.bankName], ["BRANCH", s.bank.branch], ["BENEFICIARY", s.bank.accountName], ["IBAN", s.bank.iban], ["SWIFT / BIC", s.bank.swift], ["ACCOUNT NO.", s.bank.accountNo]].filter(([, v]) => v);
    if (bp.length) {
      put(ws, `A${r}:H${r}`, "BANK DETAILS", { bold: true, size: 8, color: "FF5F686D" });
      r++;
      for (const [k, v] of bp) {
        put(ws, `A${r}:B${r}`, k, { bold: true, size: 8, fill: GREY, border: true, color: "FF5F686D", v: "middle" });
        put(ws, `C${r}:H${r}`, v, { border: true, v: "middle" });
        r++;
      }
      r++;
    }
  }
  signature(ws, r, 8, s, true);
  return ws;
}

/* ================================================================ Packing list */

function packingSheet(wb, s) {
  const ws = wb.addWorksheet("Packing List");
  setup(ws, [5, 38, 12, 9, 7, 8, 11, 11, 11, 15, 10]);
  const T = computeTotals(s);
  put(ws, "A1:K1", "PACKING LIST", { bold: true, size: 16, v: "middle" });
  ws.getRow(1).height = 28;
  let r = 3;
  r = partyRows(ws, r, s, 5, 11, 70, 62);
  r++;
  r = infoPairs(ws, r, docPairs(s, "pl"), [[1, 2, 3, 5], [6, 8, 9, 11]]);
  r++;
  r = tableHeader(ws, r, ["NO", "DESCRIPTION OF GOODS", "HS CODE", "QTY", "UNIT", "PKGS", "PKG TYPE", "NET WT (KG)", "GROSS WT (KG)", "DIMENSIONS (CM)", "VOLUME (M³)"]);
  const first = r;
  s.items.forEach((it, i) => {
    put(ws, `A${r}`, i + 1, { border: true, h: "center" });
    put(ws, `B${r}`, it.description || "", { border: true });
    put(ws, `C${r}`, it.hsCode || "", { border: true, h: "center" });
    put(ws, `D${r}`, num(it.qty) ?? "", { border: true, h: "right", numFmt: QTY });
    put(ws, `E${r}`, (it.unit || "").toUpperCase(), { border: true, h: "center" });
    put(ws, `F${r}`, num(it.packages) ?? "", { border: true, h: "right", numFmt: QTY });
    put(ws, `G${r}`, (it.packageType || "").toUpperCase(), { border: true, h: "center" });
    put(ws, `H${r}`, num(it.netWeight) ?? "", { border: true, h: "right", numFmt: KG });
    put(ws, `I${r}`, num(it.grossWeight) ?? "", { border: true, h: "right", numFmt: KG });
    put(ws, `J${r}`, it.dimensions || "", { border: true, h: "center" });
    put(ws, `K${r}`, num(it.volume) ?? "", { border: true, h: "right", numFmt: VOL });
    ws.getRow(r).height = Math.max(1, linesOf(it.description, 42)) * 12 + 4;
    r++;
  });
  const last = Math.max(first, r - 1);
  const sumOr = (col, override, itemSum) => {
    const hasOverride = override != null && Math.abs(override - itemSum) > 1e-9;
    if (hasOverride) return override;
    return s.items.length && itemSum ? { formula: `SUM(${col}${first}:${col}${last})`, result: itemSum } : "";
  };
  const style = { bold: true, border: true, fill: GREY, h: "right", v: "middle" };
  put(ws, `A${r}:C${r}`, "TOTAL", { ...style, h: "left" });
  put(ws, `D${r}`, T.qtyTotal != null ? { formula: `SUM(D${first}:D${last})`, result: T.qtyTotal } : "", { ...style, numFmt: QTY });
  put(ws, `E${r}`, T.qtyTotal != null ? T.qtyUnit : "", { ...style, h: "center" });
  put(ws, `F${r}`, sumOr("F", num(s.packing.totalPackages), T.itemPkgs), { ...style, numFmt: QTY });
  put(ws, `G${r}`, s.packing.packageType || "", { ...style, h: "center" });
  put(ws, `H${r}`, sumOr("H", num(s.packing.totalNet), T.itemNet), { ...style, numFmt: KG });
  put(ws, `I${r}`, sumOr("I", num(s.packing.totalGross), T.itemGross), { ...style, numFmt: KG });
  put(ws, `J${r}`, "", style);
  put(ws, `K${r}`, sumOr("K", num(s.packing.totalVolume), T.itemVol), { ...style, numFmt: VOL });
  ws.getRow(r).height = 18;
  r += 2;

  const pw = packagesInWords(T.packages, s.packing.packageType || "PACKAGES");
  r = infoPairs(ws, r, [
    ["TOTAL PACKAGES", pw],
    ["NET WEIGHT (KG)", T.net ? round(T.net, 2) : ""],
    ["GROSS WEIGHT (KG)", T.gross ? round(T.gross, 2) : ""],
    ["VOLUME (M³)", T.volume ? round(T.volume, 3) : ""],
    ["MARKS & NUMBERS", s.packing.marks]
  ], [[1, 2, 3, 5], [6, 8, 9, 11]]);
  r++;
  signature(ws, r, 11, s, false);
  return ws;
}

export async function buildXlsx(state) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = "logisticedo.com";
  wb.created = new Date();
  wb.calcProperties.fullCalcOnLoad = true;
  invoiceSheet(wb, state);
  packingSheet(wb, state);
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
