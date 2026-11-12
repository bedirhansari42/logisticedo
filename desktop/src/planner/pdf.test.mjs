import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { planLoad } from "./pack.mjs";
import { buildPlanPdf } from "./pdf.mjs";

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const req = createRequire(import.meta.url);
const PDFLib = req(path.join(site, "vendor/pdf-lib.min.js"));
const fontkit = req(path.join(site, "vendor/fontkit.min.js"));
const reg = readFileSync(path.join(site, "assets/fonts/IBMPlexSans-Regular.ttf"));
const bold = readFileSync(path.join(site, "assets/fonts/IBMPlexSans-Bold.ttf"));
const deps = { PDFLib, fontkit, fonts: [reg, reg, bold] };

const it = (id, o = {}) => ({ id, name: id, l: 50, w: 40, h: 30, qty: 10, palletized: false, upright: false, ...o });
const pageCount = async (bytes) => (await PDFLib.PDFDocument.load(bytes)).getPageCount();

test("builds a PDF with a summary page plus pages per container", async () => {
  const items = [it("Pallet", { l: 120, w: 80, h: 100, qty: 12, palletized: true }), it("Carton", { qty: 400 })];
  const result = planLoad(items, "20");
  assert.ok(result.containers.length >= 2);
  const bytes = await buildPlanPdf(result, items, deps);
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), "%PDF-");
  assert.ok((await pageCount(bytes)) >= 1 + result.containers.length);
});

test("long load sequences paginate", async () => {
  const items = [it("Small", { l: 20, w: 20, h: 20, qty: 900 })];
  const result = planLoad(items, "40hc");
  const bytes = await buildPlanPdf(result, items, deps);
  assert.ok((await pageCount(bytes)) >= 4);
});

test("characters the font cannot draw do not break the export", async () => {
  const items = [it("漢字 box 🚚", { qty: 3 })];
  const bytes = await buildPlanPdf(planLoad(items, "20"), items, deps);
  assert.ok(bytes.length > 1000);
});

test("empty result is rejected", async () => {
  await assert.rejects(() => buildPlanPdf(planLoad([], "20"), [], deps), /nothing to export/);
});

test("fill result and unplaced items are accepted", async () => {
  const items = [it("Huge", { l: 5000, w: 5000, h: 5000, qty: 1 }), it("Fill", { qty: null }), it("Box", { qty: 5 })];
  const result = planLoad(items, "40");
  const bytes = await buildPlanPdf(result, items, deps);
  assert.ok((await pageCount(bytes)) >= 2);
});

test("pdf: cylinder items (upright and lying) export", async () => {
  const cyl = (id, o) => ({ id, name: id, shape: "cyl", l: 120, w: 60, h: 60, qty: 30, palletized: false, upright: false, orient: "up", stackable: true, tight: true, weight: undefined, ...o });
  const items = [cyl("Reel A"), cyl("Reel B", { orient: "lying", l: 150, w: 50, h: 50, qty: 10, stackable: false })];
  const bytes = await buildPlanPdf(planLoad(items, "40"), items, deps);
  assert.equal(Buffer.from(bytes).subarray(0, 5).toString(), "%PDF-");
  if (process.env.LGX_PDF_OUT) (await import("node:fs")).writeFileSync(process.env.LGX_PDF_OUT, bytes);
});
