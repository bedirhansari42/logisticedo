import test from "node:test";
import assert from "node:assert/strict";
import { NA, isNA, RULES, DOC_RULES, checkDoc, stepGaps, requiredCells, forPrint, docsForRule } from "./model.mjs";

const item = (o) => ({ id: o.id, description: "", qty: "", hsCode: "", ...o });
const st = (items) => ({ items });

test("packing list, pallet list and the two-sheet Excel require HS codes; the commercial invoice does not (yet)", () => {
  assert.deepEqual(DOC_RULES.pl, ["hsCode"]);
  assert.deepEqual(DOC_RULES.xlsx, ["hsCode"]);
  assert.deepEqual(DOC_RULES.pallet, ["hsCode"]);
  assert.equal(DOC_RULES.ci, undefined);
  assert.deepEqual(docsForRule("hsCode").sort(), ["pallet", "pl", "xlsx"]);
  assert.deepEqual(checkDoc(st([item({ id: "a", description: "x" })]), "pallet"), [{ rule: "hsCode", ids: ["a"] }]);
});

test("every rule declares where it is edited", () => {
  for (const [id, r] of Object.entries(RULES)) {
    assert.equal(typeof r.field, "string", id);
    assert.equal(typeof r.step, "string", id);
    assert.equal(typeof r.msgKey, "string", id);
  }
  for (const ids of Object.values(DOC_RULES)) for (const id of ids) assert.ok(RULES[id], id);
});

test("an item with no HS code blocks the packing list; filled or '-' passes", () => {
  const s = st([item({ id: "a", description: "Pump", hsCode: "8413.70" }), item({ id: "b", qty: "2" }), item({ id: "c", description: "Valve", hsCode: " - " })]);
  assert.deepEqual(checkDoc(s, "pl"), [{ rule: "hsCode", ids: ["b"] }]);
  assert.deepEqual(checkDoc(s, "xlsx"), [{ rule: "hsCode", ids: ["b"] }]);
  assert.deepEqual(checkDoc(s, "ci"), []);
});

test("whitespace is not a value", () => {
  assert.deepEqual(checkDoc(st([item({ id: "a", description: "x", hsCode: "   " })]), "pl"), [{ rule: "hsCode", ids: ["a"] }]);
});

test("empty rows (no description, no quantity) are ignored", () => {
  assert.deepEqual(checkDoc(st([item({ id: "a" }), item({ id: "b", description: "x", hsCode: "1" })]), "pl"), []);
  assert.deepEqual(checkDoc(st([]), "pl"), []);
});

test("stepGaps: gaps of every rule edited on that step, regardless of the open document", () => {
  const s = st([item({ id: "a", description: "x" }), item({ id: "b", description: "y" })]);
  assert.deepEqual(stepGaps(s, "items"), [{ rule: "hsCode", ids: ["a", "b"] }]);
  assert.deepEqual(stepGaps(s, "general"), []);
});

test("requiredCells maps field -> set of item ids for highlighting", () => {
  const cells = requiredCells([{ rule: "hsCode", ids: ["a", "b"] }]);
  assert.deepEqual([...cells.hsCode].sort(), ["a", "b"]);
  assert.deepEqual(requiredCells([]), {});
});

test("'-' means 'intentionally empty': printed blank", () => {
  assert.equal(NA, "-");
  assert.equal(isNA(" - "), true);
  assert.equal(isNA("--"), false);
  assert.equal(isNA(""), false);
  const s = { meta: { x: 1 }, items: [item({ id: "a", hsCode: "-" }), item({ id: "b", hsCode: "8413" })] };
  const p = forPrint(s);
  assert.deepEqual(p.items.map((i) => i.hsCode), ["", "8413"]);
  assert.equal(s.items[0].hsCode, "-"); // girdi değişmez
  assert.equal(p.meta, s.meta);
});

test("forPrint returns the same object when nothing changes (keeps memoised previews stable)", () => {
  const s = st([item({ id: "a", hsCode: "8413" })]);
  assert.equal(forPrint(s), s);
  assert.equal(forPrint(null), null);
});
