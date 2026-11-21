/* Landed cost Excel çıktısı (ExcelJS): "Inputs" ve "Calculation" sayfaları, canlı formüllü.
   Formüller uygulama hesabıyla (calc.mjs) aynı sırada ve her adımda ROUND(...,2) ile çalışır; formülün yanına önbellek sonucu da yazılır.
   Ön izleyicilerde (Quick Look vb.) değerler görünsün diye. */
import { allocate, round } from "./money.mjs";
import { DEFAULTS } from "./rules.mjs";
import { cellValue, formula as fx } from "../../../assets/js/app/cell-value.js";

export const colName = (n) => {
  let s = "";
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

const MONEY = "#,##0.00";
const FIRST = 6; // ilk kalem satırı
const KIND_LABEL = { freight: "Freight (international)", insurance: "Insurance", deduct: "Turkey-side transport included in price (deducted)", local: "Domestic cost" };
const NOTES = [
  "Estimate only: duty, EMY, KKDF, OTV and VAT rates and exchange rates are entered by the user; this is not a customs calculation.",
  "CIF = goods + freight + insurance - Turkey-side transport included in the invoice price. Duty, EMY and KKDF are percentages of CIF.",
  "OTV base = CIF + duty + EMY + other duties. VAT base = CIF + duty + EMY + KKDF (if switched on) + other duties + OTV.",
  "Landed cost = CIF + duty + EMY + KKDF + other duties + OTV + domestic costs (+ VAT when VAT is not deductible).",
  "All amounts are rounded to 2 decimals at every step; shared costs give the remaining kurus to the last item."
];

export async function buildLandedXlsx(input, result, deps) {
  if (!result?.ok) throw new Error("nothing to export");
  const ExcelJS = deps?.ExcelJS || (await (await import("@engine/loader.js")).loadExcelJS());
  const wb = new ExcelJS.Workbook();
  wb.creator = "logisticedo";
  wb.calcProperties = { fullCalcOnLoad: true };
  const wsI = wb.addWorksheet("Inputs");
  const wsC = wb.addWorksheet("Calculation");

  const n = input.items.length;
  const LAST = FIRST + n - 1;
  const T = LAST + 1;
  const cur = input.currency;
  const bold = { bold: true };
  const head = (c) => { c.font = bold; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF1F2" } }; };

  // ---- Calculation sütun düzeni ----
  const cols = [];
  const add = (key, label, width = 13, fmt = MONEY) => cols.push({ key, label, width, fmt });
  add("name", "Item", 28, null); add("qty", "Qty", 9, "#,##0.###"); add("unitPrice", `Unit price (${cur})`, 13, "#,##0.00##");
  add("weightKg", "Weight (kg)", 11, "#,##0.###"); add("volumeM3", "Volume (m3)", 11, "#,##0.###");
  add("dutyRate", "Duty %", 8, "0.##"); add("emyRate", "EMY %", 8, "0.##"); add("kkdfRate", "KKDF %", 8, "0.##");
  add("otherRate", "Other duty %", 10, "0.##"); add("otherAmount", "Other duty (TRY)", 12); add("otvRate", "OTV %", 8, "0.##"); add("vatRate", "VAT %", 8, "0.##");
  add("goods", "Goods (TRY)");
  const lines = result.costs.map((c, idx) => ({ ...c, idx, cost: input.costs[idx] })).filter((c) => c.applied);
  for (const c of lines) {
    add(`c:${c.id}`, `${c.label} share`);
    if (c.kind === "local") add(`cv:${c.id}`, `${c.label} VAT share`);
  }
  add("flat", "Flat insurance share");
  for (const [k, label] of [["freight", "Freight"], ["insurance", "Insurance"], ["deduct", "Deducted"], ["local", "Domestic costs"], ["localVat", "Domestic VAT"], ["cif", "CIF (TRY)"], ["duty", "Duty"], ["emy", "EMY"], ["kkdf", "KKDF"], ["other", "Other duties"], ["otv", "OTV"], ["vatBase", "VAT base"], ["vat", "VAT"], ["landed", "Landed cost (TRY)"]]) add(k, label);
  add("unitCost", "Unit cost (TRY)", 13, "#,##0.0000");
  const L = {};
  cols.forEach((c, i) => { L[c.key] = colName(i + 1); });

  // ---- Inputs ----
  const curs = [...new Set([cur, ...Object.keys(input.rates), ...input.costs.map((c) => c.currency)])].filter((c) => c && c !== "TRY");
  const RATE_HEAD = 13;
  const ratesRow = {};
  curs.forEach((c, i) => { ratesRow[c] = RATE_HEAD + 1 + i; });
  const COST_HEAD = RATE_HEAD + curs.length + 2;
  const costRow = (idx) => COST_HEAD + 1 + idx;
  const rateRef = (c) => (c === "TRY" ? "1" : `$B$${ratesRow[c]}`);
  const rateOf = (c) => (c === "TRY" ? 1 : input.rates[c]);

  wsI.getCell("A1").value = cellValue("Landed cost - inputs"); wsI.getCell("A1").font = { bold: true, size: 13 };
  wsI.getCell("A2").value = "Estimate only: rates are entered by the user; this is not a customs calculation.";
  const kv = (row, label, value) => { wsI.getCell(`A${row}`).value = cellValue(label); wsI.getCell(`B${row}`).value = cellValue(value); };
  kv(4, "Invoice currency", cur);
  kv(5, "Incoterm", input.incoterm);
  kv(6, "VAT deductible (1 = yes, 0 = no)", input.vatDeductible ? 1 : 0);
  kv(7, "KKDF in VAT base (1 = yes, 0 = no)", input.kkdfInVat ? 1 : 0);
  kv(8, "Flat insurance applies (1 = yes, 0 = no)", result.flatInsurance.applied ? 1 : 0);
  kv(9, "Flat insurance rate (%)", DEFAULTS.flatInsuranceRate);
  const costsOf = (kind) => input.costs.map((c, idx) => (c.kind === kind ? `F${costRow(idx)}` : null)).filter(Boolean).join("+") || "0";
  kv(10, "Flat insurance base (TRY)", fx(`ROUND(Calculation!$${L.goods}$${T}-(${costsOf("deduct")})+(${costsOf("freight")}),2)`, result.flatInsurance.base));
  kv(11, "Flat insurance amount (TRY)", fx("ROUND(B10*B9/100*B8,2)", result.flatInsurance.amountTry));
  wsI.getCell(`A${RATE_HEAD}`).value = cellValue("Currency"); wsI.getCell(`B${RATE_HEAD}`).value = cellValue("Rate to TRY");
  head(wsI.getCell(`A${RATE_HEAD}`)); head(wsI.getCell(`B${RATE_HEAD}`));
  for (const c of curs) {
    wsI.getCell(`A${ratesRow[c]}`).value = cellValue(c);
    if (input.rates[c] != null) wsI.getCell(`B${ratesRow[c]}`).value = cellValue(input.rates[c]);
  }
  ["Cost line", "Type", "Amount", "Currency", "Rate to TRY", "Amount TRY", "Applied", "Allocation key", "VAT %", "VAT (TRY)"].forEach((h, i) => {
    const c = wsI.getCell(`${colName(i + 1)}${COST_HEAD}`); c.value = cellValue(h); head(c);
  });
  input.costs.forEach((c, idx) => {
    const r = costRow(idx), out = result.costs[idx];
    wsI.getCell(`A${r}`).value = cellValue(c.label);
    wsI.getCell(`B${r}`).value = cellValue(KIND_LABEL[c.kind]);
    wsI.getCell(`C${r}`).value = cellValue(c.amount);
    wsI.getCell(`D${r}`).value = cellValue(c.currency);
    wsI.getCell(`E${r}`).value = cellValue(c.currency === "TRY" ? 1 : fx(`B${ratesRow[c.currency]}`, rateOf(c.currency) ?? 0));
    wsI.getCell(`F${r}`).value = cellValue(fx(`ROUND(C${r}*E${r}*G${r},2)`, out.amountTry));
    wsI.getCell(`G${r}`).value = cellValue(out.applied ? 1 : 0);
    wsI.getCell(`H${r}`).value = cellValue(out.applied ? out.usedKey : "included in price");
    if (c.kind === "local") {
      wsI.getCell(`I${r}`).value = cellValue(c.vatRate ?? 0);
      wsI.getCell(`J${r}`).value = cellValue(fx(`ROUND(F${r}*I${r}/100,2)`, round((out.amountTry * (c.vatRate || 0)) / 100, 2)));
    }
  });
  wsI.getColumn(1).width = 40; wsI.getColumn(2).width = 22;
  for (let i = 3; i <= 10; i++) wsI.getColumn(i).width = 14;

  // ---- Calculation ----
  wsC.getCell("A1").value = cellValue("Landed cost - calculation (TRY)"); wsC.getCell("A1").font = { bold: true, size: 13 };
  wsC.getCell("A2").value = cellValue(NOTES[0]);
  cols.forEach((c, i) => {
    const hc = wsC.getCell(4, i + 1); hc.value = cellValue(c.label); head(hc); hc.alignment = { wrapText: true, vertical: "top" };
    wsC.getCell(5, i + 1).value = cellValue(c.key);
    wsC.getColumn(i + 1).width = c.width;
  });
  wsC.getRow(5).hidden = true;

  const wOf = { value: result.items.map((i) => i.goods), qty: input.items.map((i) => i.qty), weight: input.items.map((i) => i.weightKg), volume: input.items.map((i) => i.volumeM3) };
  const wCol = { value: L.goods, qty: L.qty, weight: L.weightKg, volume: L.volumeM3 };
  const split = (total, key) => (total === 0 ? result.items.map(() => 0) : allocate(total, wOf[key]));
  const shares = {};
  for (const c of lines) {
    shares[`c:${c.id}`] = split(c.amountTry, c.usedKey);
    if (c.kind === "local") shares[`cv:${c.id}`] = split(round((c.amountTry * (c.cost.vatRate || 0)) / 100, 2), c.usedKey);
  }
  shares.flat = split(result.flatInsurance.amountTry, "value");
  const shareSrc = {}; // sütun anahtarı → [toplam hücre başvurusu, ağırlık sütunu]
  for (const c of lines) {
    shareSrc[`c:${c.id}`] = [`Inputs!$F$${costRow(c.idx)}`, wCol[c.usedKey]];
    if (c.kind === "local") shareSrc[`cv:${c.id}`] = [`Inputs!$J$${costRow(c.idx)}`, wCol[c.usedKey]];
  }
  shareSrc.flat = ["Inputs!$B$11", L.goods];
  const sumOf = (kind) => lines.filter((c) => c.kind === kind).map((c) => `${L[`c:${c.id}`]}`);

  result.items.forEach((it, i) => {
    const r = FIRST + i, src = input.items[i];
    const f = (key, formula, value) => { wsC.getCell(`${L[key]}${r}`).value = cellValue(fx(formula, value)); };
    const v = (key, value) => { if (value != null) wsC.getCell(`${L[key]}${r}`).value = cellValue(value); };
    v("name", src.name); v("qty", src.qty); v("unitPrice", src.unitPrice); v("weightKg", src.weightKg); v("volumeM3", src.volumeM3);
    for (const k of ["dutyRate", "emyRate", "kkdfRate", "otherRate", "otherAmount", "otvRate", "vatRate"]) v(k, src[k]);
    f("goods", `ROUND(${L.qty}${r}*${L.unitPrice}${r}*${cur === "TRY" ? "1" : `Inputs!${rateRef(cur)}`},2)`, it.goods);
    for (const key of Object.keys(shareSrc)) {
      const [tot, w] = shareSrc[key];
      const col = L[key];
      const rng = `${w}$${FIRST}:${w}$${LAST}`;
      const formula = i < n - 1
        ? `IF(${tot}=0,0,ROUND(${tot}*${w}${r}/SUM(${rng}),2))`
        : n === 1 ? `ROUND(${tot},2)` : `ROUND(${tot}-SUM(${col}${FIRST}:${col}${LAST - 1}),2)`;
      f(key, formula, shares[key][i]);
    }
    const sum = (cells) => (cells.length ? `ROUND(${cells.map((c) => `${c}${r}`).join("+")},2)` : "0");
    f("freight", sum(sumOf("freight")), it.freight);
    f("insurance", sum([...sumOf("insurance"), L.flat]), it.insurance);
    f("deduct", sum(sumOf("deduct")), it.deduct);
    f("local", sum(sumOf("local")), it.local);
    f("localVat", sum(lines.filter((c) => c.kind === "local").map((c) => L[`cv:${c.id}`])), it.localVat);
    const c = (k) => `${L[k]}${r}`;
    f("cif", `ROUND(${c("goods")}+${c("freight")}+${c("insurance")}-${c("deduct")},2)`, it.cif);
    f("duty", `ROUND(${c("cif")}*${c("dutyRate")}/100,2)`, it.duty);
    f("emy", `ROUND(${c("cif")}*${c("emyRate")}/100,2)`, it.emy);
    f("kkdf", `ROUND(${c("cif")}*${c("kkdfRate")}/100,2)`, it.kkdf);
    f("other", `ROUND(${c("cif")}*${c("otherRate")}/100+${c("otherAmount")},2)`, it.other);
    f("otv", `ROUND(ROUND(${c("cif")}+${c("duty")}+${c("emy")}+${c("other")},2)*${c("otvRate")}/100,2)`, it.otv);
    f("vatBase", `ROUND(${c("cif")}+${c("duty")}+${c("emy")}+Inputs!$B$7*${c("kkdf")}+${c("other")}+${c("otv")},2)`, it.vatBase);
    f("vat", `ROUND(${c("vatBase")}*${c("vatRate")}/100,2)`, it.vat);
    f("landed", `ROUND(${c("cif")}+${c("duty")}+${c("emy")}+${c("kkdf")}+${c("other")}+${c("otv")}+${c("local")}+(1-Inputs!$B$6)*(${c("vat")}+${c("localVat")}),2)`, it.landed);
    f("unitCost", `ROUND(${c("landed")}/${c("qty")},4)`, it.unitCost);
  });

  wsC.getCell(`A${T}`).value = cellValue("TOTAL");
  const sumCols = ["goods", ...Object.keys(shareSrc), "freight", "insurance", "deduct", "local", "localVat", "cif", "duty", "emy", "kkdf", "other", "otv", "vatBase", "vat", "landed"];
  for (const key of sumCols) {
    const col = L[key];
    const own = shares[key] ? round(shares[key].reduce((s, x) => s + x, 0), 2) : result.totals[key];
    wsC.getCell(`${col}${T}`).value = cellValue(fx(`ROUND(SUM(${col}${FIRST}:${col}${LAST}),2)`, own));
  }
  wsC.getRow(T).font = bold;
  const tc = (k) => `${L[k]}${T}`;
  const summary = (row, label, formula, value) => { wsC.getCell(`A${row}`).value = cellValue(label); wsC.getCell(`B${row}`).value = cellValue(fx(formula, value)); wsC.getCell(`B${row}`).numFmt = MONEY; wsC.getCell(`A${row}`).font = bold; };
  summary(T + 2, "Payable at customs (TRY)", `ROUND(${tc("duty")}+${tc("emy")}+${tc("kkdf")}+${tc("other")}+${tc("otv")}+${tc("vat")},2)`, result.totals.cash);
  summary(T + 3, "Recoverable VAT (TRY)", `ROUND(Inputs!$B$6*(${tc("vat")}+${tc("localVat")}),2)`, result.totals.recoverableVat);
  summary(T + 4, "Landed cost total (TRY)", tc("landed"), result.totals.landed);
  NOTES.slice(1).forEach((t, i) => { wsC.getCell(`A${T + 6 + i}`).value = cellValue(t); });

  // Sayı biçimleri ve sayfa kurulumu
  cols.forEach((col, i) => {
    if (!col.fmt) return;
    for (let r = FIRST; r <= T; r++) wsC.getCell(r, i + 1).numFmt = col.fmt;
  });
  for (const ws of [wsI, wsC]) {
    ws.pageSetup = { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    ws.views = [{ showGridLines: false }];
  }
  wsC.views = [{ showGridLines: false, state: "frozen", xSplit: 1, ySplit: 4 }];
  for (let r = FIRST; r <= LAST; r++) wsC.getCell(`A${r}`).alignment = { wrapText: true };

  return wb.xlsx.writeBuffer();
}
