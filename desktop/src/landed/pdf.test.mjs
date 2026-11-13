import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { calcLanded } from "./calc.mjs";
import { buildLandedPdf, layoutColumns } from "./pdf.mjs";

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const req = createRequire(import.meta.url);
const PDFLib = req(path.join(site, "vendor/pdf-lib.min.js"));
const fontkit = req(path.join(site, "vendor/fontkit.min.js"));
const reg = readFileSync(path.join(site, "assets/fonts/IBMPlexSans-Regular.ttf"));
const bold = readFileSync(path.join(site, "assets/fonts/IBMPlexSans-Bold.ttf"));
const deps = { PDFLib, fontkit, fonts: [reg, reg, bold] };
const pageCount = async (bytes) => (await PDFLib.PDFDocument.load(bytes)).getPageCount();

const item = (o) => ({ id: "a", name: "A", hsCode: "", qty: 10, unitPrice: 100, weightKg: 100, volumeM3: null, dutyRate: 10, emyRate: 0, kkdfRate: 0, otherRate: 0, otherAmount: 0, otvRate: 0, vatRate: 20, ...o });
const cost = (o) => ({ id: "c1", kind: "freight", label: "Freight", amount: 600, currency: "USD", included: false, alloc: "weight", vatRate: null, ...o });
const base = (o) => ({ currency: "USD", rates: { USD: 30 }, incoterm: "FOB", vatDeductible: true, kkdfInVat: true, flatInsurance: true, items: [item({ id: "a" }), item({ id: "b", name: "B", qty: 5, unitPrice: 200, weightKg: 300, dutyRate: 0 })], costs: [cost({ id: "f" }), cost({ id: "l", kind: "local", label: "Brokerage", amount: 1000, currency: "TRY", alloc: "value", vatRate: 20 })], ...o });
const run = (input) => buildLandedPdf(input, calcLanded(input), deps);

test("builds a PDF for a valid result", async () => {
  const bytes = await run(base());
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), "%PDF-");
  assert.ok((await pageCount(bytes)) >= 1);
});

test("120 items paginate", async () => {
  const items = Array.from({ length: 120 }, (_, n) => item({ id: `i${n}`, name: `Item ${n}`, weightKg: 1 + n }));
  const bytes = await run(base({ items, costs: [] }));
  assert.ok((await pageCount(bytes)) >= 2);
});

test("characters the font cannot draw do not break the export", async () => {
  const bytes = await run(base({ items: [item({ name: "漢字 motor 🚚" })], costs: [] }));
  assert.ok(bytes.length > 1000);
});

test("TRY invoices and missing cost lines export", async () => {
  const bytes = await run(base({ currency: "TRY", rates: {}, incoterm: "CIF", costs: [] }));
  assert.ok(bytes.length > 1000);
});

test("refuses an invalid result", async () => {
  await assert.rejects(() => buildLandedPdf(base(), { ok: false, errors: [] }, deps), /nothing to export/);
});

// ---- İnceleme sonrası düzeltmeler ----
const widthOf = (s, bold, size) => String(s).length * size * 0.55;

test("layoutColumns gives every numeric column room for its widest value", () => {
  const cols = [{ h: "Item", flex: true }, { h: "VAT", right: true }, { h: "Landed", right: true }];
  const rows = [["Motor", "1,244,821.31", "5,365,609.12"], ["TOTAL", "99,999,999.99", "123,456,789.00"]];
  const { widths, size } = layoutColumns({ cols, rows, widthOf, maxWidth: 770 });
  for (const i of [1, 2]) for (const r of rows) assert.ok(widths[i] >= widthOf(r[i], true, size) + 6, `col ${i} ${r[i]}`);
  assert.ok(widths.reduce((a, b) => a + b, 0) <= 770.01);
  assert.ok(widths[0] >= 90);
});

test("layoutColumns shrinks the font for huge values and still returns", () => {
  const cols = [{ h: "Item", flex: true }, ...Array.from({ length: 14 }, (_, n) => ({ h: `C${n}`, right: true }))];
  const rows = [["x", ...Array.from({ length: 14 }, () => "12,345,678,901.23")]];
  const { widths, size } = layoutColumns({ cols, rows, widthOf, maxWidth: 770 });
  assert.ok(size < 7.4);
  assert.equal(widths.length, 15);
});

test("an export with six-figure taxes builds", async () => {
  const input = base({ currency: "USD", rates: { USD: 42.5 }, items: [item({ id: "big", name: "Big", qty: 2, unitPrice: 60000, weightKg: 10, dutyRate: 10, kkdfRate: 6 })], costs: [] });
  assert.ok((await run(input)).length > 1000);
});
