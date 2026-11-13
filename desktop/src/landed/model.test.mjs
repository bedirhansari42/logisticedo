import test from "node:test";
import assert from "node:assert/strict";
import { newItemRow, newCostRow, defaultDraft, loadDraft, saveDraft, parseDraft, currenciesNeeded, DRAFT_KEY } from "./model.mjs";
import { calcLanded } from "./calc.mjs";

const ITEM_ID = "it1";
const d = (o = {}, extra = {}) => ({ ...defaultDraft(), rates: { USD: "30" }, items: [{ ...newItemRow(), id: ITEM_ID, qty: "1", unitPrice: "1", ...o }], ...extra });
const withStorage = (store) => Object.defineProperty(globalThis, "localStorage", { value: store, configurable: true, writable: true });

test("comma decimal is accepted", () => {
  const it = parseDraft(d({ qty: "1,5", unitPrice: "2,25" })).input.items[0];
  assert.deepEqual([it.qty, it.unitPrice], [1.5, 2.25]);
});

test("1,000 is rejected as ambiguous", () => {
  const r = parseDraft(d({ qty: "1,000" }));
  assert.equal(r.ok, false);
  assert.deepEqual(r.errors[0], { scope: "item", id: ITEM_ID, field: "qty", key: "d.lc.err.sep" });
});

test("blank rows are skipped, blank rates become 0", () => {
  const draft = d();
  draft.items.push(newItemRow());
  const r = parseDraft(draft);
  assert.equal(r.input.items.length, 1);
  assert.equal(r.input.items[0].dutyRate, 0);
  assert.equal(r.input.items[0].weightKg, null);
  assert.equal(r.input.items[0].vatRate, 20);
});

test("negative and non-numeric values are errors", () => {
  const r = parseDraft(d({ unitPrice: "-1", dutyRate: "abc" }));
  assert.equal(r.ok, false);
  assert.deepEqual(r.errors.map((e) => [e.field, e.key]), [["unitPrice", "d.lc.err.num"], ["dutyRate", "d.lc.err.num"]]);
});

test("a started row needs a quantity", () => {
  const r = parseDraft(d({ qty: "", name: "Motor" }));
  assert.deepEqual(r.errors[0], { scope: "item", id: ITEM_ID, field: "qty", key: "d.lc.err.qty" });
});

test("cost rows need a numeric amount; blank cost rows are skipped", () => {
  const draft = d();
  draft.costs = [{ ...newCostRow("freight", draft), id: "c1", amount: "x" }, newCostRow("local", draft)];
  const r = parseDraft(draft);
  assert.deepEqual(r.errors, [{ scope: "cost", id: "c1", field: "amount", key: "d.lc.err.num" }]);
});

test("rates are parsed into numbers and TRY is never needed", () => {
  assert.deepEqual(parseDraft(d()).input.rates, { USD: 30 });
  const draft = d();
  draft.costs = [{ ...newCostRow("freight", draft), amount: "5", currency: "EUR" }, { ...newCostRow("local", draft), amount: "5", currency: "TRY" }];
  assert.deepEqual(currenciesNeeded(draft), ["USD", "EUR"]);
});

test("a bad rate text is an error on that currency", () => {
  const r = parseDraft(d({}, { rates: { USD: "abc" } }));
  assert.deepEqual(r.errors[0], { scope: "rate", id: "USD", field: "rate", key: "d.lc.err.num" });
});

test("loadDraft survives corrupt storage and invalid values", () => {
  withStorage({ getItem: () => "{bad", setItem() {} });
  assert.equal(loadDraft().items.length, 1);
  withStorage({ getItem: () => JSON.stringify({ incoterm: "XXX", currency: "ZZZ", items: [], costs: [{ kind: "nope" }] }), setItem() {} });
  const x = loadDraft();
  assert.deepEqual([x.incoterm, x.currency, x.items.length, x.costs.length], ["FOB", "USD", 1, 0]);
});

test("saveDraft and loadDraft round-trip", () => {
  const mem = {};
  withStorage({ getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } });
  const draft = d({ name: "Motor" }, { incoterm: "CIF" });
  saveDraft(draft);
  assert.ok(mem[DRAFT_KEY]);
  const back = loadDraft();
  assert.deepEqual([back.incoterm, back.items[0].name, back.rates], ["CIF", "Motor", { USD: "30" }]);
});

test("new cost rows follow the incoterm", () => {
  assert.equal(newCostRow("freight", { ...defaultDraft(), incoterm: "CFR" }).included, true);
  assert.equal(newCostRow("freight", defaultDraft()).included, false);
  assert.equal(newCostRow("local", defaultDraft()).vatRate, "20");
  assert.equal(newCostRow("freight", defaultDraft()).alloc, "auto");
});

test("parseDraft output feeds calcLanded", () => {
  const draft = d({ qty: "2", unitPrice: "50" });
  const r = parseDraft(draft);
  assert.equal(r.ok, true);
  assert.equal(calcLanded(r.input).ok, true);
});

// ---- İnceleme sonrası düzeltmeler ----
test("a dot with three decimals is a decimal when the UI decimal is a dot", () => {
  const it = parseDraft(d({ unitPrice: "12.345", weightKg: "1.250" })).input.items[0];
  assert.deepEqual([it.unitPrice, it.weightKg], [12.345, 1.25]);
});

test("comma decimal mode: 12,345 is a decimal and 1.000 is ambiguous", () => {
  assert.equal(parseDraft(d({ unitPrice: "12,345" }), { decimal: "," }).input.items[0].unitPrice, 12.345);
  assert.equal(parseDraft(d({ qty: "1.000" }), { decimal: "," }).errors[0].key, "d.lc.err.sep");
  assert.equal(parseDraft(d({ unitPrice: "1.5" }), { decimal: "," }).input.items[0].unitPrice, 1.5);
});

test("with both separators the last one is the decimal", () => {
  assert.equal(parseDraft(d({ unitPrice: "1,234.56" })).input.items[0].unitPrice, 1234.56);
  assert.equal(parseDraft(d({ unitPrice: "1.234,56" }), { decimal: "," }).input.items[0].unitPrice, 1234.56);
});

test("an exchange rate like 42.150 is accepted", () => {
  assert.equal(parseDraft(d({}, { rates: { USD: "42.150" } })).input.rates.USD, 42.15);
});

test("a bad rate for a currency that is no longer used does not block", () => {
  const r = parseDraft(d({}, { rates: { USD: "30", EUR: "abc" } }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.input.rates, { USD: 30 });
});
