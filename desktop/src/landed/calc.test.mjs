import test from "node:test";
import assert from "node:assert/strict";
import { calcLanded } from "./calc.mjs";

const item = (o) => ({ id: "a", name: "A", hsCode: "", qty: 10, unitPrice: 100, weightKg: 100, volumeM3: null, dutyRate: 0, emyRate: 0, kkdfRate: 0, otherRate: 0, otherAmount: 0, otvRate: 0, vatRate: 20, ...o });
const A = item({ id: "a", name: "A", qty: 10, unitPrice: 100, weightKg: 100, dutyRate: 10 });
const B = item({ id: "b", name: "B", qty: 5, unitPrice: 200, weightKg: 300 });
const cost = (o) => ({ id: "c1", kind: "freight", label: "Freight", amount: 600, currency: "USD", included: false, alloc: "weight", vatRate: null, ...o });
const base = (o) => ({ currency: "USD", rates: { USD: 30 }, incoterm: "FOB", vatDeductible: true, kkdfInVat: true, flatInsurance: true, items: [A, B], costs: [], ...o });
const FREIGHT = cost({ id: "f" });
const INSURANCE = cost({ id: "i", kind: "insurance", label: "Insurance", amount: 100, alloc: "value" });
const S1 = base({ costs: [FREIGHT, INSURANCE] });
const cifs = (r) => r.items.map((i) => i.cif);

test("S1 CIF: goods + freight by weight + insurance by value", () => {
  const r = calcLanded(S1);
  assert.equal(r.ok, true);
  assert.deepEqual(r.items.map((i) => [i.goods, i.freight, i.insurance, i.cif]), [[30000, 4500, 1500, 36000], [30000, 13500, 1500, 45000]]);
  assert.equal(r.flatInsurance.applied, false);
  assert.equal(r.totals.cif, 81000);
});

test("flat insurance is 3% of goods + added freight when there is no insurance line", () => {
  const r = calcLanded(base({ costs: [FREIGHT] }));
  assert.deepEqual(r.flatInsurance, { applied: true, base: 78000, amountTry: 2340 });
  assert.deepEqual(cifs(r), [35670, 44670]);
});

test("flat insurance base excludes freight when there is no freight line", () => {
  const r = calcLanded(base());
  assert.deepEqual(r.flatInsurance, { applied: true, base: 60000, amountTry: 1800 });
});

test("CIF incoterm: nothing is added and no flat insurance", () => {
  const r = calcLanded(base({ incoterm: "CIF" }));
  assert.deepEqual(cifs(r), [30000, 30000]);
  assert.equal(r.flatInsurance.applied, false);
});

test("included freight line is ignored in CIF and in the flat base", () => {
  const r = calcLanded(base({ costs: [cost({ id: "f", included: true })] }));
  assert.equal(r.costs[0].applied, false);
  assert.equal(r.flatInsurance.base, 60000);
  assert.deepEqual(cifs(r), [30900, 30900]); // yalnızca 1800 TL götürü sigorta, yarı yarıya
});

test("an insurance line marked included blocks the flat insurance", () => {
  const r = calcLanded(base({ costs: [cost({ ...INSURANCE, included: true })] }));
  assert.equal(r.flatInsurance.applied, false);
});

test("DAP: the deduct line lowers goods before the flat insurance", () => {
  const r = calcLanded(base({ incoterm: "DAP", costs: [cost({ id: "d", kind: "deduct", label: "Inland", amount: 6000, currency: "TRY", alloc: "value" })] }));
  assert.equal(r.flatInsurance.amountTry, 1620);
  assert.deepEqual(cifs(r), [27810, 27810]);
});

test("flat insurance switched off adds nothing", () => {
  const r = calcLanded(base({ flatInsurance: false }));
  assert.equal(r.flatInsurance.applied, false);
  assert.deepEqual(cifs(r), [30000, 30000]);
});

test("auto allocation: weight, then volume, then value", () => {
  const f = cost({ id: "f", alloc: "auto" });
  assert.equal(calcLanded(base({ costs: [f] })).costs[0].usedKey, "weight");
  const vol = [item({ ...A, weightKg: null, volumeM3: 1 }), item({ ...B, weightKg: 300, volumeM3: 3 })];
  assert.equal(calcLanded(base({ items: vol, costs: [f] })).costs[0].usedKey, "volume");
  const none = [item({ ...A, weightKg: null }), item({ ...B, weightKg: null })];
  assert.equal(calcLanded(base({ items: none, costs: [f] })).costs[0].usedKey, "value");
});

test("explicit key with missing data is an error naming the key", () => {
  const items = [item({ ...A, weightKg: null }), B];
  const r = calcLanded(base({ items, costs: [FREIGHT] }));
  assert.deepEqual(r, { ok: false, errors: [{ key: "d.lc.err.keyMissing", vars: { label: "Freight", key: "weight" } }] });
});

test("zero total weight is an error, never NaN", () => {
  const items = [item({ ...A, weightKg: 0 }), item({ ...B, weightKg: 0 })];
  const r = calcLanded(base({ items, costs: [FREIGHT] }));
  assert.equal(r.ok, false);
  assert.equal(r.errors[0].key, "d.lc.err.keyMissing");
});

test("missing or zero exchange rate is an error, never NaN", () => {
  const r = calcLanded(base({ costs: [cost({ currency: "EUR" })] }));
  assert.equal(r.ok, false);
  assert.equal(r.errors[0].key, "d.lc.err.rate");
  assert.deepEqual(r.errors[0].vars, { currency: "EUR" });
  assert.equal(calcLanded(base({ rates: { USD: 0 } })).errors[0].key, "d.lc.err.rate");
});

test("item with qty 0 is an error", () => {
  const r = calcLanded(base({ items: [item({ qty: 0 })] }));
  assert.equal(r.errors[0].key, "d.lc.err.qty");
});

test("no items is an error", () => assert.equal(calcLanded(base({ items: [] })).errors[0].key, "d.lc.err.noItems"));

// ---- Görev 3: vergi zinciri, yurt içi masraflar, toplamlar ----
const LOCAL = cost({ id: "l", kind: "local", label: "Brokerage", amount: 1000, currency: "TRY", alloc: "value", vatRate: 20 });
const S1_LOCAL = base({ costs: [FREIGHT, INSURANCE, LOCAL] });
const X = (o) => base({ currency: "TRY", rates: {}, incoterm: "CIF", items: [item({ id: "x", name: "X", qty: 1, unitPrice: 1000, weightKg: null, dutyRate: 10, emyRate: 5, kkdfRate: 6, otherRate: 2, otherAmount: 30, otvRate: 10, vatRate: 20 })], ...o });

test("S1 full chain: duty, VAT, local cost, landed, totals", () => {
  const r = calcLanded(S1_LOCAL);
  assert.deepEqual(r.items.map((i) => [i.duty, i.vatBase, i.vat, i.local, i.landed, i.unitCost]),
    [[3600, 39600, 7920, 500, 40100, 4010], [0, 45000, 9000, 500, 45500, 9100]]);
  assert.deepEqual([r.totals.landed, r.totals.cash, r.totals.recoverableVat, r.totals.localVat], [85600, 20520, 17120, 200]);
});

test("VAT not deductible is added to landed cost", () => {
  const r = calcLanded({ ...S1_LOCAL, vatDeductible: false });
  assert.deepEqual(r.items.map((i) => i.landed), [48120, 54600]);
  assert.deepEqual([r.totals.landed, r.totals.recoverableVat], [102720, 0]);
});

test("tax chain with EMY, KKDF, other duty and OTV", () => {
  const i = calcLanded(X()).items[0];
  assert.deepEqual([i.duty, i.emy, i.kkdf, i.other, i.otv, i.vatBase, i.vat], [100, 50, 60, 50, 120, 1380, 276]);
});

test("kkdfInVat false removes KKDF from the VAT base", () => {
  const i = calcLanded(X({ kkdfInVat: false })).items[0];
  assert.deepEqual([i.vatBase, i.vat], [1320, 264]);
});

test("blank rates give zero tax and one warning per item", () => {
  const r = calcLanded(base({ items: [item({ id: "a", name: "A" })] }));
  assert.deepEqual(r.warnings, [{ key: "d.lc.warn.noRates", vars: { name: "A" } }]);
  assert.equal(r.items[0].landed, r.items[0].cif);
});

test("a local cost without a VAT rate has no local VAT", () => {
  const r = calcLanded(base({ costs: [{ ...LOCAL, vatRate: null }] }));
  assert.equal(r.totals.localVat, 0);
});

test("grand totals equal the sum of rounded item values", () => {
  const many = Array.from({ length: 7 }, (_, n) => item({ id: `i${n}`, name: `I${n}`, qty: n + 1, unitPrice: 10.1 * (n + 1), weightKg: 3 + n, dutyRate: 7.3, vatRate: 18 }));
  const r = calcLanded(base({ items: many, costs: [cost({ id: "f2", amount: 1000, currency: "TRY", alloc: "value" }), { ...LOCAL, amount: 333.33 }] }));
  for (const k of ["cif", "duty", "vat", "landed", "local", "localVat"]) {
    assert.equal(r.totals[k], Math.round(r.items.reduce((s, i) => s + i[k], 0) * 100) / 100, k);
  }
  assert.equal(r.totals.freight, 1000);
  assert.equal(r.totals.local, 333.33);
});

test("unit cost has four decimals", () => {
  const r = calcLanded(base({ currency: "TRY", rates: {}, incoterm: "CIF", items: [item({ qty: 3, unitPrice: 33.3333333, dutyRate: 0 })] }));
  assert.equal(r.items[0].landed, 100);
  assert.equal(r.items[0].unitCost, 33.3333);
});

// ---- İnceleme sonrası düzeltmeler ----
test("goods use decimal half-up rounding", () => {
  const r = calcLanded(base({ rates: { USD: 48.5 }, incoterm: "CIF", items: [item({ id: "h", name: "H", qty: 1, unitPrice: 1.21, weightKg: null })] }));
  assert.equal(r.items[0].goods, 58.69);
});

test("negative customs value is an error naming the item", () => {
  const r = calcLanded(base({ currency: "TRY", rates: {}, incoterm: "DAP", items: [item({ name: "A", qty: 1, unitPrice: 2000, weightKg: null })], costs: [cost({ id: "d", kind: "deduct", label: "Inland", amount: 4000, currency: "TRY", alloc: "value" })] }));
  assert.deepEqual(r, { ok: false, errors: [{ key: "d.lc.err.negativeCif", vars: { name: "A" } }] });
});

test("auto allocation with partial weights warns and names the key used", () => {
  const items = [item({ id: "a", name: "A", weightKg: 100 }), item({ id: "b", name: "B", qty: 5, unitPrice: 200, weightKg: null })];
  const r = calcLanded(base({ items, costs: [cost({ id: "f", alloc: "auto" })] }));
  assert.equal(r.costs[0].usedKey, "value");
  assert.ok(r.warnings.some((w) => w.key === "d.lc.warn.autoPartial" && w.vars.label === "Freight" && w.vars.key === "value"));
});

test("auto allocation with no weights or volumes at all is silent", () => {
  const items = [item({ id: "a", name: "A", weightKg: null }), item({ id: "b", name: "B", weightKg: null })];
  const r = calcLanded(base({ items, costs: [cost({ id: "f", alloc: "auto" })] }));
  assert.equal(r.warnings.some((w) => w.key === "d.lc.warn.autoPartial"), false);
});
