import test from "node:test";
import assert from "node:assert/strict";
import { round, allocate } from "./money.mjs";
import { INCOTERMS, defaultIncluded, ALLOC_KEYS, CURRENCIES, DEFAULTS } from "./rules.mjs";

test("round is half-up with epsilon", () => assert.equal(round(1.005, 2), 1.01));

test("allocate gives the remainder to the last item", () => assert.deepEqual(allocate(100, [1, 1, 1]), [33.33, 33.33, 33.34]));

test("allocate sums to the total", () => {
  const a = allocate(0.01, [1, 1]);
  assert.deepEqual(a, [0.01, 0]);
});

test("allocate by uneven weights", () => assert.deepEqual(allocate(18000, [100, 300]), [4500, 13500]));

test("allocate rejects zero total weight", () => assert.throws(() => allocate(10, [0, 0]), RangeError));

test("defaultIncluded follows the incoterm", () => {
  assert.equal(defaultIncluded("CIF", "insurance"), true);
  assert.equal(defaultIncluded("FOB", "freight"), false);
  assert.equal(defaultIncluded("CFR", "freight"), true);
  assert.equal(defaultIncluded("CFR", "insurance"), false);
  assert.equal(INCOTERMS.DDP.dutyPaid, true);
});

test("INCOTERMS covers the 11 Incoterms 2020 rules", () => {
  const names = ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"];
  assert.deepEqual(Object.keys(INCOTERMS).sort(), [...names].sort());
});

test("rules constants", () => {
  assert.deepEqual(ALLOC_KEYS, ["auto", "value", "weight", "volume", "qty"]);
  assert.ok(CURRENCIES.includes("TRY"));
  assert.deepEqual(DEFAULTS, { vatRate: 20, flatInsuranceRate: 3 });
});

test("round is half-up on the decimal value, not the binary one", () => {
  assert.equal(round(2.425, 2), 2.43);
  assert.equal(round(8.905, 2), 8.91);
  assert.equal(round(1 * 1.21 * 48.5, 2), 58.69);
  assert.equal(round(123456789.125, 2), 123456789.13);
  assert.equal(round(0.1 + 0.2, 2), 0.3);
});

test("round goes away from zero for negatives, like Excel", () => {
  assert.equal(round(-2.425, 2), -2.43);
  assert.ok(Object.is(round(-0.001, 2), 0));
});

test("round copes with tiny and huge values", () => {
  assert.equal(round(1e-7, 2), 0);
  assert.equal(round(1.5e21, 2), 1.5e21);
});
