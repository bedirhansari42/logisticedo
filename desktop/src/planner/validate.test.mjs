import test from "node:test";
import assert from "node:assert/strict";
import { CONTAINERS } from "./containers.mjs";
import { validatePlan } from "./validate.mjs";

const C = { L: 100, W: 100, H: 100 };
const b = (seq, x, y, z, dx, dy, dz, pallet = false) => ({ itemId: "a", x, y, z, dx, dy, dz, pallet, seq });

test("containers have the spec's inner dimensions", () => {
  assert.deepEqual([CONTAINERS["20"].L, CONTAINERS["20"].W, CONTAINERS["20"].H], [590, 235, 239]);
  assert.deepEqual([CONTAINERS["40"].L, CONTAINERS["40"].W, CONTAINERS["40"].H], [1203, 235, 239]);
  assert.deepEqual([CONTAINERS["40hc"].L, CONTAINERS["40hc"].W, CONTAINERS["40hc"].H], [1203, 235, 270]);
  assert.equal(CONTAINERS["40hc"].label, "40' HC");
});

test("valid plan passes", () => {
  const r = validatePlan(C, [b(1, 0, 0, 0, 50, 50, 50), b(2, 50, 0, 0, 50, 50, 50)]);
  assert.deepEqual(r, { ok: true, errors: [] });
});

test("box outside container is rejected", () => {
  assert.equal(validatePlan(C, [b(1, 60, 0, 0, 50, 50, 50)]).ok, false);
  assert.equal(validatePlan(C, [b(1, 0, 0, 80, 50, 50, 50)]).ok, false);
});

test("overlapping boxes are rejected", () => {
  assert.equal(validatePlan(C, [b(1, 0, 0, 0, 50, 50, 50), b(2, 40, 0, 0, 50, 50, 50)]).ok, false);
});

test("item on top of a pallet is rejected", () => {
  const r = validatePlan(C, [b(1, 0, 0, 0, 50, 50, 50, true), b(2, 0, 0, 50, 50, 50, 20)]);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(" "), /pallet/i);
});

test("floating box is rejected", () => {
  const r = validatePlan(C, [b(1, 0, 0, 30, 20, 20, 20)]);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(" "), /support/i);
});

test("box on fully supporting boxes passes", () => {
  const r = validatePlan(C, [b(1, 0, 0, 0, 50, 50, 50), b(2, 50, 0, 0, 50, 50, 50), b(3, 25, 0, 50, 50, 50, 30)]);
  assert.equal(r.ok, true);
});

test("box on partially supporting box is rejected", () => {
  const r = validatePlan(C, [b(1, 0, 0, 0, 50, 50, 50), b(2, 25, 0, 50, 50, 50, 30)]);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(" "), /support/i);
});

test("loading before support is rejected", () => {
  const r = validatePlan(C, [b(1, 0, 0, 50, 50, 50, 30), b(2, 0, 0, 0, 50, 50, 50)]);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(" "), /order/i);
});

test("earlier item nearer the door that overlaps in y/z is rejected", () => {
  const r = validatePlan(C, [b(1, 60, 0, 0, 40, 50, 50), b(2, 0, 0, 0, 50, 50, 50)]);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(" "), /order/i);
});

test("earlier item nearer the door is fine when it does not overlap in y", () => {
  const r = validatePlan(C, [b(1, 60, 50, 0, 40, 50, 50), b(2, 0, 0, 0, 50, 50, 50)]);
  assert.equal(r.ok, true);
});

test("gap=2 makes touching boxes invalid but not stacked ones", () => {
  assert.equal(validatePlan(C, [b(1, 0, 0, 0, 50, 50, 50), b(2, 50, 0, 0, 50, 50, 50)], { gap: 2 }).ok, false);
  assert.equal(validatePlan(C, [b(1, 0, 0, 0, 50, 50, 40), b(2, 0, 0, 40, 50, 50, 40)], { gap: 2 }).ok, true);
});

test("duplicate seq is rejected", () => {
  assert.equal(validatePlan(C, [b(1, 0, 0, 0, 40, 40, 40), b(1, 50, 0, 0, 40, 40, 40)]).ok, false);
});
