import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { cellValue, formula } from "../../../assets/js/app/cell-value.js";

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const ExcelJS = createRequire(import.meta.url)(path.join(site, "vendor/exceljs.min.js"));

test("plain values pass through unchanged", () => {
  for (const v of ["abc", "", 0, 12.5, -3, true, false, null, undefined]) assert.equal(cellValue(v), v);
});

test("builder-made formula() keeps formula and result as a plain object", () => {
  const v = cellValue(formula("SUM(A1:A3)", 6));
  assert.deepEqual(v, { formula: "SUM(A1:A3)", result: 6 });
  assert.equal(Object.getOwnPropertySymbols(v).length, 0);
});

test("objects that came from JSON (restored backup) never stay objects", () => {
  const forged = [
    { formula: "1+1", result: 2 },
    { sharedFormula: "A1", result: 1 },
    { text: "x", hyperlink: "https://example.invalid" },
    { richText: [{ text: "x" }] },
    { error: "#N/A" },
    ["a", "b"]
  ];
  for (const f of forged) assert.equal(typeof cellValue(JSON.parse(JSON.stringify(f))), "string", JSON.stringify(f));
});

test("a restored object-valued cell is written as text, a builder formula as a formula (real ExcelJS round trip)", async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("t");
  ws.getCell("A1").value = cellValue(JSON.parse('{"formula":"1+1","result":2}'));
  ws.getCell("A2").value = cellValue(JSON.parse('{"text":"x","hyperlink":"https://example.invalid"}'));
  ws.getCell("A3").value = cellValue(formula("1+2", 3));
  const back = new ExcelJS.Workbook();
  await back.xlsx.load(await wb.xlsx.writeBuffer());
  const b = back.getWorksheet("t");
  assert.equal(typeof b.getCell("A1").value, "string");
  assert.equal(typeof b.getCell("A2").value, "string");
  assert.equal(b.getCell("A2").hyperlink, undefined);
  assert.deepEqual({ f: b.getCell("A3").value.formula, r: b.getCell("A3").value.result }, { f: "1+2", r: 3 });
});
