import test from "node:test";
import assert from "node:assert/strict";
import { applyParseToDraft } from "./proforma.mjs";
import { defaultDraft, newItemRow } from "./model.mjs";

const res = (o = {}) => ({
  meta: { currency: "EUR" }, shipment: { incoterm: "CIF" }, charges: {},
  items: [{ code: "M1", description: "Motor", hsCode: "8501", qty: 10, unit: "PCS", unitPrice: 5, amount: 50, netWeight: 100, grossWeight: 120, volume: 0.5, currency: "" }],
  ...o
});
const run = (r, draft = defaultDraft()) => applyParseToDraft(draft, r);

test("maps items, currency and incoterm", () => {
  const out = run(res());
  const it = out.draft.items[0];
  assert.deepEqual([it.name, it.qty, it.unitPrice, it.hsCode, it.unit], ["Motor", "10", "5", "8501", "PCS"]);
  assert.equal(out.draft.currency, "EUR");
  assert.equal(out.draft.incoterm, "CIF");
  assert.deepEqual(out.warnings, []);
});

test("unitPrice is derived from amount when missing", () => {
  const r = res();
  r.items[0] = { ...r.items[0], unitPrice: null, amount: 25 };
  assert.equal(run(r).draft.items[0].unitPrice, "2.5");
});

test("an item without any price is kept blank and warned", () => {
  const r = res();
  r.items[0] = { ...r.items[0], unitPrice: null, amount: null };
  const out = run(r);
  assert.equal(out.draft.items[0].unitPrice, "");
  assert.deepEqual(out.warnings, [{ key: "d.lc.warn.noPrice", vars: { name: "Motor" } }]);
});

test("weight prefers gross over net; volume is carried", () => {
  const it = run(res()).draft.items[0];
  assert.deepEqual([it.weightKg, it.volumeM3], ["120", "0.5"]);
  const r = res();
  r.items[0] = { ...r.items[0], grossWeight: null };
  assert.equal(run(r).draft.items[0].weightKg, "100");
});

test("charges become cost rows following the incoterm", () => {
  const out = run(res({ shipment: { incoterm: "FOB" }, charges: { freight: 600, insurance: 40 } }));
  const [f, i] = out.draft.costs;
  assert.deepEqual([f.kind, f.amount, f.included, f.currency], ["freight", "600", false, "EUR"]);
  assert.deepEqual([i.kind, i.amount], ["insurance", "40"]);
});

test("an existing cost line of the same kind is not replaced", () => {
  const draft = defaultDraft();
  draft.costs = [{ id: "keep", kind: "freight", label: "Mine", amount: "9", currency: "USD", included: false, alloc: "auto", vatRate: "" }];
  const out = run(res({ charges: { freight: 600 } }), draft);
  assert.deepEqual(out.draft.costs.map((c) => c.id), ["keep"]);
});

test("empty item list keeps the current draft and warns", () => {
  const draft = defaultDraft();
  draft.items[0].name = "Typed by hand";
  const out = run(res({ items: [] }), draft);
  assert.equal(out.draft.items[0].name, "Typed by hand");
  assert.equal(out.warnings[0].key, "d.lc.warn.noItems");
});

test("items in another currency are warned, not converted", () => {
  const r = res();
  r.items[0] = { ...r.items[0], currency: "USD" };
  assert.equal(run(r).warnings[0].key, "d.lc.warn.mixedCurrency");
});

test("unsupported currency or incoterm leaves the draft value", () => {
  const out = run(res({ meta: { currency: "XYZ" }, shipment: { incoterm: "ZZZ" } }));
  assert.deepEqual([out.draft.currency, out.draft.incoterm], ["USD", "FOB"]);
});

test("the input draft is not mutated", () => {
  const draft = defaultDraft();
  draft.items = [newItemRow()];
  const snapshot = JSON.parse(JSON.stringify(draft));
  run(res({ charges: { freight: 1 } }), draft);
  assert.deepEqual(draft, snapshot);
});

// ---- İnceleme sonrası düzeltmeler ----
test("a currency the parser knows (JPY) is supported", () => {
  const out = run(res({ meta: { currency: "JPY" } }));
  assert.equal(out.draft.currency, "JPY");
  assert.deepEqual(out.warnings, []);
});

test("an unsupported currency warns", () => {
  const out = run(res({ meta: { currency: "XYZ" } }));
  assert.ok(out.warnings.some((w) => w.key === "d.lc.warn.currency" && w.vars.currency === "XYZ"));
});

test("an undetected currency warns", () => {
  const out = run(res({ meta: {} }));
  assert.ok(out.warnings.some((w) => w.key === "d.lc.warn.noCurrency"));
});

test("the supplier VAT column is not copied into the import VAT rate", () => {
  const r = res();
  r.items[0] = { ...r.items[0], vatRate: 0 };
  assert.equal(run(r).draft.items[0].vatRate, "20");
});

test("import resets the in-price flags of existing freight lines like a manual Incoterm change", () => {
  const draft = defaultDraft();
  draft.costs = [{ id: "f", kind: "freight", label: "", amount: "9", currency: "USD", included: false, alloc: "auto", vatRate: "" }];
  assert.equal(run(res({ shipment: { incoterm: "CIF" } }), draft).draft.costs[0].included, true);
});

test("numbers follow the UI decimal separator", () => {
  const r = res();
  r.items[0] = { ...r.items[0], qty: 1.5, unitPrice: 12.345 };
  const it = applyParseToDraft(defaultDraft(), r, { decimal: "," }).draft.items[0];
  assert.deepEqual([it.qty, it.unitPrice], ["1,5", "12,345"]);
});
