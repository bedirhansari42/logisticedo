import test from "node:test";
import assert from "node:assert/strict";
import { groupByLayer } from "./layers.mjs";

const p = (seq, z) => ({ itemId: "a", x: 0, y: 0, z, dx: 1, dy: 1, dz: 1, pallet: false, seq });

test("groups by z ascending", () => {
  const g = groupByLayer([p(1, 50), p(2, 0), p(3, 50), p(4, 0), p(5, 100)]);
  assert.deepEqual(g.map((l) => l.z), [0, 50, 100]);
  assert.deepEqual(g[0].placements.map((x) => x.seq), [2, 4]);
  assert.deepEqual(g[1].placements.map((x) => x.seq), [1, 3]);
});

test("empty list returns empty array", () => {
  assert.deepEqual(groupByLayer([]), []);
});

test("z values that differ only by float noise share a layer", () => {
  const g = groupByLayer([p(1, 0.1 + 0.2), p(2, 0.3)]);
  assert.equal(g.length, 1);
});
