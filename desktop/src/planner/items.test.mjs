import test from "node:test";
import assert from "node:assert/strict";
import { parseItemRow, parseGap, loadDraft, saveDraft, newRow, DEFAULT_GAP } from "./items.mjs";
import { planAll } from "./pack.mjs";

const row = (o = {}) => ({ id: "r1", name: "Box", l: "50", w: "40", h: "30", qty: "10", weight: "", palletized: false, upright: false, ...o });
const errFields = (r) => r.errors.map((e) => e.field).sort();

test("accepts comma decimals", () => {
  const r = parseItemRow(row({ l: "1,5", w: "2.25", h: "3" }));
  assert.equal(r.ok, true);
  assert.deepEqual([r.item.l, r.item.w, r.item.h], [1.5, 2.25, 3]);
});

test("empty qty means fill", () => {
  const r = parseItemRow(row({ qty: "  " }));
  assert.equal(r.ok, true);
  assert.equal(r.item.qty, null);
});

test("rejects zero, negative and non-numeric dimensions with field errors", () => {
  const r = parseItemRow(row({ l: "0", w: "-3", h: "abc" }));
  assert.equal(r.ok, false);
  assert.deepEqual(errFields(r), ["h", "l", "w"]);
  assert.ok(r.errors.every((e) => e.key.startsWith("d.pl.err.")));
  assert.equal(parseItemRow(row({ l: "" })).ok, false);
});

test("rejects non-integer or zero qty", () => {
  assert.deepEqual(errFields(parseItemRow(row({ qty: "2,5" }))), ["qty"]);
  assert.deepEqual(errFields(parseItemRow(row({ qty: "0" }))), ["qty"]);
  assert.deepEqual(errFields(parseItemRow(row({ qty: "x" }))), ["qty"]);
});

test("rejects negative weight; empty weight is allowed", () => {
  assert.deepEqual(errFields(parseItemRow(row({ weight: "-1" }))), ["weight"]);
  const r = parseItemRow(row({ weight: "" }));
  assert.equal(r.ok, true);
  assert.equal(r.item.weight, undefined);
  assert.equal(parseItemRow(row({ weight: "2,5" })).item.weight, 2.5);
});

test("keeps flags and id", () => {
  const r = parseItemRow(row({ palletized: true, upright: true }));
  assert.equal(r.item.palletized, true);
  assert.equal(r.item.upright, true);
  assert.equal(r.item.id, "r1");
});

test("loadDraft returns defaults when storage is missing or corrupt", () => {
  globalThis.localStorage = undefined;
  assert.equal(loadDraft().rows.length, 1);
  globalThis.localStorage = { getItem: () => "{not json" };
  assert.equal(loadDraft().rows.length, 1);
  globalThis.localStorage = { getItem: () => JSON.stringify({ rows: "nope" }) };
  assert.equal(loadDraft().rows.length, 1);
  assert.equal(loadDraft().gap, DEFAULT_GAP);
});

test("loadDraft restores a saved draft", () => {
  let stored = null;
  globalThis.localStorage = { getItem: () => stored, setItem: (k, v) => { stored = v; } };
  const d = { rows: [newRow(), newRow()], gap: 2, container: "20" };
  saveDraft(d);
  const back = loadDraft();
  assert.equal(back.rows.length, 2);
  assert.equal(back.gap, 2);
  assert.equal(back.container, "20");
});

test("saveDraft swallows storage errors", () => {
  globalThis.localStorage = { getItem: () => null, setItem: () => { throw new Error("quota"); } };
  assert.doesNotThrow(() => saveDraft({ rows: [], gap: 0, container: "40hc" }));
});

test("newRow ids are unique", () => {
  assert.notEqual(newRow().id, newRow().id);
});

test("planAll returns results for all three container types", () => {
  const items = [parseItemRow(row()).item];
  const res = planAll(items, { gap: 0 });
  assert.deepEqual(Object.keys(res).sort(), ["20", "40", "40hc"]);
  assert.equal(res["40hc"].containers[0].placements.length, 10);
});

test("thousands-separator looking input is rejected, not read as 1", () => {
  for (const v of ["1,000", "1.000", "12,500", "1,000,000"]) {
    const r = parseItemRow(row({ l: v }));
    assert.equal(r.ok, false, v);
    assert.deepEqual(r.errors, [{ field: "l", key: "d.pl.err.sep" }], v);
  }
  assert.deepEqual(parseItemRow(row({ qty: "1,000" })).errors, [{ field: "qty", key: "d.pl.err.sep" }]);
  assert.deepEqual(parseItemRow(row({ weight: "2.500" })).errors, [{ field: "weight", key: "d.pl.err.sep" }]);
});

test("small decimals with a leading zero are still decimals", () => {
  assert.equal(parseItemRow(row({ l: "0,125", w: "0.5", h: "12,25" })).ok, true);
  assert.equal(parseItemRow(row({ weight: "0.125" })).item.weight, 0.125);
});

test("dimensions below 0.1 cm are rejected", () => {
  assert.deepEqual(parseItemRow(row({ l: "0.05" })).errors, [{ field: "l", key: "d.pl.err.dim" }]);
  assert.equal(parseItemRow(row({ l: "0.1" })).ok, true);
});

test("parseGap accepts blank as 0 and decimals, rejects junk and negatives", () => {
  assert.deepEqual(parseGap(""), { ok: true, value: 0 });
  assert.deepEqual(parseGap(" 1,5 "), { ok: true, value: 1.5 });
  assert.equal(parseGap("abc").ok, false);
  assert.equal(parseGap("-2").ok, false);
});
