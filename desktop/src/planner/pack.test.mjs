import test from "node:test";
import assert from "node:assert/strict";
import { CONTAINERS } from "./containers.mjs";
import { validatePlan } from "./validate.mjs";
import { planLoad } from "./pack.mjs";

let n = 0;
const item = (o) => ({ id: `i${++n}`, name: "x", l: 50, w: 50, h: 50, qty: 1, palletized: false, upright: false, ...o });
const all = (r) => r.containers.flatMap((c) => c.placements);
const checkValid = (r, gap = 0) => {
  for (const c of r.containers) {
    const v = validatePlan(CONTAINERS[r.containerKey], c.placements, { gap });
    assert.equal(v.ok, true, v.errors.slice(0, 3).join("; "));
  }
};
const placedCount = (r, id) => all(r).filter((p) => p.itemId === id).length;
const unplacedCount = (r, id) => r.unplaced.filter((u) => u.itemId === id).reduce((s, u) => s + u.count, 0);

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("single 100x100x100 box x1 fits in 20'", () => {
  const a = item({ l: 100, w: 100, h: 100 });
  const r = planLoad([a], "20");
  assert.equal(all(r).length, 1);
  assert.deepEqual(r.unplaced, []);
  checkValid(r);
});

test("pallets stay on the floor", () => {
  const a = item({ l: 120, w: 80, h: 100, qty: 20, palletized: true });
  const r = planLoad([a], "40");
  assert.equal(placedCount(r, a.id), 20);
  assert.ok(all(r).every((p) => p.z === 0 && p.pallet === true));
  checkValid(r);
});

test("palletized item is never stacked", () => {
  const a = item({ l: 100, w: 100, h: 60, qty: 60, palletized: true });
  const b = item({ l: 40, w: 40, h: 40, qty: 100 });
  const r = planLoad([a, b], "20");
  const pallets = all(r).filter((p) => p.pallet);
  for (const p of pallets) {
    assert.equal(p.z, 0);
    assert.ok(!all(r).some((q) => q !== p && q.z >= p.z + p.dz - 1e-9 && q.x < p.x + p.dx && p.x < q.x + q.dx && q.y < p.y + p.dy && p.y < q.y + q.dy));
  }
  checkValid(r);
});

test("unpalletized boxes stack up to the ceiling", () => {
  const a = item({ l: 50, w: 50, h: 50, qty: 300 });
  const r = planLoad([a], "20");
  const H = CONTAINERS["20"].H;
  assert.ok(r.containers[0].placements.some((p) => p.z + p.dz > 0.8 * H));
  checkValid(r);
});

test("rotates a box that only fits turned; the same item on a pallet is too_big", () => {
  const box = item({ l: 100, w: 100, h: 300 });
  const pal = item({ l: 100, w: 100, h: 300, palletized: true });
  const r = planLoad([box, pal], "40hc");
  assert.equal(placedCount(r, box.id), 1);
  assert.equal(placedCount(r, pal.id), 0);
  assert.deepEqual(r.unplaced.map((u) => [u.itemId, u.count, u.reason]), [[pal.id, 1, "too_big"]]);
  checkValid(r);
});

test("upright box keeps its height", () => {
  const a = item({ l: 30, w: 60, h: 90, qty: 40, upright: true });
  const r = planLoad([a], "20");
  assert.ok(all(r).every((p) => p.dz === 90));
  checkValid(r);
});

test("item bigger than every container is too_big and others are still planned", () => {
  const huge = item({ l: 2000, w: 2000, h: 2000 });
  const ok = item({ qty: 3 });
  const r = planLoad([huge, ok], "40");
  assert.equal(placedCount(r, ok.id), 3);
  assert.equal(unplacedCount(r, huge.id), 1);
  assert.equal(r.unplaced.find((u) => u.itemId === huge.id).reason, "too_big");
});

test("quantity that exceeds one container splits across several", () => {
  const a = item({ l: 100, w: 100, h: 100, qty: 400 });
  const r = planLoad([a], "20");
  assert.ok(r.containers.length > 1);
  assert.equal(placedCount(r, a.id) + unplacedCount(r, a.id), 400);
  assert.equal(unplacedCount(r, a.id), 0);
  checkValid(r);
});

test("fill mode places as many as fit", () => {
  const a = item({ l: 50, w: 50, h: 50, qty: null });
  const r = planLoad([a], "20");
  assert.ok(r.fill.count > 100);
  assert.equal(r.fill.itemId, a.id);
  assert.equal(r.containers.length, 1);
  assert.equal(placedCount(r, a.id), r.fill.count);
  checkValid(r);
});

test("fixed items are placed before the fill item, which takes the rest", () => {
  const f = item({ l: 50, w: 50, h: 50, qty: null });
  const fixed = item({ l: 100, w: 100, h: 100, qty: 20 });
  const alone = planLoad([f], "20");
  const mixed = planLoad([f, fixed], "20");
  assert.equal(placedCount(mixed, fixed.id), 20);
  assert.ok(mixed.fill.count <= alone.fill.count);
  assert.ok(mixed.fill.count > 0);
  checkValid(mixed);
});

test("fill mode with no free space returns 0", () => {
  const full = item({ l: 590, w: 235, h: 239 });
  const f = item({ qty: null });
  const r = planLoad([full, f], "20");
  assert.equal(r.fill.count, 0);
  assert.equal(placedCount(r, full.id), 1);
});

test("two fill items are rejected", () => {
  assert.throws(() => planLoad([item({ qty: null }), item({ qty: null })], "20"), /only one fill item/);
});

test("empty list returns empty result", () => {
  const r = planLoad([], "20");
  assert.deepEqual(r.containers, []);
  assert.deepEqual(r.unplaced, []);
  assert.equal(r.fill, null);
  assert.equal(r.capped, false);
});

test("only palletized list on 40hc stays valid and fillPct is volume based", () => {
  const a = item({ l: 120, w: 80, h: 100, qty: 10, palletized: true });
  const r = planLoad([a], "40hc");
  checkValid(r);
  const c = CONTAINERS["40hc"];
  const expected = Math.round(((10 * 120 * 80 * 100) / (c.L * c.W * c.H)) * 100 * 10) / 10;
  assert.equal(r.containers[0].fillPct, expected);
});

test("weight is summed per container", () => {
  const a = item({ qty: 4, weight: 2.5 });
  const r = planLoad([a], "20");
  assert.equal(r.containers[0].weightKg, 10);
});

test("cap: huge quantities are limited and flagged", () => {
  const a = item({ l: 10, w: 10, h: 10, qty: 100000 });
  const t = Date.now();
  const r = planLoad([a], "40hc");
  assert.equal(r.capped, true);
  assert.ok(r.unplaced.some((u) => u.reason === "cap" && u.count > 0));
  assert.ok(Date.now() - t < 5000, `took ${Date.now() - t}ms`);
});

test("deterministic", () => {
  const items = [item({ l: 120, w: 80, h: 100, qty: 8, palletized: true }), item({ l: 33, w: 41, h: 27, qty: 90 })];
  assert.deepEqual(planLoad(items, "40"), planLoad(items, "40"));
});

test("performance: about 2000 mixed units on 40hc in under 3 seconds", () => {
  const rand = rng(7);
  const items = Array.from({ length: 10 }, () => item({ l: 20 + Math.floor(rand() * 60), w: 20 + Math.floor(rand() * 60), h: 20 + Math.floor(rand() * 60), qty: 200 }));
  const t = Date.now();
  const r = planLoad(items, "40hc");
  const ms = Date.now() - t;
  assert.ok(ms < 3000, `took ${ms}ms`);
  checkValid(r);
});

test("property: random lists give valid plans and conserve unit counts", () => {
  const rand = rng(42);
  for (let k = 0; k < 30; k++) {
    const rows = 1 + Math.floor(rand() * 8);
    const items = Array.from({ length: rows }, () => item({
      l: 10 + Math.floor(rand() * 110), w: 10 + Math.floor(rand() * 110), h: 10 + Math.floor(rand() * 110),
      qty: 1 + Math.floor(rand() * 40), palletized: rand() < 0.3, upright: rand() < 0.3
    }));
    const key = ["20", "40", "40hc"][k % 3];
    const gap = k % 4 === 0 ? 1 : 0;
    const r = planLoad(items, key, { gap });
    checkValid(r, gap);
    for (const it of items) assert.equal(placedCount(r, it.id) + unplacedCount(r, it.id), it.qty);
  }
});

test("final review: fill of small cartons is not cut at 5000", () => {
  const a = item({ l: 30, w: 20, h: 15, qty: null });
  const r = planLoad([a], "40hc");
  assert.ok(r.fill.count > 5000, `fill.count=${r.fill.count}`);
  assert.equal(r.capped, false);
});

test("final review: 6000 small cartons are all placed without a cap flag", () => {
  const a = item({ l: 30, w: 20, h: 15, qty: 6000 });
  const r = planLoad([a], "40hc");
  assert.deepEqual(r.unplaced, []);
  assert.equal(r.capped, false);
  assert.equal(placedCount(r, a.id), 6000);
});

test("final review: a work budget stops big mixed lists, deterministically and validly", () => {
  const rand = rng(11);
  const items = Array.from({ length: 20 }, () => item({ l: 10 + rand() * 30, w: 10 + rand() * 30, h: 10 + rand() * 30, qty: 100 }));
  const r1 = planLoad(items, "40hc", { maxWork: 200000 });
  const r2 = planLoad(items, "40hc", { maxWork: 200000 });
  assert.equal(r1.capped, true);
  assert.ok(r1.unplaced.some((u) => u.reason === "cap" && u.count > 0));
  assert.deepEqual(r1, r2);
  checkValid(r1);
  for (const it of items) assert.equal(placedCount(r1, it.id) + unplacedCount(r1, it.id), it.qty);
});

test("final review: default budget keeps a 5000-unit mixed list under 15 seconds per container type", () => {
  const rand = rng(5);
  const items = Array.from({ length: 50 }, () => item({ l: 10 + rand() * 30, w: 10 + rand() * 30, h: 10 + rand() * 30, qty: 100 }));
  const t = Date.now();
  const r = planLoad(items, "20");
  assert.ok(Date.now() - t < 15000, `took ${Date.now() - t}ms`);
  checkValid(r);
});

test("minor: fill reason explains a zero result", () => {
  const big = planLoad([item({ l: 5000, w: 5000, h: 5000, qty: null })], "20");
  assert.deepEqual([big.fill.count, big.fill.reason], [0, "too_big"]);
  const full = planLoad([item({ l: 590, w: 235, h: 239 }), item({ qty: null })], "20");
  assert.deepEqual([full.fill.count, full.fill.reason], [0, "first_full"]);
  const ok = planLoad([item({ qty: null })], "20");
  assert.ok(ok.fill.count > 0);
  assert.equal(ok.fill.reason, undefined);
});

// ------------------------------------------------------------------ silindirik yükler
const cyl = (o) => item({ shape: "cyl", l: 100, w: 60, h: 60, orient: "up", stackable: true, tight: true, qty: 1, ...o }); // l = boy, w = çap
const kinds = (r) => new Set(all(r).map((p) => p.kind));

test("cylinder: upright uses d x d footprint and length as height", () => {
  const c = cyl({ l: 150, w: 50, orient: "up" });
  const r = planLoad([c], "20");
  const p = all(r)[0];
  assert.deepEqual([p.dx, p.dy, p.dz, p.kind, p.cyl], [50, 50, 150, "up", true]);
  checkValid(r);
});

test("cylinder: lying uses length x d footprint and d as height", () => {
  const c = cyl({ l: 150, w: 50, orient: "lying", qty: 5 });
  const r = planLoad([c], "20");
  assert.ok(all(r).every((p) => p.dz === 50 && Math.max(p.dx, p.dy) === 150 && Math.min(p.dx, p.dy) === 50 && p.kind !== "up"));
  checkValid(r);
});

test("cylinder: staggered packing fits more than the square grid and stays valid", () => {
  const tight = planLoad([cyl({ qty: null })], "20");
  const flat = planLoad([cyl({ qty: null, tight: false })], "20");
  assert.equal(flat.fill.count, 54);
  assert.ok(tight.fill.count > flat.fill.count, `${tight.fill.count} vs ${flat.fill.count}`);
  assert.ok(all(tight).some((p) => p.circ));
  checkValid(tight);
  checkValid(flat);
});

test("cylinder: staggering never makes the plan worse (falls back to the grid)", () => {
  const c = cyl({ l: 200, w: 100, qty: null });
  const tight = planLoad([c], "20");
  const flat = planLoad([{ ...c, tight: false }], "20");
  assert.ok(tight.fill.count >= flat.fill.count);
  checkValid(tight);
});

test("cylinder: gap is respected between staggered circles", () => {
  const r = planLoad([cyl({ qty: null })], "20", { gap: 3 });
  assert.ok(r.fill.count > 0);
  checkValid(r, 3);
});

test("cylinder: non-stackable stays on the floor with nothing on top", () => {
  const a = cyl({ qty: null, stackable: false });
  const r = planLoad([a], "20");
  assert.ok(all(r).every((p) => p.z === 0 && p.pallet === true));
  checkValid(r);
  const stackable = planLoad([cyl({ qty: null })], "20");
  assert.ok(stackable.fill.count > r.fill.count);
  assert.ok(all(stackable).some((p) => p.z > 0));
});

test("cylinder: stacked cylinders sit exactly on top of each other", () => {
  const r = planLoad([cyl({ qty: 40, tight: false })], "20");
  for (const p of all(r).filter((q) => q.z > 0)) {
    assert.ok(all(r).some((s) => s.cyl && s.x === p.x && s.y === p.y && s.dx === p.dx && s.dy === p.dy && s.z + s.dz === p.z));
  }
  checkValid(r);
});

test("cylinder: nothing but cylinders stacks on a cylinder, boxes never go on top", () => {
  const r = planLoad([cyl({ qty: 6, l: 100, w: 100, tight: false }), item({ l: 100, w: 100, h: 30, qty: 6 })], "20");
  const placements = all(r);
  for (const p of placements.filter((q) => !q.cyl && q.z > 0)) {
    assert.ok(!placements.some((s) => s.cyl && s.z + s.dz === p.z && s.x < p.x + p.dx && p.x < s.x + s.dx && s.y < p.y + p.dy && p.y < s.y + s.dy));
  }
  checkValid(r);
});

test("cylinder: a cylinder may sit on a flat box that fully covers its footprint", () => {
  const r = planLoad([item({ l: 120, w: 120, h: 120, qty: 1 }), cyl({ l: 80, w: 100, orient: "up", qty: 1 })], "20");
  assert.equal(all(r).length, 2);
  checkValid(r);
});

test("cylinder: 'any' orientation picks the best of up / lying and is never worse than either", () => {
  const base = { l: 120, w: 70, qty: null };
  const any = planLoad([cyl({ ...base, orient: "any" })], "20");
  const up = planLoad([cyl({ ...base, orient: "up" })], "20");
  const lying = planLoad([cyl({ ...base, orient: "lying" })], "20");
  assert.ok(any.fill.count >= Math.max(up.fill.count, lying.fill.count));
  checkValid(any);
});

test("cylinder: too big for the container is reported, rest is planned", () => {
  const huge = cyl({ l: 3000, w: 400, qty: 2 });
  const ok = cyl({ qty: 3 });
  const r = planLoad([huge, ok], "40");
  assert.equal(unplacedCount(r, huge.id), 2);
  assert.equal(placedCount(r, ok.id), 3);
});

test("cylinder: fixed quantity of a mixed list (cylinders and boxes, random) is valid", () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const rand = rng(seed);
    const items = [];
    for (let i = 0; i < 6; i++) {
      items.push(rand() < 0.5
        ? cyl({ l: 40 + rand() * 120, w: 30 + rand() * 50, orient: ["any", "up", "lying"][i % 3], stackable: rand() < 0.6, tight: rand() < 0.7, qty: 5 + Math.floor(rand() * 40) })
        : item({ l: 20 + rand() * 80, w: 20 + rand() * 60, h: 20 + rand() * 60, palletized: rand() < 0.3, qty: 5 + Math.floor(rand() * 40) }));
    }
    for (const key of ["20", "40hc"]) {
      const r = planLoad(items, key, { gap: seed === 5 ? 2 : 0 });
      checkValid(r, seed === 5 ? 2 : 0);
      for (const it of items) assert.equal(placedCount(r, it.id) + unplacedCount(r, it.id), it.qty);
    }
  }
});

test("cylinder: results are deterministic", () => {
  const items = [cyl({ qty: 30, orient: "any" }), cyl({ qty: null, l: 70, w: 45, orient: "any" })];
  assert.deepEqual(planLoad(items, "40"), planLoad(items, "40"));
});

test("cylinder: validator rejects overlapping circles and box-on-cylinder", () => {
  const C = CONTAINERS["20"];
  const c1 = { itemId: "a", x: 0, y: 0, z: 0, dx: 60, dy: 60, dz: 100, pallet: false, seq: 1, cyl: true, kind: "up", circ: true };
  const c2 = { ...c1, x: 40, y: 40, seq: 2 }; // bbox çakışır, daireler de çakışır (merkezler 56.6 < 60)
  assert.equal(validatePlan(C, [c1, c2]).ok, false);
  const c3 = { ...c1, x: 52, y: 30, seq: 2 }; // merkezler arası ~60.6 ≥ 60: bbox çakışır ama daireler çakışmaz
  assert.equal(validatePlan(C, [c1, c3]).ok, true);
  const box = { itemId: "b", x: 0, y: 0, z: 100, dx: 60, dy: 60, dz: 20, pallet: false, seq: 2 };
  assert.equal(validatePlan(C, [c1, box]).ok, false);
});
