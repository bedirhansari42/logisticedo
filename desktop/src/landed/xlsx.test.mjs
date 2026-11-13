import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { calcLanded } from "./calc.mjs";
import { buildLandedXlsx } from "./xlsx.mjs";
import { evalWorkbook, colName, roundDecimal } from "./xl-eval.mjs";
import { round } from "./money.mjs";

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const ExcelJS = createRequire(import.meta.url)(path.join(site, "vendor/exceljs.min.js"));
const deps = { ExcelJS };

const item = (o) => ({ id: "a", name: "A", hsCode: "", qty: 10, unitPrice: 100, weightKg: 100, volumeM3: null, dutyRate: 0, emyRate: 0, kkdfRate: 0, otherRate: 0, otherAmount: 0, otvRate: 0, vatRate: 20, ...o });
const A = item({ id: "a", name: "A", dutyRate: 10 });
const B = item({ id: "b", name: "B", qty: 5, unitPrice: 200, weightKg: 300 });
const cost = (o) => ({ id: "c1", kind: "freight", label: "Freight", amount: 600, currency: "USD", included: false, alloc: "weight", vatRate: null, ...o });
const base = (o) => ({ currency: "USD", rates: { USD: 30 }, incoterm: "FOB", vatDeductible: true, kkdfInVat: true, flatInsurance: true, items: [A, B], costs: [], ...o });
const FREIGHT = cost({ id: "f" });
const INSURANCE = cost({ id: "i", kind: "insurance", label: "Insurance", amount: 100, alloc: "value" });
const LOCAL = cost({ id: "l", kind: "local", label: "Brokerage", amount: 1000, currency: "TRY", alloc: "value", vatRate: 20 });
const many = Array.from({ length: 7 }, (_, n) => item({ id: `i${n}`, name: `I${n}`, qty: n + 1, unitPrice: 10.1 * (n + 1), weightKg: 3 + n, dutyRate: 7.3, vatRate: 18 }));
const X = item({ id: "x", name: "X", qty: 1, unitPrice: 1000, weightKg: null, dutyRate: 10, emyRate: 5, kkdfRate: 6, otherRate: 2, otherAmount: 30, otvRate: 10 });

const SCENARIOS = [
  ["S1 full chain", base({ costs: [FREIGHT, INSURANCE, LOCAL] })],
  ["S1 VAT not deductible", base({ costs: [FREIGHT, INSURANCE, LOCAL], vatDeductible: false })],
  ["tax chain, KKDF outside VAT", base({ currency: "TRY", rates: {}, incoterm: "CIF", items: [X], kkdfInVat: false })],
  ["DAP deduct + flat insurance", base({ incoterm: "DAP", costs: [cost({ id: "d", kind: "deduct", label: "Inland", amount: 6000, currency: "TRY", alloc: "value" })] })],
  ["7 items, indivisible amounts", base({ items: many, costs: [cost({ id: "f2", amount: 1000, currency: "TRY", alloc: "value" }), { ...LOCAL, amount: 333.33 }] })],
  ["no cost lines", base()],
  ["half-up goods and tax", base({ rates: { USD: 48.5 }, incoterm: "CIF", items: [item({ id: "h", name: "H", qty: 1, unitPrice: 1.21, weightKg: null, dutyRate: 2.5 })] })],
  ["included freight + EUR line", base({ rates: { USD: 30, EUR: 33 }, costs: [cost({ id: "f", included: true }), cost({ id: "e", kind: "local", label: "Port", amount: 50, currency: "EUR", alloc: "qty", vatRate: 20 })] })]
];

const loadBack = async (buf) => { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf); return wb; };
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);
const keyCol = (wb, key) => {
  const ws = wb.getWorksheet("Calculation");
  for (let c = 1; c <= ws.columnCount; c++) if (ws.getRow(5).getCell(c).value === key) return colName(c);
  throw new Error(`no column ${key}`);
};
const totalRow = (wb) => {
  const ws = wb.getWorksheet("Calculation");
  for (let r = 6; r <= ws.rowCount; r++) if (ws.getCell(`A${r}`).value === "TOTAL") return r;
  throw new Error("no TOTAL row");
};

test("evaluator basics", async () => {
  const wb = new ExcelJS.Workbook();
  const a = wb.addWorksheet("A"), b = wb.addWorksheet("B");
  a.getCell("A1").value = 2.345; a.getCell("A2").value = 4; a.getCell("A3").value = 6;
  a.getCell("B1").value = { formula: "ROUND(A1*10,2)" };
  a.getCell("B2").value = { formula: "SUM(A1:A3)" };
  a.getCell("B3").value = { formula: "IF(A2>3,5,6)" };
  a.getCell("B4").value = { formula: "IF(A2<>4,1,2)+IF(A2=4,10,0)" };
  b.getCell("A1").value = { formula: "A!B2*2" };
  const cell = evalWorkbook(wb);
  assert.equal(cell("A", "B1"), 23.45);
  assert.equal(cell("A", "B2"), 12.345);
  assert.equal(cell("A", "B3"), 5);
  assert.equal(cell("A", "B4"), 12);
  assert.equal(cell("B", "A1"), 24.69);
});

test("evaluated Calculation matches calcLanded for every scenario", async () => {
  for (const [name, input] of SCENARIOS) {
    const result = calcLanded(input);
    assert.equal(result.ok, true, name);
    const wb = await loadBack(await buildLandedXlsx(input, result, deps));
    const cell = evalWorkbook(wb);
    const T = totalRow(wb);
    for (const k of ["goods", "freight", "insurance", "deduct", "cif", "duty", "emy", "kkdf", "other", "otv", "vat", "local", "localVat", "landed"]) {
      close(cell("Calculation", `${keyCol(wb, k)}${T}`), result.totals[k], `${name}:total ${k}`);
    }
    result.items.forEach((it, i) => {
      for (const k of ["goods", "cif", "duty", "vat", "local", "localVat", "landed", "unitCost"]) {
        close(cell("Calculation", `${keyCol(wb, k)}${6 + i}`), it[k], `${name}:item${i} ${k}`);
      }
    });
    const ws = wb.getWorksheet("Calculation");
    const labelled = (text) => { for (let r = T + 1; r <= ws.rowCount; r++) if (ws.getCell(`A${r}`).value === text) return cell("Calculation", `B${r}`); throw new Error(text); };
    close(labelled("Payable at customs (TRY)"), result.totals.cash, `${name}:cash`);
    close(labelled("Recoverable VAT (TRY)"), result.totals.recoverableVat, `${name}:recoverable`);
  }
});

test("changing a rate in Inputs changes the evaluated result", async () => {
  const input = SCENARIOS[0][1];
  const result = calcLanded(input);
  const wb = await loadBack(await buildLandedXlsx(input, result, deps));
  const T = totalRow(wb);
  const landed = `${keyCol(wb, "landed")}${T}`;
  const before = evalWorkbook(wb)("Calculation", landed);
  const inputs = wb.getWorksheet("Inputs");
  let row = 0;
  for (let r = 1; r <= inputs.rowCount; r++) if (inputs.getCell(`A${r}`).value === "USD") row = r;
  assert.ok(row, "USD rate row exists");
  inputs.getCell(`B${row}`).value = 31;
  const after = evalWorkbook(wb)("Calculation", landed);
  assert.ok(after > before);
});

test("workbook has the disclaimer and no external references", async () => {
  const input = SCENARIOS[0][1];
  const wb = await loadBack(await buildLandedXlsx(input, calcLanded(input), deps));
  let text = "";
  wb.getWorksheet("Inputs").eachRow((row) => row.eachCell((c) => { if (typeof c.value === "string") text += c.value + "\n"; }));
  assert.match(text, /estimate/i);
  for (const ws of wb.worksheets) ws.eachRow((row) => row.eachCell((c) => {
    if (c.value && typeof c.value === "object" && "formula" in c.value) assert.doesNotMatch(c.value.formula, /\[|https?:|![A-Za-z]+!/);
  }));
});

test("cached results are written next to formulas", async () => {
  const input = SCENARIOS[0][1];
  const result = calcLanded(input);
  const wb = await loadBack(await buildLandedXlsx(input, result, deps));
  const v = wb.getWorksheet("Calculation").getCell(`${keyCol(wb, "landed")}${totalRow(wb)}`).value;
  assert.equal(v.result, result.totals.landed);
});

test("an invalid result is refused", async () => {
  await assert.rejects(() => buildLandedXlsx(base(), { ok: false, errors: [] }, deps), /nothing to export/);
});

test("app rounding agrees with an independent decimal implementation", () => {
  let seed = 12345;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  for (let i = 0; i < 20000; i++) {
    const amount = Math.round(rnd() * 1e7) / 100, pct = Math.round(rnd() * 3000) / 100;
    const v = (amount * pct) / 100;
    assert.equal(round(v, 2), roundDecimal(v, 2), `${amount} * ${pct}%`);
    const price = Math.round(rnd() * 100000) / 1000, fx = Math.round(rnd() * 5000) / 100;
    const g = 1 * price * fx;
    assert.equal(round(g, 2), roundDecimal(g, 2), `${price} x ${fx}`);
  }
  assert.equal(roundDecimal(2.425, 2), 2.43);
  assert.equal(roundDecimal(-2.425, 2), -2.43);
});
